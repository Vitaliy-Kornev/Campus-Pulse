import datetime
from decimal import Decimal

from django.contrib.auth.models import User
from django.utils import timezone

from pulse.models import Board, Campus, Club, Event, Flyer, Membership, Scan

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
    def club(cls, name=None, officers=(), club_type="academic", fields=("computer-science",)):
        club = Club.objects.create(name=name or f"Club {cls._next()}", club_type=club_type, fields=list(fields))
        for user in officers:
            Membership.objects.create(club=club, user=user, status=Membership.ACTIVE)
        return club

    @classmethod
    def club_of(cls, user):
        """The user's club, creating one with them as its only officer if they have none."""
        membership = user.memberships.filter(status=Membership.ACTIVE).first()
        if membership is None:
            return cls.club(f"{user.username}'s club", officers=[user])
        return membership.club

    @classmethod
    def event(cls, owner, name=None, url="https://example.com/landing", **kwargs):
        """An event of `owner`'s club (owner may be a user or a club)."""
        club = owner if isinstance(owner, Club) else cls.club_of(owner)
        return Event.objects.create(club=club, name=name or f"Event {cls._next()}", destination_url=url, **kwargs)

    @classmethod
    def flyer(cls, event, board=None, **kwargs):
        return Flyer.objects.create(event=event, board=board or cls.board(), **kwargs)

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
