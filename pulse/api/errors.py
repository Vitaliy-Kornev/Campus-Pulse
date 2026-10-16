"""API error responses in plain words, and errors reported by the browser."""

import logging
import math

from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.exceptions import Throttled
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler

from pulse.services import limits
from pulse.services.tracking import get_client_ip

client_logger = logging.getLogger("pulse.browser")


def exception_handler(exc, context):
    if isinstance(exc, Throttled):
        minutes = max(1, math.ceil((exc.wait or 60) / 60))
        exc.detail = f"Too many requests. Wait {minutes} minute{'s' if minutes != 1 else ''} and try again."
    return drf_exception_handler(exc, context)


@api_view(["POST"])
@permission_classes([AllowAny])
def client_error(request):
    """A crash or failed request in someone's browser, logged so it reaches CloudWatch like a server error.

    Only the message, stack, and page path are kept (no query strings, no personal data), and each
    network can report a limited number per hour so this can't be used to flood the logs.
    """
    if limits.hit(f"client-errors:{get_client_ip(request)}", 3600) > 30:
        return Response(status=status.HTTP_204_NO_CONTENT)
    data = request.data if isinstance(request.data, dict) else {}
    message = str(data.get("message", ""))[:500]
    stack = str(data.get("stack", ""))[:3000]
    page = str(data.get("page", "")).split("?")[0][:200]
    client_logger.error("Browser error on %s: %s\n%s", page or "?", message or "(no message)", stack)
    return Response(status=status.HTTP_204_NO_CONTENT)
