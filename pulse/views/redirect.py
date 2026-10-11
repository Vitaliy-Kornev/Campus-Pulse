from django.http import HttpResponseRedirect
from django.shortcuts import render
from django.views.decorators.http import require_safe

from pulse.models import Flyer
from pulse.services.tracking import record_scan


@require_safe
def scan_redirect(request, slug):
    """Log a scan and send the student on. Must stay fast and never block the redirect.

    No login, no session access, no CSRF. Removed flyers still redirect and still log.
    """
    flyer = Flyer.objects.select_related("event").filter(slug=slug).first()
    if flyer is None:
        return render(request, "pulse/scan_not_found.html", status=404)

    record_scan(flyer, request)

    response = HttpResponseRedirect(flyer.destination)
    response["Cache-Control"] = "no-store"
    return response
