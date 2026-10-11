"""API error responses in plain words."""

import math

from rest_framework.exceptions import Throttled
from rest_framework.views import exception_handler as drf_exception_handler


def exception_handler(exc, context):
    if isinstance(exc, Throttled):
        minutes = max(1, math.ceil((exc.wait or 60) / 60))
        exc.detail = f"Too many requests. Wait {minutes} minute{'s' if minutes != 1 else ''} and try again."
    return drf_exception_handler(exc, context)
