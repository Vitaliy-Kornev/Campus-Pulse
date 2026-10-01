"""Scan tracking: visitor hashing, bot detection, and device detection."""

import datetime
import hashlib
import logging

from django.conf import settings
from django.utils import timezone

from pulse.models import Scan

logger = logging.getLogger(__name__)

MAX_USER_AGENT_LENGTH = 500

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
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
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
        return Scan.objects.create(
            flyer=flyer,
            visitor_hash=make_visitor_hash(get_client_ip(request), user_agent),
            user_agent=user_agent[:MAX_USER_AGENT_LENGTH],
            device_type=detect_device(user_agent),
            is_bot=is_bot(user_agent),
        )
    except Exception:
        logger.exception("Failed to record scan for flyer %s", getattr(flyer, "slug", "?"))
        return None
