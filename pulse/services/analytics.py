"""Analytics queries and ownership scoping.

Counting rules used everywhere:
- Total scans  = scans with is_bot=False.
- Unique scans = distinct visitor_hash with is_bot=False (the hash rotates daily,
  so one visitor counts once per day within the scope being counted).
Bot scans are stored but never included in user-facing numbers.
"""

import datetime
from collections import defaultdict
from dataclasses import dataclass

from django.db.models import Count, F, Q
from django.db.models.functions import ExtractHour, TruncDate
from django.http import Http404
from django.shortcuts import get_object_or_404
from django.utils import timezone

from pulse.models import Board, Campaign, Flyer, Scan, days_between

RANGE_CHOICES = (
    ("7d", "Last 7 days"),
    ("30d", "Last 30 days"),
    ("all", "All time"),
    ("custom", "Custom"),
)


# --- Ownership scoping -------------------------------------------------------


def visible_campaigns(user):
    qs = Campaign.objects.all()
    return qs if user.is_staff else qs.filter(owner=user)


def visible_flyers(user):
    qs = Flyer.objects.all()
    return qs if user.is_staff else qs.filter(campaign__owner=user)


def get_campaign_for(user, pk):
    """Another user's campaign is a 404, never a 403."""
    return get_object_or_404(visible_campaigns(user).select_related("owner"), pk=pk)


def get_flyer_for(user, slug):
    return get_object_or_404(visible_flyers(user).select_related("campaign", "board"), slug=slug)


# --- Date ranges -------------------------------------------------------------


@dataclass(frozen=True)
class DateRange:
    start: datetime.date | None
    end: datetime.date | None
    key: str = "all"

    def as_query(self):
        params = {"range": self.key}
        if self.key == "custom":
            if self.start:
                params["start"] = self.start.isoformat()
            if self.end:
                params["end"] = self.end.isoformat()
        return params

    def scan_q(self, prefix=""):
        """Q filtering scans by local (campus time zone) date."""
        q = Q()
        if self.start:
            q &= Q(**{f"{prefix}scanned_at__date__gte": self.start})
        if self.end:
            q &= Q(**{f"{prefix}scanned_at__date__lte": self.end})
        return q


def _parse_date(value):
    try:
        return datetime.date.fromisoformat(value) if value else None
    except ValueError:
        return None


def resolve_range(params, default="all"):
    """Build a DateRange from ?range=7d|30d|all|custom or ?start=&end= (YYYY-MM-DD)."""
    start, end = _parse_date(params.get("start")), _parse_date(params.get("end"))
    key = params.get("range") or ("custom" if (start or end) else default)
    today = timezone.localdate()
    if key == "7d":
        return DateRange(today - datetime.timedelta(days=6), today, key)
    if key == "30d":
        return DateRange(today - datetime.timedelta(days=29), today, key)
    if key == "custom":
        if start and end and end < start:
            start, end = end, start
        return DateRange(start, end, key)
    return DateRange(None, None, "all")


# --- Shared building blocks ----------------------------------------------------


def human_scans():
    return Scan.objects.filter(is_bot=False)


def campaign_scans(campaign, rng):
    return human_scans().filter(flyer__campaign=campaign).filter(rng.scan_q())


def totals(scans):
    result = scans.aggregate(total=Count("id"), unique=Count("visitor_hash", distinct=True))
    return {"total": result["total"] or 0, "unique": result["unique"] or 0}


def timeseries(scans, rng):
    """Scans per local day, zero-filled across the range: [{date, total, unique}]."""
    rows = (
        scans.annotate(day=TruncDate("scanned_at"))
        .values("day")
        .annotate(total=Count("id"), unique=Count("visitor_hash", distinct=True))
        .order_by("day")
    )
    by_day = {row["day"]: row for row in rows}
    today = timezone.localdate()
    start = rng.start or (min(by_day) if by_day else today)
    end = rng.end or max([today, *by_day.keys()])
    series = []
    day = start
    while day <= end:
        row = by_day.get(day)
        series.append({
            "date": day.isoformat(),
            "total": row["total"] if row else 0,
            "unique": row["unique"] if row else 0,
        })
        day += datetime.timedelta(days=1)
    return series


def by_board(scans):
    rows = (
        scans.values("flyer__board_id", "flyer__board__name")
        .annotate(total=Count("id"), unique=Count("visitor_hash", distinct=True))
        .order_by("-total", "flyer__board__name")
    )
    return [
        {"board_id": r["flyer__board_id"], "board": r["flyer__board__name"], "total": r["total"], "unique": r["unique"]}
        for r in rows
    ]


def hourly(scans):
    """Scans by local hour of day, 0 to 23."""
    rows = scans.annotate(hour=ExtractHour("scanned_at")).values("hour").annotate(total=Count("id")).order_by("hour")
    counts = {r["hour"]: r["total"] for r in rows}
    return [{"hour": h, "total": counts.get(h, 0)} for h in range(24)]


def device_breakdown(scans):
    rows = scans.values("device_type").annotate(total=Count("id")).order_by("-total")
    return [{"device_type": r["device_type"] or "unknown", "total": r["total"]} for r in rows]


