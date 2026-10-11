"""Clubs: create one, find one and ask to join, approve officers, edit the profile.

An account can be an officer of several clubs and switches between them; every screen is about
one club at a time, and clubs never see each other's events. Requests to join stay pending until
an active officer approves them; pending members see nothing of the club's events.
"""

from django.db import transaction
from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from pulse import taxonomy
from pulse.models import Club, Membership, Notification
from pulse.services import analytics, limits, notifications


class ClubSerializer(serializers.ModelSerializer):
    name = serializers.CharField(max_length=150)
    club_type = serializers.ChoiceField(choices=taxonomy.CLUB_TYPES)
    fields = serializers.ListField(child=serializers.ChoiceField(choices=taxonomy.FIELDS), allow_empty=False, max_length=8)

    class Meta:
        model = Club
        fields = ("id", "name", "club_type", "fields", "description")

    def validate_name(self, value):
        value = " ".join(value.split())
        others = Club.objects.filter(name__iexact=value)
        if self.instance is not None:
            others = others.exclude(pk=self.instance.pk)
        if others.exists():
            raise serializers.ValidationError("A club with this name already exists. Find it and ask to join instead.")
        return value

    def validate_fields(self, value):
        return list(dict.fromkeys(value))  # drop duplicates, keep order


def _club_summary(club):
    return {"id": club.id, "name": club.name, "club_type": club.club_type, "fields": club.fields}


def clubs_payload(user):
    """The club the user is working in, plus every club they're in or waiting to join."""
    current = analytics.current_membership(user)
    memberships = user.memberships.select_related("club").order_by("club__name") if user.is_authenticated else []
    return {
        "club": _club_summary(current.club) if current else None,
        "clubs": [{**_club_summary(m.club), "status": m.status} for m in memberships],
    }


def _open(membership):
    """Make this the user's current club."""
    membership.last_opened_at = timezone.now()
    membership.save(update_fields=["last_opened_at"])
    membership.user.__dict__.pop("_current_membership", None)


def _require_officer(request):
    club = analytics.active_club(request.user)
    if club is None:
        return None, Response({"detail": "Only active officers of a club can do this."}, status=status.HTTP_403_FORBIDDEN)
    return club, None


@api_view(["GET"])
def taxonomy_view(request):
    return Response(taxonomy.as_json())


@api_view(["GET", "POST"])
def club_list(request):
    """GET ?q=: find a club to join (name and type only). POST: create a club and become its first officer."""
    if request.method == "POST":
        limits.enforce(f"new-club:{request.user.pk}", 10, 86400, "new clubs today")
        serializer = ClubSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            club = serializer.save()
            # A new club opens straight away, even for officers already in other clubs.
            Membership.objects.create(club=club, user=request.user, status=Membership.ACTIVE, last_opened_at=timezone.now())
        return Response(ClubSerializer(club).data, status=status.HTTP_201_CREATED)

    query = request.GET.get("q", "").strip()
    clubs = Club.objects.annotate(officers=Count("memberships", filter=Q(memberships__status=Membership.ACTIVE)))
    if query:
        clubs = clubs.filter(name__icontains=query)
    mine = dict(request.user.memberships.values_list("club_id", "status"))
    return Response([
        {"id": c.id, "name": c.name, "club_type": c.club_type, "officers": c.officers, "your_status": mine.get(c.id)}
        for c in clubs.order_by("name")[:20]
    ])


@api_view(["POST"])
def join_club(request, pk):
    club = get_object_or_404(Club, pk=pk)
    # Each request lands in another club's notifications, so cap them.
    limits.enforce(f"join:{request.user.pk}", 20, 86400, "join requests today")
    if request.user.memberships.filter(club=club).exists():
        return Response(
            {"non_field_errors": [f"You're already in {club.name} or waiting to join it."]}, status=status.HTTP_400_BAD_REQUEST
        )
    membership = Membership.objects.create(club=club, user=request.user, status=Membership.PENDING)
    who = request.user.get_full_name() or request.user.username
    notifications.notify(
        club, Notification.JOIN_REQUEST, f"membership:{membership.pk}", f"{who} asked to join {club.name}", "Approve or decline on your club page.", "/club"
    )
    return Response(clubs_payload(request.user), status=status.HTTP_201_CREATED)


