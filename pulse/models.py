import re
import secrets
import string

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import URLValidator
from django.db import models
from django.db.models import ProtectedError
from django.utils import timezone

from .taxonomy import CLUB_TYPES, EVENT_TYPES

# URL-safe characters without look-alikes (0/O, 1/l/I).
SLUG_ALPHABET = "".join(c for c in string.ascii_letters + string.digits if c not in "0O1lI")
SLUG_LENGTH = 8
SLUG_MAX_ATTEMPTS = 20

http_url_validator = URLValidator(schemes=["http", "https"], message="Enter an http:// or https:// URL.")


class Campus(models.Model):
    name = models.CharField(max_length=150)
    center_latitude = models.DecimalField(max_digits=9, decimal_places=6)
    center_longitude = models.DecimalField(max_digits=9, decimal_places=6)
    default_zoom = models.PositiveSmallIntegerField(default=16)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name_plural = "campuses"

    def __str__(self):
        return self.name


class Board(models.Model):
    campus = models.ForeignKey(Campus, on_delete=models.PROTECT, related_name="boards")
    name = models.CharField(max_length=150)
    area = models.CharField(max_length=50)
    building = models.CharField(max_length=150)
    floor = models.CharField(max_length=20, blank=True)
    description = models.TextField(blank=True)
    latitude = models.DecimalField(max_digits=9, decimal_places=6)
    longitude = models.DecimalField(max_digits=9, decimal_places=6)
    is_active = models.BooleanField(default=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="boards_added"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["area", "name"]
        constraints = [
            models.UniqueConstraint(fields=["campus", "name"], name="unique_board_name_per_campus"),
        ]

    def __str__(self):
        return self.name

    @property
    def approx_board_count(self):
        """Physical board count parsed from descriptions like "(about 15)"."""
        match = re.search(r"about\s+(\d+)", self.description or "", re.IGNORECASE)
        return int(match.group(1)) if match else None

    def clean(self):
        if self.latitude is not None and not -90 <= self.latitude <= 90:
            raise ValidationError({"latitude": "Latitude must be between -90 and 90."})
        if self.longitude is not None and not -180 <= self.longitude <= 180:
            raise ValidationError({"longitude": "Longitude must be between -180 and 180."})


class Club(models.Model):
    """A student organization. Officers share its events and history; it outlives any one officer."""

    name = models.CharField(max_length=150, unique=True)
    club_type = models.CharField(max_length=30, choices=CLUB_TYPES, default="other")
    fields = models.JSONField(default=list, blank=True, help_text="Field-of-study codes from pulse.taxonomy.")
    description = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class Membership(models.Model):
    """An officer's place in a club. A request is pending until an active officer approves it.

    An account can be an officer of several clubs, but works in one at a time: the active
    membership opened most recently is the current club, and every screen is about that club alone.
    """

    ACTIVE = "active"
    PENDING = "pending"
    STATUSES = [(ACTIVE, "Active officer"), (PENDING, "Requested to join")]

    club = models.ForeignKey(Club, on_delete=models.CASCADE, related_name="memberships")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="memberships")
    status = models.CharField(max_length=10, choices=STATUSES, default=PENDING)
    created_at = models.DateTimeField(auto_now_add=True)
    # Set when the officer switches to this club; the latest one is their current club.
    last_opened_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["created_at"]
        constraints = [models.UniqueConstraint(fields=["club", "user"], name="one_membership_per_club")]

    def __str__(self):
        return f"{self.user} @ {self.club} ({self.status})"


class Event(models.Model):
    club = models.ForeignKey(Club, on_delete=models.CASCADE, related_name="events")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="events_created"
    )
    name = models.CharField(max_length=150)
    event_type = models.CharField(max_length=30, choices=EVENT_TYPES, default="other")
    destination_url = models.URLField(validators=[http_url_validator])
    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)
    # Set by the first human scan of any of the event's flyers (drives one notification per event).
    first_scan_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.name

    @property
    def has_ended(self):
        return bool(self.end_date and self.end_date < timezone.localdate())

    def clean(self):
        if self.start_date and self.end_date and self.end_date < self.start_date:
            raise ValidationError({"end_date": "End date must be on or after the start date."})