def flyer_counts(flyer):
    """Lifetime totals for one flyer, including the bot count (shown to admins only)."""
    human = Q(is_bot=False)
    aggregates = {
        "total": Count("id", filter=human),
        "unique": Count("visitor_hash", filter=human, distinct=True),
        "bots": Count("id", filter=Q(is_bot=True)),
    }
    if flyer.removed_at:
        aggregates["after_removal"] = Count("id", filter=human & Q(scanned_at__gt=flyer.removed_at))
    return {"after_removal": 0, **flyer.scans.aggregate(**aggregates)}


def flyer_table(flyers):
    """Annotate flyers with lifetime totals for tables. Bots excluded."""
    human = Q(scans__is_bot=False)
    return flyers.select_related("board", "campaign").annotate(
        total_scans=Count("scans", filter=human),
        unique_scans=Count("scans__visitor_hash", filter=human, distinct=True),
        after_removal_scans=Count("scans", filter=human & Q(scans__scanned_at__gt=F("removed_at"))),
    )


# --- Map ---------------------------------------------------------------------


def boards_geojson(user, rng, campaign=None):
    """FeatureCollection of boards (active, plus retired for admins) with scan counts scoped to the user."""
    campaigns = visible_campaigns(user)
    if campaign is not None:
        campaigns = campaigns.filter(pk=campaign.pk)

    scans = human_scans().filter(rng.scan_q())
    flyers = Flyer.objects.active()
    if campaign is not None or not user.is_staff:
        scans = scans.filter(flyer__campaign__in=campaigns)
        flyers = flyers.filter(campaign__in=campaigns)

    board_counts = {
        row["flyer__board_id"]: row
        for row in scans.values("flyer__board_id")
        .annotate(total=Count("id"), unique=Count("visitor_hash", distinct=True))
        .order_by()
    }

    flyers_by_board = defaultdict(list)
    flyer_rows = (
        flyers.select_related("campaign")
        .annotate(scan_count=Count("scans", filter=Q(scans__is_bot=False) & rng.scan_q("scans__")))
        .order_by("-scan_count", "posted_at")
    )
    for flyer in flyer_rows:
        flyers_by_board[flyer.board_id].append({
            "id": flyer.id,
            "slug": flyer.slug,
            "campaign": flyer.campaign.name,
            "campaign_id": flyer.campaign_id,
            "label": flyer.label,
            "scans": flyer.scan_count,
        })

    features = []
    # Retired boards are shown (muted) to admins only.
    boards = Board.objects.all() if user.is_staff else Board.objects.filter(is_active=True)
    for board in boards.order_by("area", "name"):
        counts = board_counts.get(board.id, {})
        board_flyers = flyers_by_board.get(board.id, [])
        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [float(board.longitude), float(board.latitude)]},
            "properties": {
                "id": board.id,
                "name": board.name,
                "area": board.area,
                "building": board.building,
                "floor": board.floor,
                "description": board.description,
                "board_count": board.approx_board_count,
                "is_active": board.is_active,
                "total_scans": counts.get("total", 0),
                "unique_scans": counts.get("unique", 0),
                "active_flyer_count": len(board_flyers),
                "flyers": board_flyers,
            },
        })
    return {"type": "FeatureCollection", "features": features}


# --- Campaign dashboard ----------------------------------------------------------


def campaigns_with_stats(user):
    return visible_campaigns(user).select_related("owner").annotate(
        flyer_count=Count("flyers", distinct=True),
        active_flyer_count=Count("flyers", filter=Q(flyers__removed_at__isnull=True), distinct=True),
        total_scans=Count("flyers__scans", filter=Q(flyers__scans__is_bot=False)),
    )


def campaign_summary(campaign, rng):
    scans = campaign_scans(campaign, rng)
    boards = by_board(scans)
    return {
        **totals(scans),
        "active_flyers": campaign.flyers.active().count(),
        "best_board": boards[0] if boards else None,
    }


# --- Leaderboard ---------------------------------------------------------------


def board_leaderboard(user):
    """Boards with lifetime human scans, flyers hosted, and avg scans per flyer per day.

    Admins see every campaign's numbers and retired boards. Advertisers see active boards
    with numbers from their own campaigns only, so a new account starts at zero.
    """
    if user.is_staff:
        boards_qs, own = Board.objects.all(), Q()
        flyers = Flyer.objects.all()
    else:
        boards_qs = Board.objects.filter(is_active=True)
        own = Q(flyers__campaign__owner=user)
        flyers = Flyer.objects.filter(campaign__owner=user)
    boards = list(
        boards_qs.annotate(
            lifetime_scans=Count("flyers__scans", filter=Q(flyers__scans__is_bot=False) & own),
            flyer_count=Count("flyers", filter=own, distinct=True),
        ).order_by("-lifetime_scans", "name")
    )
    flyer_days = defaultdict(int)
    for row in flyers.values("board_id", "posted_at", "removed_at"):
        flyer_days[row["board_id"]] += days_between(row["posted_at"], row["removed_at"])
    for board in boards:
        days = flyer_days.get(board.id, 0)
        board.flyer_days = days
        board.avg_scans_per_flyer_day = round(board.lifetime_scans / days, 2) if days else 0
    return boards


def require_visible_campaign(user, campaign_id):
    """Resolve an optional ?campaign= filter; invalid or foreign IDs are a 404."""
    if not campaign_id:
        return None
    try:
        return get_campaign_for(user, int(campaign_id))
    except (TypeError, ValueError):
        raise Http404("Unknown campaign")