@api_view(["POST"])
def open_club(request, pk):
    """Switch to another club this user is an active officer of."""
    membership = get_object_or_404(request.user.memberships, club_id=pk, status=Membership.ACTIVE)
    _open(membership)
    return Response(clubs_payload(request.user))


@api_view(["POST"])
def leave_club(request, pk):
    """Cancel a pending request, or leave as an officer (not as the last one). Other clubs are untouched."""
    membership = request.user.memberships.filter(club_id=pk).select_related("club").first()
    if membership is None:
        return Response(status=status.HTTP_204_NO_CONTENT)
    if membership.status == Membership.ACTIVE:
        others = membership.club.memberships.filter(status=Membership.ACTIVE).exclude(pk=membership.pk)
        if not others.exists():
            return Response(
                {"non_field_errors": ["You're the club's only officer. Approve another officer before leaving, so the club keeps its history."]},
                status=status.HTTP_400_BAD_REQUEST,
            )
    membership.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


def club_payload(club, user):
    members = club.memberships.select_related("user")
    return {
        **ClubSerializer(club).data,
        "members": [
            {
                "id": m.id,
                "username": m.user.username,
                "name": m.user.get_full_name(),
                "email": m.user.email,
                "status": m.status,
                "joined": m.created_at,
                "is_you": m.user_id == user.id,
            }
            for m in members
        ],
    }


@api_view(["GET", "PATCH"])
def my_club(request):
    club, error = _require_officer(request)
    if error:
        return error
    if request.method == "PATCH":
        serializer = ClubSerializer(club, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        club = serializer.save()
    return Response(club_payload(club, request.user))


@api_view(["POST"])
def member_action(request, pk, action):
    """Approve or decline a pending request, or remove another officer."""
    club, error = _require_officer(request)
    if error:
        return error
    membership = get_object_or_404(Membership, pk=pk, club=club)
    if membership.user_id == request.user.id:
        return Response({"non_field_errors": ["Use Leave club to remove yourself."]}, status=status.HTTP_400_BAD_REQUEST)
    if action == "approve" and membership.status == Membership.PENDING:
        membership.status = Membership.ACTIVE
        membership.save(update_fields=["status"])
    elif action in ("decline", "remove"):
        membership.delete()
    else:
        return Response({"non_field_errors": ["That action doesn't apply to this member."]}, status=status.HTTP_400_BAD_REQUEST)
    Notification.objects.filter(club=club, kind=Notification.JOIN_REQUEST, key=f"membership:{pk}").delete()
    return Response(club_payload(club, request.user))


def _officer_clubs(user):
    return Club.objects.filter(memberships__user=user, memberships__status=Membership.ACTIVE)


@api_view(["GET"])
def notification_list(request):
    """Notices from every club this user is an officer of, newest first, each labeled with its club."""
    clubs = list(_officer_clubs(request.user))
    for club in clubs:
        notifications.refresh(club)
    items = (
        Notification.objects.filter(club__in=clubs)
        .exclude(dismissed_by=request.user)
        .select_related("club")
        .prefetch_related("read_by")[:30]
    )
    payload = [notifications.as_json(n, request.user) for n in items]
    return Response({"unread": sum(1 for n in payload if not n["read"]), "items": payload})


def _chosen_notices(request):
    """This officer's notices: all of them, or just {"ids": [...]}."""
    items = Notification.objects.filter(club__in=_officer_clubs(request.user))
    ids = request.data.get("ids")
    if isinstance(ids, list):
        items = items.filter(pk__in=[i for i in ids if isinstance(i, int)])
    return items


@api_view(["POST"])
def notifications_read(request):
    """Mark notifications read for this officer: all of them, or {"ids": [...]}."""
    request.user.read_notifications.add(*_chosen_notices(request))
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(["POST"])
def notifications_dismiss(request):
    """Close notifications for this officer only (the club's other officers still see them)."""
    items = list(_chosen_notices(request))
    request.user.dismissed_notifications.add(*items)
    request.user.read_notifications.add(*items)
    return Response(status=status.HTTP_204_NO_CONTENT)
