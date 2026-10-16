"""Board recommendations for a club's next event, learned from past posters of similar clubs.

Nothing is recommended until we know who's asking: the club's profile (what its members study)
and the kind of event. Then only evidence counts: past flyers from the asking club itself, or from
clubs like it (shared field of study, same college, or same kind of club). Flyers from unrelated
clubs are ignored, however busy their boards were. Each flyer contributes its scan rate (human
scans per day it was up, counted only until its event ended), weighted by how similar it is; the
same kind of event weighs more. A board is recommended only if that evidence beats the campus
average after being pulled toward it, so one lucky poster can't top the list.

Privacy: callers only ever get a tier ("strong" / "good") and a generic reason ("Strong with
Computer science clubs"). Never another club's name, event, or numbers.
"""

import datetime
from collections import defaultdict
from dataclasses import dataclass, field

from django.core.cache import cache
from django.db.models import Count, Q
from django.utils import timezone

from pulse.models import Board, Flyer
from pulse.taxonomy import CLUB_TYPE_LABELS, EVENT_TYPE_LABELS, FIELD_COLLEGE, FIELD_LABELS

# Similarity weights. A flyer whose club has none of the club weights doesn't count at all.
W_SHARED_FIELD = 3.0
W_SAME_COLLEGE = 1.0
W_SAME_CLUB_TYPE = 1.0
W_SAME_EVENT_TYPE = 2.0
W_OWN_CLUB = 3.0
# How many "average flyers" of campus-wide prior each board starts with (shrinkage).
PRIOR_WEIGHT = 3.0
# Club kinds too broad to make two clubs alike on their own.
BROAD_CLUB_TYPES = {"other", "academic"}
CACHE_SECONDS = 60 * 60
STRONG_COUNT = 5
GOOD_COUNT = 7


@dataclass
class _Evidence:
    weighted_rate: float = 0.0
    weight: float = 0.0
    # reason key -> summed weight × rate, to pick the most supported reason
    reasons: dict = field(default_factory=lambda: defaultdict(float))


def _rate(flyer, now):
    """Human scans per day the flyer was up, stopping when it came down or its event ended."""
    end = flyer.removed_at or now
    if flyer.event.end_date:
        event_over = timezone.make_aware(datetime.datetime.combine(flyer.event.end_date + datetime.timedelta(days=1), datetime.time()))
        end = min(end, event_over)
    days = max(1.0, (end - flyer.posted_at).total_seconds() / 86400)
    return flyer.human / days


def profile_ready(club):
    """Whether we know enough about the club to compare it with others."""
    return club is not None and bool(club.fields)


def _similarity(club, event_type, other_event):
    """Weight and reasons this past flyer supports for the asking club; weight 0 if its club isn't similar."""
    weight, reasons = 0.0, []
    other_club = other_event.club
    if other_club.pk == club.pk:
        weight += W_OWN_CLUB
        reasons.append(("own", None))
    shared = set(club.fields) & set(other_club.fields) - {"all-majors"}
    if shared:
        weight += W_SHARED_FIELD
        reasons.extend(("field", f) for f in shared)
    else:
        colleges = {FIELD_COLLEGE.get(f) for f in club.fields} & {FIELD_COLLEGE.get(f) for f in other_club.fields} - {None, "Any field"}
        if colleges:
            weight += W_SAME_COLLEGE
            reasons.extend(("college", c) for c in colleges)
    # Nearly every academic club is "academic"; for them, what members study decides similarity.
    if club.club_type not in BROAD_CLUB_TYPES and other_club.club_type == club.club_type:
        weight += W_SAME_CLUB_TYPE
        reasons.append(("club_type", club.club_type))
    if weight == 0:
        return 0.0, []  # an unrelated club: its success says nothing about this one
    if event_type != "other" and other_event.event_type == event_type:
        weight += W_SAME_EVENT_TYPE
        reasons.append(("event_type", event_type))
    return weight, reasons


def _reason_text(key, value):
    if key == "own":
        return "Worked for your past events"
    if key == "field":
        return f"Strong with {FIELD_LABELS.get(value, value)} clubs"
    if key == "college":
        return f"Popular with {value} clubs"
    if key == "club_type":
        return f"Popular with {CLUB_TYPE_LABELS.get(value, value).lower()} clubs"
    return f"Works for {EVENT_TYPE_LABELS.get(value, value).lower()} events"


def recommend_boards(club, event_type, exclude_board_ids=()):
    """[{board_id, tier, reason}] best first: up to STRONG_COUNT strong and GOOD_COUNT good boards.

    Empty until the club has a profile and the kind of event is known, and empty when no similar
    club has had success anywhere yet. Rankings read every past flyer on campus, so they're cached
    for an hour per club profile and kind of event; a changed profile gets fresh ones at once.
    """
    if not profile_ready(club) or not event_type:
        return []
    key = f"recs:{club.pk}:{club.club_type}:{','.join(sorted(club.fields))}:{event_type}"
    ranked = cache.get(key)
    if ranked is None:
        ranked = _rank_boards(club, event_type)
        cache.set(key, ranked, CACHE_SECONDS)
    # Checked every time, so a board retired since the rankings were cached drops out at once.
    active = set(Board.objects.filter(is_active=True, pk__in=[b for b, _ in ranked]).values_list("pk", flat=True))
    ranked = [(board_id, reason) for board_id, reason in ranked if board_id in active and board_id not in exclude_board_ids]
    return [
        {"board_id": board_id, "tier": "strong" if i < STRONG_COUNT else "good", "reason": reason}
        for i, (board_id, reason) in enumerate(ranked[: STRONG_COUNT + GOOD_COUNT])
    ]


def _rank_boards(club, event_type):
    """[(board_id, reason)] for every board whose similar-club evidence beats the campus average, best first."""
    now = timezone.now()
    flyers = (
        Flyer.objects.filter(board__is_active=True)
        .select_related("event", "event__club")
        .annotate(human=Count("scans", filter=Q(scans__is_bot=False)))
    )
    evidence = defaultdict(_Evidence)
    rates = []
    for flyer in flyers:
        rate = _rate(flyer, now)
        rates.append(rate)
        weight, reasons = _similarity(club, event_type, flyer.event)
        if not weight:
            continue
        e = evidence[flyer.board_id]
        e.weighted_rate += weight * rate
        e.weight += weight
        for reason in reasons:
            e.reasons[reason] += weight * rate
    if not rates:
        return []
    campus_mean = sum(rates) / len(rates)

    scored = []
    for board_id, e in evidence.items():
        score = (e.weighted_rate + PRIOR_WEIGHT * campus_mean) / (e.weight + PRIOR_WEIGHT)
        if score <= campus_mean:
            continue
        (key, value), _ = max(e.reasons.items(), key=lambda item: item[1])
        scored.append((score, board_id, _reason_text(key, value)))
    scored.sort(reverse=True)
    return [(board_id, reason) for _, board_id, reason in scored]
