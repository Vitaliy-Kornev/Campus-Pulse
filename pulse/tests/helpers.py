import datetime
from decimal import Decimal

from django.contrib.auth.models import User
from django.utils import timezone

from pulse.models import Board, Campaign, Campus, Flyer, Scan

IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1"


class Factory:
    """Tiny object factory shared by the test modules."""

    _n = 0

    @classmethod
    def _next(cls):
        cls._n += 1
        return cls._n

    @classmethod
    def campus(cls):
        return Campus.objects.first() or Campus.objects.create(
            name="Test U", center_latitude=Decimal("44.974"), center_longitude=Decimal("-93.234"), default_zoom=15
        )

    @classmethod
    def user(cls, username=None, staff=False):
        username = username or f"user{cls._next()}"
        return User.objects.create_user(username, f"{username}@example.com", "pw-12345!", is_staff=staff)

    @classmethod
    def board(cls, name=None, area="East Bank", **kwargs):
        defaults = {"building": "Hall", "latitude": Decimal("44.974"), "longitude": Decimal("-93.234")}
        defaults.update(kwargs)
        return Board.objects.create(campus=cls.campus(), name=name or f"Board {cls._next()}", area=area, **defaults)

    @classmethod
    def campaign(cls, owner, name=None, url="https://example.com/landing"):
        return Campaign.objects.create(owner=owner, name=name or f"Campaign {cls._next()}", destination_url=url)

    @classmethod
    def flyer(cls, campaign, board=None, **kwargs):
        return Flyer.objects.create(campaign=campaign, board=board or cls.board(), **kwargs)

    @classmethod
    def scan(cls, flyer, when=None, visitor="v1", bot=False, device="mobile"):
        scan = Scan.objects.create(flyer=flyer, visitor_hash=visitor, device_type=device, is_bot=bot, user_agent="test")
        if when is not None:
            Scan.objects.filter(pk=scan.pk).update(scanned_at=when)
        return scan


def local_dt(days_ago=0, hour=12):
    """An aware datetime in the campus time zone, `days_ago` days before today at `hour`."""
    day = timezone.localdate() - datetime.timedelta(days=days_ago)
    return datetime.datetime.combine(day, datetime.time(hour), tzinfo=timezone.get_current_timezone())
