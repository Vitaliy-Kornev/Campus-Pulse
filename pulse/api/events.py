import csv
import datetime

from django.http import StreamingHttpResponse
from django.utils import timezone
from django.utils.text import slugify
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from pulse.api.serializers import EventListSerializer, EventSerializer, FlyerRowSerializer
from pulse.models import Board, Scan
from pulse.services import analytics, limits, recommendations
from pulse.services.tags import tag_map


def _tagged(rows):
    """Board rows from analytics with each board's tag added."""
    tags = tag_map()
    return [{**row, "tag": tags.get(row["board_id"], "")} for row in rows]


@api_view(["GET", "POST"])
def event_list(request):
    if request.method == "POST":
        club = analytics.active_club(request.user)
        if club is None:
            return Response(
                {"non_field_errors": ["Create or join a club before adding events."]}, status=status.HTTP_400_BAD_REQUEST
            )
        limits.enforce(f"new-event:{request.user.pk}", 50, 86400, "new events today")
        serializer = EventSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        # A double-submit or a retry after a dropped connection mustn't create the event twice.
        data = serializer.validated_data
        if club.events.filter(name__iexact=data["name"], start_date=data.get("start_date")).exists():
            return Response(
                {"name": [f"Your club already has an event called {data['name']} on that date. Choose it from the Event list instead."]},
                status=status.HTTP_400_BAD_REQUEST,
            )
        event = serializer.save(club=club, created_by=request.user)
        return Response(EventSerializer(event).data, status=status.HTTP_201_CREATED)
    events = analytics.events_with_stats(request.user)
    return Response(EventListSerializer(events, many=True).data)


@api_view(["GET", "PATCH"])
def event_detail(request, pk):
    event = analytics.get_event_for(request.user, pk)
    if request.method == "PATCH":
        serializer = EventSerializer(event, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        event = serializer.save()
    return Response(EventSerializer(event).data)


@api_view(["GET"])
def event_summary(request, pk):
    event = analytics.get_event_for(request.user, pk)
    rng = analytics.resolve_range(request.GET, default="30d")
    summary = analytics.event_summary(event, rng)
    if summary["best_board"]:
        summary["best_board"] = _tagged([summary["best_board"]])[0]
    return Response(summary)


@api_view(["GET"])
def event_flyers(request, pk):
    """Lifetime totals per flyer, newest first. Bots excluded."""
    event = analytics.get_event_for(request.user, pk)
    flyers = analytics.flyer_table(event.flyers.all()).order_by("-posted_at")
    return Response(FlyerRowSerializer(flyers, many=True).data)


@api_view(["GET"])
def event_timeseries(request, pk):
    event = analytics.get_event_for(request.user, pk)
    rng = analytics.resolve_range(request.GET, default="30d")
    return Response(analytics.timeseries(analytics.event_scans(event, rng), rng))


@api_view(["GET"])
def event_by_board(request, pk):
    event = analytics.get_event_for(request.user, pk)
    rng = analytics.resolve_range(request.GET, default="30d")
    return Response(_tagged(analytics.by_board(analytics.event_scans(event, rng))))


class _Echo:
    def write(self, value):
        return value


@api_view(["GET"])
def export_csv(request, pk):
    """Every non-bot scan for the event. No visitor hashes."""
    event = analytics.get_event_for(request.user, pk)
    scans = (
        Scan.objects.filter(flyer__event=event, is_bot=False)
        .select_related("flyer", "flyer__board")
        .order_by("scanned_at")
    )
    writer = csv.writer(_Echo())

    def rows():
        yield writer.writerow(["flyer_slug", "board_name", "scanned_at", "device_type", "after_removal"])
        for scan in scans.iterator(chunk_size=2000):
            removed_at = scan.flyer.removed_at
            yield writer.writerow([
                scan.flyer.slug,
                scan.flyer.board.name,
                timezone.localtime(scan.scanned_at).isoformat(),
                scan.device_type,
                "yes" if removed_at and scan.scanned_at > removed_at else "no",
            ])

    filename = f"campus-pulse-{slugify(event.name) or event.pk}-scans.csv"
    response = StreamingHttpResponse(rows(), content_type="text/csv")
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    return response


def _days_up(flyer, event):
    """Whole days a flyer was up while its event was still ahead (minimum 1)."""
    end = flyer.removed_at or timezone.now()
    if event.end_date:
        over = timezone.make_aware(datetime.datetime.combine(event.end_date + datetime.timedelta(days=1), datetime.time()))
        end = min(end, over)
    return max(1, int((end - flyer.posted_at).total_seconds() // 86400))


@api_view(["GET"])
def event_recap(request, pk):
    """How an event's posters did: per-board results, what worked, and where to post next time."""
    event = analytics.get_event_for(request.user, pk)
    tags = tag_map()
    flyers = analytics.flyer_table(event.flyers.all()).order_by("-total_scans")
    boards = []
    for f in flyers:
        days = _days_up(f, event)
        boards.append({
            "slug": f.slug,
            "board_id": f.board_id,
            "board": f.board.name,
            "tag": tags.get(f.board_id, ""),
            "label": f.label,
            "scans": f.total_scans,
            "unique": f.unique_scans,
            "days_up": days,
            "per_day": round(f.total_scans / days, 1),
        })
    scans = analytics.human_scans().filter(flyer__event=event)
    totals = analytics.totals(scans)
    before = scans.filter(scanned_at__date__lt=event.start_date).count() if event.start_date else None
    used = {b["board_id"] for b in boards}
    suggestions = recommendations.recommend_boards(event.club, event.event_type, exclude_board_ids=used)[:3]
    names = dict(Board.objects.filter(pk__in=[s["board_id"] for s in suggestions]).values_list("pk", "name"))
    return Response({
        "has_ended": event.has_ended,
        "total": totals["total"],
        "unique": totals["unique"],
        "flyers": len(boards),
        "before_start": before,
        "boards": boards,
        "best": boards[0] if boards and boards[0]["scans"] else None,
        "no_scans": [b for b in boards if b["scans"] == 0],
        "next_time": [{**s, "tag": tags.get(s["board_id"], ""), "board": names.get(s["board_id"], "")} for s in suggestions],
    })


@api_view(["GET"])
def board_recommendations(request):
    """Recommended boards for the user's club and ?event_type=. Tiers and reasons only; empty without both."""
    event_type = request.GET.get("event_type") or None
    club = analytics.active_club(request.user)
    return Response(recommendations.recommend_boards(club, event_type))
