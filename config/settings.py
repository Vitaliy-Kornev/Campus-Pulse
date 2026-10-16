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

# Each test starts clean: nothing cached carries over from another test (the shared database
# cache is rolled back with the test database).
if sys.argv[1:2] == ["test"]:
    CACHES["default"] = {"BACKEND": "django.core.cache.backends.dummy.DummyCache"}

# How many proxies in front of the app add to X-Forwarded-For (1: nginx).
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

# AWS region for Amazon Location (maps), SES (email), and S3 (backups).
AWS_REGION = env("AWS_REGION", default="us-east-2")

# Map. In production: Amazon Location Service's muted "Monochrome" style, drawn as a vector map.
# AWS_LOCATION_API_KEY is a browser key restricted to your domain (deploy/aws/provision.sh makes
# it), so it's safe in the page. MAP_VECTOR_STYLE_URL overrides the style with any MapLibre style.
AWS_LOCATION_API_KEY = env("AWS_LOCATION_API_KEY", default="")
AWS_LOCATION_MAP_STYLE = env("AWS_LOCATION_MAP_STYLE", default="Monochrome")
MAP_VECTOR_STYLE_URL = env("MAP_VECTOR_STYLE_URL", default="") or (
    f"https://maps.geo.{AWS_REGION}.amazonaws.com/v2/styles/{AWS_LOCATION_MAP_STYLE}/descriptor"
    f"?key={AWS_LOCATION_API_KEY}&color-scheme=Light"
    if AWS_LOCATION_API_KEY
    else ""
)

# Without a vector style (local development), raster tiles from Stadia Maps' muted "Alidade
# Smooth" style, which work on localhost with no account. {r} serves sharper tiles on
# high-density screens.
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

# For the few browsers that can't draw vector maps (no WebGL2: some old phones and school
# computers): OpenStreetMap's raster tiles, which allow this kind of light use with no account.
MAP_FALLBACK_TILE_URL = env("MAP_FALLBACK_TILE_URL", default="https://tile.openstreetmap.org/{z}/{x}/{y}.png")
MAP_FALLBACK_TILE_ATTRIBUTION = env(
    "MAP_FALLBACK_TILE_ATTRIBUTION",
    default='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
)

if not DEBUG:
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
    SECURE_SSL_REDIRECT = env.bool("SECURE_SSL_REDIRECT", default=True)
    SECURE_HSTS_SECONDS = env.int("SECURE_HSTS_SECONDS", default=31536000)
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True
    SECURE_CONTENT_TYPE_NOSNIFF = True

# Logs go to the console, and to LOG_FILE when set. On the server, the CloudWatch agent ships that
# file to CloudWatch Logs, where an alarm emails you about any ERROR line (deploy/aws/provision.sh).
LOG_FILE = env("LOG_FILE", default="")
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {"plain": {"format": "%(asctime)s %(levelname)s %(name)s: %(message)s"}},
    "handlers": {
        "console": {"class": "logging.StreamHandler", "formatter": "plain"},
        # WatchedFileHandler reopens the file after logrotate moves it.
        **({"file": {"class": "logging.handlers.WatchedFileHandler", "filename": LOG_FILE, "formatter": "plain"}} if LOG_FILE else {}),
    },
    "root": {"handlers": ["console", "file"] if LOG_FILE else ["console"], "level": env("LOG_LEVEL", default="INFO")},
    "loggers": {
        "django.db.backends": {"level": "WARNING"},
        # 403/404 warnings are expected traffic (scoping returns 404 by design).
        "django.request": {"level": "ERROR"},
        # Scanners probing the server's IP or made-up hostnames: refused with a 400, not an error
        # worth an alert. (nginx drops most of them before they get here.)
        "django.security.DisallowedHost": {"handlers": [], "propagate": False},
    },
}
