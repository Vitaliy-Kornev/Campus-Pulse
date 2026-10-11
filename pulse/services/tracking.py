"""Scan tracking: visitor hashing, bot detection, and device detection."""

import datetime
import hashlib
import logging

from django.conf import settings
from django.utils import timezone

from pulse.models import Event, Scan
from pulse.services import notifications

logger = logging.getLogger(__name__)

MAX_USER_AGENT_LENGTH = 500
# Rescans by the same visitor of the same flyer within this window count once.
REPEAT_SCAN_WINDOW_SECONDS = 10 * 60

# Crawlers and link-preview bots, matched case-insensitively as substrings.
BOT_USER_AGENT_PATTERNS = (
    "bot",
    "crawler",
    "spider",
    "facebookexternalhit",
    "slackbot",
    "discordbot",
    "twitterbot",
    "whatsapp",
    "telegrambot",
    "linkedinbot",
    "applebot",
    "googlebot",
    "bingbot",
    "curl",
    "python-requests",
    "headlesschrome",
)


def get_client_ip(request):
    """The visitor's IP as seen by our own proxy, which can't be faked.

    Proxies append the address they saw to X-Forwarded-For, so anything to the left of our
    TRUSTED_PROXIES hops came from the client and could be invented. Trusting the first entry
    would let a script pose as endless "unique" visitors and dodge rate limits.
    """
    forwarded = [part.strip() for part in request.META.get("HTTP_X_FORWARDED_FOR", "").split(",") if part.strip()]
    hops = settings.TRUSTED_PROXIES
    if hops and forwarded:
        return forwarded[-min(hops, len(forwarded))]
    return request.META.get("REMOTE_ADDR", "")


def make_visitor_hash(ip, user_agent, when=None):
    """SHA-256 of IP + user agent + UTC date + SECRET_KEY. Rotates daily; the raw IP is never stored."""
    when = when or timezone.now()
    utc_date = when.astimezone(datetime.timezone.utc).date().isoformat()
    raw = f"{ip}|{user_agent}|{utc_date}|{settings.SECRET_KEY}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def is_bot(user_agent):
    if not user_agent or not user_agent.strip():
        return True
    ua = user_agent.lower()
    return any(pattern in ua for pattern in BOT_USER_AGENT_PATTERNS)


def detect_device(user_agent):
    if not user_agent:
        return "unknown"
    ua = user_agent.lower()
    if "ipad" in ua or "tablet" in ua or "kindle" in ua or "silk/" in ua or ("android" in ua and "mobile" not in ua):
        return "tablet"
    if "mobi" in ua or "iphone" in ua or "ipod" in ua or "android" in ua or "windows phone" in ua:
        return "mobile"
    if any(token in ua for token in ("windows", "macintosh", "mac os x", "x11", "linux", "cros")):
        return "desktop"
    return "unknown"


def record_scan(flyer, request):
    """Log a scan for `flyer`. Never raises: a failed log must not block the redirect."""
    try:
        user_agent = request.META.get("HTTP_USER_AGENT", "")
        visitor_hash = make_visitor_hash(get_client_ip(request), user_agent)
        # The same person rescanning (or refreshing) within a few minutes is one scan, so nobody
        # can pad a board's total by reloading. They're still redirected every time.
        recent = timezone.now() - datetime.timedelta(seconds=REPEAT_SCAN_WINDOW_SECONDS)
        if Scan.objects.filter(flyer=flyer, visitor_hash=visitor_hash, scanned_at__gte=recent).exists():
            return None
        scan = Scan.objects.create(
            flyer=flyer,
            visitor_hash=visitor_hash,
            user_agent=user_agent[:MAX_USER_AGENT_LENGTH],
            device_type=detect_device(user_agent),
            is_bot=is_bot(user_agent),
        )
    except Exception:
        logger.exception("Failed to record scan for flyer %s", getattr(flyer, "slug", "?"))
        return None
    if not scan.is_bot:
        mark_first_scan(flyer.event)
    return scan


def mark_first_scan(event):
    """The event's first human scan: stamp it and notify its club once. Never raises.

    Costs nothing after the first scan: the loaded event already carries first_scan_at.
    """
    if event.first_scan_at is not None:
        return
    try:
        now = timezone.now()
        # The filtered update is atomic, so two simultaneous first scans still notify once.
        if Event.objects.filter(pk=event.pk, first_scan_at__isnull=True).update(first_scan_at=now):
            event.first_scan_at = now
            notifications.notify_first_scan(event)
    except Exception:
        logger.exception("Failed to record the first scan for event %s", event.pk)
