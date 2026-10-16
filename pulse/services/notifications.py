"""On-site notifications for a club's officers. Never emailed.

Each notice is unique per (club, kind, key), so creating one twice is a no-op: that's what keeps
first-scan alerts to one per event rather than one per scan. Move-it nudges and recaps have no
scan to trigger them, so `refresh` creates any that are due whenever officers open their list.
"""

import datetime

from django.core.cache import cache
from django.db.models import Count, Q
from django.utils import timezone

from pulse.models import Event, Flyer, Notification

# A flyer up this long with no scans, before its event, gets a "move it?" nudge.
MOVE_IT_AFTER_DAYS = 5
REFRESH_SECONDS = 10 * 60


def notify(club, kind, key, title, body="", link=""):
    notice, _ = Notification.objects.get_or_create(
        club=club, kind=kind, key=key, defaults={"title": title[:200], "body": body[:300], "link": link[:200]}
    )
    return notice


def notify_first_scan(event):
    notify(
        event.club,
        Notification.FIRST_SCAN,
        f"event:{event.pk}",
        f"First scan for {event.name}",
        "Someone scanned one of your posters. Your flyers are working.",
        f"/events/{event.pk}",
    )


def refresh(club):
    """Create any move-it nudges and event recaps that have come due for this club.

    Runs when officers open their list, which every open tab polls each minute; nothing here is
    due more than once a day, so check each club at most every REFRESH_SECONDS.
    """
    if not cache.add(f"notices-refreshed:{club.pk}", True, REFRESH_SECONDS):
        return
    today = timezone.localdate()
    cutoff = timezone.now() - datetime.timedelta(days=MOVE_IT_AFTER_DAYS)
    quiet = (
        Flyer.objects.active()
        .filter(event__club=club, posted_at__lte=cutoff)
        .filter(Q(event__end_date__isnull=True) | Q(event__end_date__gte=today))
        .annotate(human=Count("scans", filter=Q(scans__is_bot=False)))
        .filter(human=0)
        .select_related("event", "board")
    )
    for flyer in quiet:
        notify(
            club,
            Notification.MOVE_IT,
            f"flyer:{flyer.slug}",
            f"No scans at {flyer.board.name} yet",
            f"Your {flyer.event.name} poster has been up {MOVE_IT_AFTER_DAYS}+ days with no scans. Move it to a recommended board?",
            f"/flyers/{flyer.slug}",
        )
    ended = Event.objects.filter(club=club, end_date__lt=today, flyers__isnull=False).distinct()
    for event in ended:
        notify(
            club,
            Notification.RECAP,
            f"event:{event.pk}",
            f"{event.name} is over: see how your posters did",
            "Your recap shows the boards that worked, the ones that didn't, and where to post next time.",
            f"/events/{event.pk}",
        )


def as_json(notice, user):
    return {
        "id": notice.id,
        "kind": notice.kind,
        "title": notice.title,
        "body": notice.body,
        "link": notice.link,
        "club": {"id": notice.club_id, "name": notice.club.name},
        "created_at": notice.created_at,
        "read": user in notice.read_by.all(),
    }
