"""Django settings for Campus Pulse.

Every secret and deployment-specific value comes from environment variables
(optionally loaded from a local `.env` file). See `.env.example`.
"""

from pathlib import Path

import sys

import environ

BASE_DIR = Path(__file__).resolve().parent.parent

env = environ.Env(
    DEBUG=(bool, False),
)
env_file = BASE_DIR / ".env"
if env_file.exists():
    environ.Env.read_env(env_file)

DEBUG = env("DEBUG")
SECRET_KEY = env("SECRET_KEY", default="django-insecure-local-dev-only-change-me" if DEBUG else None)
if not SECRET_KEY:
    from django.core.exceptions import ImproperlyConfigured

    raise ImproperlyConfigured("Set the SECRET_KEY environment variable (required when DEBUG=False).")

ALLOWED_HOSTS = env.list("ALLOWED_HOSTS", default=["localhost", "127.0.0.1"])
CSRF_TRUSTED_ORIGINS = env.list("CSRF_TRUSTED_ORIGINS", default=[])
if DEBUG:
    # The Vite dev server (frontend/, :5173) proxies API calls to Django from its own origin.
    CSRF_TRUSTED_ORIGINS += ["http://localhost:5173", "http://127.0.0.1:5173"]

# Absolute base URL used to build QR codes. Never derived from the request host.
SITE_URL = env("SITE_URL", default="http://localhost:8000").rstrip("/")

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "whitenoise.runserver_nostatic",
    "django.contrib.staticfiles",
    "rest_framework",
    "pulse",
]

MIDDLEWARE = [
    "pulse.middleware.HealthCheckMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"

DATABASES = {
    "default": env.db("DATABASE_URL", default=f"sqlite:///{BASE_DIR / 'db.sqlite3'}"),
}
DATABASES["default"]["CONN_MAX_AGE"] = env.int("CONN_MAX_AGE", default=60)

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
# The campus time zone; used for all day and hour-of-day grouping.
TIME_ZONE = env("TIME_ZONE", default="America/Chicago")
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
# The React app (frontend/) builds into frontend/dist with asset URLs under /static/.
FRONTEND_DIST = BASE_DIR / "frontend" / "dist"
STATICFILES_DIRS = [FRONTEND_DIST] if FRONTEND_DIST.exists() else []
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedStaticFilesStorage"},
}

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": ["pulse.api.authentication.SessionAuthentication"],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_PARSER_CLASSES": ["rest_framework.parsers.JSONParser"],
    "TEST_REQUEST_DEFAULT_FORMAT": "json",
    # Broad caps against scripts; specific actions (log in, sign up, join) have tighter ones.
    "DEFAULT_THROTTLE_CLASSES": ["pulse.api.throttling.UserThrottle", "pulse.api.throttling.VisitorThrottle"],
    "DEFAULT_THROTTLE_RATES": {
        "user": env("THROTTLE_USER_RATE", default="3000/hour"),
        "visitor": env("THROTTLE_VISITOR_RATE", default="600/hour"),
    },
    "EXCEPTION_HANDLER": "pulse.api.errors.exception_handler",
}

CACHES = {
    # Fast, per-process: broad request caps and cached results, where approximate is fine.
    "default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache", "LOCATION": "campus-pulse"},
    # Shared by every gunicorn worker: limits that must hold exactly (log-ins, sign-ups, join
    # requests). A database table, created by a migration; no Redis needed.
    "shared": {
        "BACKEND": "django.core.cache.backends.db.DatabaseCache",
        "LOCATION": "pulse_cache",
        "OPTIONS": {"MAX_ENTRIES": 20000},
    },
}

# Error reports (optional): set SENTRY_DSN to send server and browser errors to Sentry. No IPs,
# cookies, or personal data are sent; scans stay anonymous.
SENTRY_DSN = env("SENTRY_DSN", default="")
SENTRY_ENVIRONMENT = env("SENTRY_ENVIRONMENT", default="development" if DEBUG else "production")
if SENTRY_DSN:
    import sentry_sdk

    def _scrub(event, hint):
        request = event.get("request") or {}
        request.pop("env", None)  # REMOTE_ADDR
        request.pop("cookies", None)
        headers = request.get("headers") or {}
        for header in list(headers):
            if header.lower() in ("x-forwarded-for", "x-real-ip", "cookie", "x-csrftoken"):
                headers.pop(header)
        event.pop("user", None)
        return event

    sentry_sdk.init(
        dsn=SENTRY_DSN,
        environment=SENTRY_ENVIRONMENT,
        send_default_pii=False,
        traces_sample_rate=0,
        before_send=_scrub,
    )

