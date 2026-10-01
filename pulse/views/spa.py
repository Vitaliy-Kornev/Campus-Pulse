from django.conf import settings
from django.http import HttpResponse
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_safe

BUILD_MISSING = """<!doctype html><meta charset="utf-8"><title>Campus Pulse</title>
<body style="font-family: system-ui, sans-serif; max-width: 36rem; margin: 4rem auto; padding: 0 1rem; line-height: 1.5">
<h1>The frontend hasn't been built</h1>
<p>For development, run <code>npm run dev</code> in <code>frontend/</code> and open
<a href="http://localhost:5173">http://localhost:5173</a>. For production, run <code>npm run build</code>
in <code>frontend/</code>, then <code>python manage.py collectstatic</code>.</p>"""


@require_safe
@ensure_csrf_cookie
def index(request):
    """Serve the built React app. Read on every request so a new build needs no restart."""
    index_file = settings.FRONTEND_DIST / "index.html"
    try:
        html = index_file.read_text(encoding="utf-8")
    except FileNotFoundError:
        return HttpResponse(BUILD_MISSING, status=503)
    response = HttpResponse(html)
    response["Cache-Control"] = "no-cache"
    return response
