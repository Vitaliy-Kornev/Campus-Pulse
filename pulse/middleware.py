from django.http import HttpResponse

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
            return HttpResponse("ok", content_type="text/plain")
        return self.get_response(request)
