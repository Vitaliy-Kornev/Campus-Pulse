"""QR code generation. Images are generated on request and never stored."""

import io

import segno
from django.conf import settings
from django.urls import reverse

PNG_SCALE = 12
SVG_SCALE = 10
QUIET_ZONE = 0  # no margin; the flyer around the code provides the quiet zone


def scan_url(flyer):
    """Absolute scan URL built from SITE_URL, never from the request host."""
    return f"{settings.SITE_URL}{reverse('scan_redirect', args=[flyer.slug])}"


def short_url(flyer):
    """Scan URL without the scheme, printed under the code as a fallback."""
    return scan_url(flyer).split("://", 1)[-1]


def make_qr(flyer):
    return segno.make(scan_url(flyer), error="h", boost_error=False, micro=False)


# Codes are transparent by default so they can be pasted onto a flyer design. Phones need dark
# modules on a light background, so dark flyers should use the white-background version.
def qr_png(flyer, scale=PNG_SCALE, white_background=False):
    buffer = io.BytesIO()
    light = "#fff" if white_background else None
    make_qr(flyer).save(buffer, kind="png", scale=scale, border=QUIET_ZONE, dark="#000", light=light)
    return buffer.getvalue()


def qr_svg(flyer, scale=SVG_SCALE, white_background=False):
    buffer = io.BytesIO()
    light = "#fff" if white_background else None
    make_qr(flyer).save(
        buffer, kind="svg", scale=scale, border=QUIET_ZONE, dark="#000", light=light,
        xmldecl=True, title=f"Campus Pulse {flyer.slug}",
    )
    return buffer.getvalue()
