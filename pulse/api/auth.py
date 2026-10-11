"""Session, login, signup, and password endpoints. Django's own auth forms do the validation."""

from django.conf import settings
from django.contrib.auth import authenticate, login, logout, update_session_auth_hash
from django.contrib.auth.forms import PasswordChangeForm, PasswordResetForm, SetPasswordForm
from django.contrib.auth.models import User
from django.contrib.auth.tokens import default_token_generator
from django.utils.encoding import force_str
from django.utils.http import urlsafe_base64_decode
from django.views.decorators.csrf import ensure_csrf_cookie
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from pulse.api.clubs import clubs_payload
from pulse.forms import SignupForm
from pulse.services import limits
from pulse.services.tracking import get_client_ip

# Failed log-ins allowed per account, and per IP (generous: campus Wi-Fi shares IPs), per window.
LOGIN_FAILURES = 5
LOGIN_FAILURES_PER_IP = 50
LOGIN_WINDOW = 15 * 60
from pulse.services.boards import get_default_campus


def user_payload(user):
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "full_name": user.get_full_name(),
        "is_staff": user.is_staff,
        # "club": the club they're working in now; "clubs": every club they're in or waiting to join.
        **clubs_payload(user),
    }


def form_errors(form):
    """Django form errors in DRF's shape: {field: [messages]}, with "__all__" as non_field_errors."""
    errors = {("non_field_errors" if field == "__all__" else field): messages for field, messages in form.errors.items()}
    return Response(errors, status=status.HTTP_400_BAD_REQUEST)


@ensure_csrf_cookie
@api_view(["GET"])
@permission_classes([AllowAny])
def session(request):
    """Who is logged in, plus the campus and map settings the frontend needs. Also sets the CSRF cookie."""
    campus = get_default_campus()
    return Response({
        "user": user_payload(request.user) if request.user.is_authenticated else None,
        "config": {
            "campus_name": campus.name,
            "campus_short_name": settings.CAMPUS_SHORT_NAME,
            "center": [float(campus.center_latitude), float(campus.center_longitude)],
            "zoom": campus.default_zoom,
            # The default map view fits boards near the campus center (both Minneapolis banks);
            # outlying areas like St. Paul appear when selected or when zoomed out.
            "default_radius_meters": 2500,
            "site_url": settings.SITE_URL,
            "tiles": {
                "url": settings.MAP_TILE_URL,
                "attribution": settings.MAP_TILE_ATTRIBUTION,
                "max_zoom": settings.MAP_TILE_MAX_ZOOM,
            },
            # Sentry DSNs are public by design; the browser needs it to report errors.
            "sentry": {"dsn": settings.SENTRY_DSN, "environment": settings.SENTRY_ENVIRONMENT} if settings.SENTRY_DSN else None,
        },
    })


@api_view(["POST"])
@permission_classes([AllowAny])
def login_view(request):
    # Failed logins are limited per account (password guessing) and, more loosely, per IP.
    username = str(request.data.get("username", ""))
    account_key, ip_key = f"login:{username.lower()}", f"login-ip:{get_client_ip(request)}"
    if limits.is_over(account_key, LOGIN_FAILURES) or limits.is_over(ip_key, LOGIN_FAILURES_PER_IP):
        raise limits.TooManyTries("failed log-ins", LOGIN_WINDOW)
    user = authenticate(request, username=username, password=request.data.get("password", ""))
    if user is None:
        limits.hit(account_key, LOGIN_WINDOW)
        limits.hit(ip_key, LOGIN_WINDOW)
        return Response(
            {"non_field_errors": ["Please enter a correct username and password. Both fields may be case-sensitive."]},
            status=status.HTTP_400_BAD_REQUEST,
        )
    limits.clear(account_key)
    login(request, user)
    return Response({"user": user_payload(user)})


@api_view(["POST"])
@permission_classes([AllowAny])
def logout_view(request):
    logout(request)
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(["POST"])
@permission_classes([AllowAny])
def signup(request):
    if request.user.is_authenticated:
        return Response({"non_field_errors": ["You are already logged in."]}, status=status.HTTP_400_BAD_REQUEST)
    limits.enforce(f"signup:{get_client_ip(request)}", 20, 3600, "sign-ups from this network")
    form = SignupForm(request.data)
    if not form.is_valid():
        return form_errors(form)
    user = form.save()
    login(request, user, backend="django.contrib.auth.backends.ModelBackend")
    return Response({"user": user_payload(user)}, status=status.HTTP_201_CREATED)


@api_view(["POST"])
def password_change(request):
    form = PasswordChangeForm(request.user, request.data)
    if not form.is_valid():
        return form_errors(form)
    form.save()
    update_session_auth_hash(request, form.user)
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(["POST"])
@permission_classes([AllowAny])
def password_reset(request):
    """Email a reset link if the address matches an account. Always 204, so emails can't be probed."""
    limits.enforce(f"reset-ip:{get_client_ip(request)}", 20, 3600, "reset requests from this network")
    form = PasswordResetForm(request.data)
    if not form.is_valid():
        return form_errors(form)
    # Past 3 an hour for one address, quietly stop sending (same 204) so no one can flood an inbox.
    if limits.hit(f"reset:{form.cleaned_data['email'].lower()}", 3600) > 3:
        return Response(status=status.HTTP_204_NO_CONTENT)
    form.save(
        request=request,
        subject_template_name="registration/password_reset_subject.txt",
        email_template_name="registration/password_reset_email.txt",
        extra_email_context={"site_url": settings.SITE_URL},
    )
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(["POST"])
@permission_classes([AllowAny])
def password_reset_confirm(request):
    try:
        user = User.objects.get(pk=force_str(urlsafe_base64_decode(request.data.get("uid", ""))))
    except (TypeError, ValueError, OverflowError, User.DoesNotExist):
        user = None
    if user is None or not default_token_generator.check_token(user, request.data.get("token", "")):
        return Response(
            {"non_field_errors": ["This reset link is invalid or has already been used. Request a new one."]},
            status=status.HTTP_400_BAD_REQUEST,
        )
    form = SetPasswordForm(user, request.data)
    if not form.is_valid():
        return form_errors(form)
    form.save()
    return Response(status=status.HTTP_204_NO_CONTENT)