def generate_slug():
    return "".join(secrets.choice(SLUG_ALPHABET) for _ in range(SLUG_LENGTH))


def days_between(start, end=None):
    """Whole days a flyer has been up (minimum 1)."""
    end = end or timezone.now()
    return max(1, int((end - start).total_seconds() // 86400))


class FlyerQuerySet(models.QuerySet):
    def active(self):
        return self.filter(removed_at__isnull=True)

    def removed(self):
        return self.filter(removed_at__isnull=False)


class Flyer(models.Model):
    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name="flyers")
    board = models.ForeignKey(Board, on_delete=models.PROTECT, related_name="flyers")
    slug = models.CharField(max_length=12, unique=True, editable=False)
    label = models.CharField(max_length=100, blank=True)
    destination_override = models.URLField(blank=True, validators=[http_url_validator])
    posted_at = models.DateTimeField(default=timezone.now)
    removed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    objects = FlyerQuerySet.as_manager()

    class Meta:
        ordering = ["-posted_at"]

    def __str__(self):
        label = f" ({self.label})" if self.label else ""
        return f"{self.slug} · {self.event} @ {self.board}{label}"

    def save(self, *args, **kwargs):
        if not self.slug:
            for _ in range(SLUG_MAX_ATTEMPTS):
                candidate = generate_slug()
                if not Flyer.objects.filter(slug=candidate).exists():
                    self.slug = candidate
                    break
            else:
                raise RuntimeError("Could not generate a unique flyer slug.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        if self.pk and self.scans.exists():
            raise ProtectedError("Flyers with scans cannot be deleted; mark them removed instead.", {self})
        return super().delete(*args, **kwargs)

    @property
    def destination(self):
        return self.destination_override or self.event.destination_url

    @property
    def is_active(self):
        return self.removed_at is None

    @property
    def days_posted(self):
        return days_between(self.posted_at, self.removed_at)

    @property
    def scans_per_day(self):
        """Human scans per day posted. Uses the `total_scans` annotation when present."""
        total = getattr(self, "total_scans", None)
        if total is None:
            total = self.scans.filter(is_bot=False).count()
        return round(total / self.days_posted, 2)


class Scan(models.Model):
    flyer = models.ForeignKey(Flyer, on_delete=models.CASCADE, related_name="scans")
    scanned_at = models.DateTimeField(auto_now_add=True, db_index=True)
    visitor_hash = models.CharField(max_length=64, db_index=True)
    user_agent = models.CharField(max_length=500, blank=True)
    device_type = models.CharField(max_length=20)
    is_bot = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [models.Index(fields=["flyer", "scanned_at"], name="scan_flyer_time_idx")]

    def __str__(self):
        return f"Scan of {self.flyer_id} at {self.scanned_at:%Y-%m-%d %H:%M}"


class Notification(models.Model):
    """An on-site notice for a club's officers (never emailed). One per (club, kind, key)."""

    FIRST_SCAN = "first_scan"
    MOVE_IT = "move_it"
    RECAP = "recap"
    JOIN_REQUEST = "join_request"
    KINDS = [(FIRST_SCAN, "First scan"), (MOVE_IT, "Move it"), (RECAP, "Event recap"), (JOIN_REQUEST, "Join request")]

    club = models.ForeignKey(Club, on_delete=models.CASCADE, related_name="notifications")
    kind = models.CharField(max_length=20, choices=KINDS)
    key = models.CharField(max_length=60, help_text="What the notice is about, e.g. flyer:Ab3dEf7h; keeps it unique.")
    title = models.CharField(max_length=200)
    body = models.CharField(max_length=300, blank=True)
    link = models.CharField(max_length=200, blank=True)
    read_by = models.ManyToManyField(settings.AUTH_USER_MODEL, blank=True, related_name="read_notifications")
    # Closed with the X. Per officer: the others still see it. Kept rather than deleted, so a
    # move-it nudge or recap that's still due isn't recreated the next time the list refreshes.
    dismissed_by = models.ManyToManyField(settings.AUTH_USER_MODEL, blank=True, related_name="dismissed_notifications")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [models.UniqueConstraint(fields=["club", "kind", "key"], name="unique_notification_per_subject")]

    def __str__(self):
        return f"{self.club}: {self.title}"

