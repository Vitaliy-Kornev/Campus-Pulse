"""Simple fixed-window rate limits, counted in the shared cache (the database by default).

Limits key on the account or email where we can. Campus Wi-Fi puts many students behind a few
public IPs, so per-IP limits are kept generous and only stop scripted abuse.
"""

import math

from django.core.cache import caches
from rest_framework import status
from rest_framework.exceptions import APIException


class TooManyTries(APIException):
    status_code = status.HTTP_429_TOO_MANY_REQUESTS
    default_code = "throttled"

    def __init__(self, what="tries", wait_seconds=None):
        minutes = max(1, math.ceil((wait_seconds or 60) / 60))
        super().__init__(f"Too many {what}. Wait {minutes} minute{'s' if minutes != 1 else ''} and try again.")


cache = caches["shared"]


def _key(key):
    return f"limit:{key}"


def is_over(key, limit):
    """Whether `key` has already used up its `limit` (without counting this attempt)."""
    return (cache.get(_key(key)) or 0) >= limit


def hit(key, window_seconds):
    """Count one attempt against `key`; the count resets `window_seconds` after the first one."""
    if cache.add(_key(key), 1, window_seconds):
        return 1
    try:
        return cache.incr(_key(key))
    except ValueError:  # expired between add() and incr()
        cache.set(_key(key), 1, window_seconds)
        return 1


def clear(key):
    cache.delete(_key(key))


def enforce(key, limit, window_seconds, what="requests"):
    """Count this attempt and raise TooManyTries once `limit` is exceeded within the window."""
    if hit(key, window_seconds) > limit:
        raise TooManyTries(what, window_seconds)
