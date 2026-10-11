"""Broad per-account and per-visitor request caps (see REST_FRAMEWORK in settings)."""

from rest_framework.throttling import SimpleRateThrottle

from pulse.services.tracking import get_client_ip


class UserThrottle(SimpleRateThrottle):
    """Logged-in requests, per account."""

    scope = "user"

    def get_cache_key(self, request, view):
        if not request.user.is_authenticated:
            return None
        return self.cache_format % {"scope": self.scope, "ident": request.user.pk}


class VisitorThrottle(SimpleRateThrottle):
    """Logged-out requests (log in, sign up, password reset), per IP. Generous: campus Wi-Fi shares IPs."""

    scope = "visitor"

    def get_cache_key(self, request, view):
        if request.user.is_authenticated:
            return None
        return self.cache_format % {"scope": self.scope, "ident": get_client_ip(request)}
