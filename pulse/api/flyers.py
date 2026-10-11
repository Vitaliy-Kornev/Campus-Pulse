from django.http import HttpResponse
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from pulse.api.serializers import FlyerCreateSerializer, RepostSerializer
from pulse.models import Flyer
from pulse.services import analytics, limits, notifications, qr
from pulse.services.tags import tag_map

# Far above any real postering day; stops a runaway script from filling the database.
FLYERS_PER_DAY = 300


def flyer_payload(flyer, user):
    counts = analytics.flyer_counts(flyer)
    flyer.total_scans = counts["total"]
    if not user.is_staff:
        counts.pop("bots")  # bot counts are shown to admins only
    board, event = flyer.board, flyer.event
    return {
        "slug": flyer.slug,
        "label": flyer.label,
        "posted_at": flyer.posted_at,
        "removed_at": flyer.removed_at,
        "is_active": flyer.is_active,
        "days_posted": flyer.days_posted,
        "scans_per_day": flyer.scans_per_day,
        "destination": flyer.destination,
        "destination_override": flyer.destination_override,
        "scan_url": qr.scan_url(flyer),
        "short_url": qr.short_url(flyer),
        "board": {
            "id": board.id,
            "tag": tag_map().get(board.id, ""),
            "name": board.name,
            "area": board.area,
            "building": board.building,
            "floor": board.floor,
        },
        "event": {
            "id": event.id,
            "name": event.name,
            "event_type": event.event_type,
            "start_date": event.start_date,
            "end_date": event.end_date,
            "has_ended": event.has_ended,
        },
        "counts": counts,
        # Up for days with no scans while the event is still ahead: suggest moving it.
        "move_it": flyer.is_active
        and not event.has_ended
        and counts["total"] == 0
        and flyer.days_posted >= notifications.MOVE_IT_AFTER_DAYS,
        "devices": analytics.device_breakdown(flyer.scans.filter(is_bot=False)),
    }


@api_view(["POST"])
def flyer_create(request):
    limits.enforce(f"new-flyer:{request.user.pk}", FLYERS_PER_DAY, 86400, "new flyers today")
    serializer = FlyerCreateSerializer(data=request.data, user=request.user)
    serializer.is_valid(raise_exception=True)
    flyer = serializer.save()
    return Response({"slug": flyer.slug}, status=status.HTTP_201_CREATED)


@api_view(["GET"])
def flyer_detail(request, slug):
    return Response(flyer_payload(analytics.get_flyer_for(request.user, slug), request.user))


@api_view(["POST"])
def flyer_remove(request, slug):
    """Scans after removal still redirect and are reported as "after removal"."""
    flyer = analytics.get_flyer_for(request.user, slug)
    if flyer.removed_at is None:
        flyer.removed_at = timezone.now()
        flyer.save(update_fields=["removed_at"])
    return Response(flyer_payload(flyer, request.user))


@api_view(["POST"])
def flyer_repost(request, slug):
    """A new flyer, with a new code, on another board for the same event."""
    original = analytics.get_flyer_for(request.user, slug)
    limits.enforce(f"new-flyer:{request.user.pk}", FLYERS_PER_DAY, 86400, "new flyers today")
    serializer = RepostSerializer(data=request.data, original=original)
    serializer.is_valid(raise_exception=True)
    flyer = Flyer.objects.create(
        event=original.event,
        board=serializer.validated_data["board"],
        label=original.label,
        destination_override=original.destination_override,
    )
    if serializer.validated_data["mark_original_removed"] and original.removed_at is None:
        original.removed_at = timezone.now()
        original.save(update_fields=["removed_at"])
    return Response({"slug": flyer.slug}, status=status.HTTP_201_CREATED)


@api_view(["GET"])
def flyer_hourly(request, slug):
    flyer = analytics.get_flyer_for(request.user, slug)
    rng = analytics.resolve_range(request.GET, default="all")
    return Response(analytics.hourly(flyer.scans.filter(is_bot=False).filter(rng.scan_q())))


@api_view(["GET"])
def flyer_timeseries(request, slug):
    flyer = analytics.get_flyer_for(request.user, slug)
    rng = analytics.resolve_range(request.GET, default="all")
    scans = flyer.scans.filter(is_bot=False).filter(rng.scan_q())
    if rng.start is None:
        # Start the chart on the day the flyer went up rather than the first scan.
        rng = analytics.DateRange(timezone.localtime(flyer.posted_at).date(), None, "custom")
    return Response(analytics.timeseries(scans, rng))


def _white_background(request):
    return request.GET.get("background") == "white"


def _qr_response(content, content_type, flyer, extension, request):
    response = HttpResponse(content, content_type=content_type)
    if request.GET.get("download"):
        suffix = "-white" if _white_background(request) else ""
        response["Content-Disposition"] = f'attachment; filename="campus-pulse-{flyer.slug}{suffix}.{extension}"'
    response["Cache-Control"] = "private, max-age=3600"
    return response


@api_view(["GET"])
def qr_png(request, slug):
    flyer = analytics.get_flyer_for(request.user, slug)
    return _qr_response(qr.qr_png(flyer, white_background=_white_background(request)), "image/png", flyer, "png", request)


@api_view(["GET"])
def qr_svg(request, slug):
    flyer = analytics.get_flyer_for(request.user, slug)
    return _qr_response(qr.qr_svg(flyer, white_background=_white_background(request)), "image/svg+xml", flyer, "svg", request)
