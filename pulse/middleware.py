import logging

from django.db import connection
from django.http import HttpResponse

logger = logging.getLogger(__name__)

HEALTH_CHECK_PATH = "/healthz"


class HealthCheckMiddleware:
    """Answer uptime checks before host validation and the HTTPS redirect.

    Monitors and load balancers often call the server by IP over plain HTTP, which Django
    would otherwise reject (ALLOWED_HOSTS) or redirect (SECURE_SSL_REDIRECT). Must be first.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.path.rstrip("/") == HEALTH_CHECK_PATH:
            return health_check()
        return self.get_response(request)


def health_check():
    """200 "ok" only if the database answers, since without it no QR code can redirect."""
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
    except Exception:
        logger.exception("Health check: database unavailable")
        response = HttpResponse("database unavailable", content_type="text/plain", status=503)
    else:
        response = HttpResponse("ok", content_type="text/plain")
    response["Cache-Control"] = "no-store"
    return response
