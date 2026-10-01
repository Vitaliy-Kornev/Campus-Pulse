import re
import secrets
import string

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import URLValidator
from django.db import models
from django.db.models import ProtectedError
from django.utils import timezone

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


class Campaign(models.Model):
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="campaigns")
    name = models.CharField(max_length=150)
    destination_url = models.URLField(validators=[http_url_validator])
    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.name

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
    campaign = models.ForeignKey(Campaign, on_delete=models.CASCADE, related_name="flyers")
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
        return f"{self.slug} · {self.campaign} @ {self.board}{label}"

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
        return self.destination_override or self.campaign.destination_url

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

