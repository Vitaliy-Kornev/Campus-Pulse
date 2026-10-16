from rest_framework import authentication, permissions


class SessionAuthentication(authentication.SessionAuthentication):
    """Django session login for the same-origin React app.

    DRF only checks CSRF for logged-in users; this also checks it on anonymous writes (log in, sign up,
    password reset), like Django's own auth views. Answering with a WWW-Authenticate header makes DRF
    return 401 instead of 403 when nobody is logged in, so the frontend can tell the two apart.
    """

    def authenticate(self, request):
        result = super().authenticate(request)
        if result is None and request.method not in permissions.SAFE_METHODS:
            self.enforce_csrf(request)
        return result

    def authenticate_header(self, request):
        return "Session"


class IsStaff(permissions.BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_staff)