# Each test starts clean: nothing cached carries over from another test (the shared database
# cache is rolled back with the test database).
if sys.argv[1:2] == ["test"]:
    CACHES["default"] = {"BACKEND": "django.core.cache.backends.dummy.DummyCache"}

# How many proxies in front of the app add to X-Forwarded-For (nginx, or Render/Railway's router).
# The client IP is the entry that the outermost trusted proxy added. 0 means use REMOTE_ADDR.
TRUSTED_PROXIES = env.int("TRUSTED_PROXIES", default=1)

# Password-reset email. Locally it prints to the console; set EMAIL_HOST (e.g. Amazon SES SMTP) in production.
EMAIL_HOST = env("EMAIL_HOST", default="")
EMAIL_BACKEND = env(
    "EMAIL_BACKEND",
    default="django.core.mail.backends.smtp.EmailBackend" if EMAIL_HOST else "django.core.mail.backends.console.EmailBackend",
)
EMAIL_PORT = env.int("EMAIL_PORT", default=587)
EMAIL_HOST_USER = env("EMAIL_HOST_USER", default="")
EMAIL_HOST_PASSWORD = env("EMAIL_HOST_PASSWORD", default="")
EMAIL_USE_TLS = env.bool("EMAIL_USE_TLS", default=True)
DEFAULT_FROM_EMAIL = env("DEFAULT_FROM_EMAIL", default="Campus Pulse <noreply@campuspulse.local>")

# Default campus, created on first board import if none exists.
CAMPUS_NAME = env("CAMPUS_NAME", default="University of Minnesota – Twin Cities")
CAMPUS_SHORT_NAME = env("CAMPUS_SHORT_NAME", default="UMN Twin Cities")  # shown under the logo
CAMPUS_CENTER = (
    env.float("CAMPUS_CENTER_LAT", default=44.9740),
    env.float("CAMPUS_CENTER_LNG", default=-93.2340),
)
CAMPUS_DEFAULT_ZOOM = env.int("CAMPUS_DEFAULT_ZOOM", default=15)

# OpenStreetMap's tile servers reject requests without a Referer. Django's default
# ("same-origin") strips it on cross-origin requests, so send just the origin instead.
SECURE_REFERRER_POLICY = "strict-origin-when-cross-origin"

# Map tiles: Stadia Maps "Alidade Smooth", a muted style that lets the board tags stand out.
# No API key in the code: localhost works as is, and in production you add the site's domain to a
# free Stadia account (https://client.stadiamaps.com). The free plan has no billing, so going over
# its limit stops tiles rather than charging. {r} serves sharper tiles on high-density screens.
MAP_TILE_URL = env("MAP_TILE_URL", default="https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.png")
MAP_TILE_ATTRIBUTION = env(
    "MAP_TILE_ATTRIBUTION",
    default=(
        '&copy; <a href="https://stadiamaps.com/">Stadia Maps</a> '
        '&copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> '
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    ),
)
MAP_TILE_MAX_ZOOM = env.int("MAP_TILE_MAX_ZOOM", default=20)

if not DEBUG:
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
    SECURE_SSL_REDIRECT = env.bool("SECURE_SSL_REDIRECT", default=True)
    SECURE_HSTS_SECONDS = env.int("SECURE_HSTS_SECONDS", default=31536000)
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True
    SECURE_CONTENT_TYPE_NOSNIFF = True

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "root": {"handlers": ["console"], "level": env("LOG_LEVEL", default="INFO")},
    "loggers": {
        "django.db.backends": {"level": "WARNING"},
        # 403/404 warnings are expected traffic (scoping returns 404 by design).
        "django.request": {"level": "ERROR"},
    },
}
