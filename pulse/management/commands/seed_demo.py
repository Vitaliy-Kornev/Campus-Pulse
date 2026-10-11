"""Seed the UMN campus, its boards, demo clubs and officers, their events, flyers, and realistic scans.

Safe to re-run: boards are updated by name, and the demo clubs (with their events, flyers, and
scans) are rebuilt from scratch. Clubs that aren't part of the demo are left alone.

The history is shaped so every feature has something to show for `demo`'s club, Gopher Coders:
another computer-science club (Women in Computing) did well at Keller Hall, Walter Library, and
Mechanical Engineering, which drives Gopher Coders' recommendations; a past hackathon has a recap;
an upcoming workshop has a poster with no scans (a move-it nudge); and someone is waiting to join.
"""

import datetime
import random
from decimal import Decimal

from django.conf import settings
from django.contrib.auth.models import User
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from pulse.models import Board, Club, Event, Flyer, Membership, Notification, Scan
from pulse.services import notifications
from pulse.services.boards import get_default_campus, import_boards
from pulse.services.tracking import MAX_USER_AGENT_LENGTH, detect_device, is_bot, make_visitor_hash

BOT_RATE = 0.05
REPEAT_VISITOR_RATE = 0.15

# Each flyer: (board name, design label, posted N days ago, taken down N days ago or None, scans per day).
# Event dates are days from today: negative is in the past.
CLUBS = [
    {
        "name": "Gopher Coders",
        "club_type": "academic",
        "fields": ["computer-science", "data-science"],
        "description": "Weekly coding workshops and an annual hackathon.",
        "officers": [("demo", "Dana", "Demo")],
        "pending": [("newofficer", "Nico", "Nguyen")],
        "events": [
            {
                "name": "Intro to Git Workshop",
                "event_type": "workshop",
                "url": "https://example.com/git-workshop",
                "start": 6, "end": 6,
                "flyers": [
                    ("Keller Hall - CS&E Main Office", "", 8, None, 6.0),
                    ("Walter Library - Northrop Mall", "", 8, None, 4.5),
                    ("Coffman Union - Posting Areas", "", 7, None, 5.0),
                    ("Smith Hall - Northrop Mall", "", 7, None, 0.0),  # quiet: move-it nudge
                ],
            },
            {
                "name": "Gopher Hackathon",
                "event_type": "competition",
                "url": "https://example.com/hackathon",
                "start": -12, "end": -11,
                "flyers": [
                    ("Mechanical Engineering - North", "", 30, None, 5.5),
                    ("Akerman Hall - AEM Grad Lounge", "", 30, None, 2.0),
                    ("Washington Ave Pedestrian Bridge - West", "", 29, None, 3.0),
                    ("Comstock Hall", "", 28, None, 0.6),
                    ("RecWell Center - Bulletin Boards", "", 28, None, 0.0),
                ],
            },
        ],
    },
    {
        "name": "Women in Computing",
        "club_type": "academic",
        "fields": ["computer-science", "computer-engineering"],
        "description": "Community, mentorship, and career events for women in tech.",
        # demo is an officer here too, to show one account working in two clubs.
        "officers": [("wic", "Wren", "Ibsen"), ("demo", "Dana", "Demo")],
        "events": [
            {
                "name": "Tech Talk: Careers in AI",
                "event_type": "speaker",
                "url": "https://example.com/ai-talk",
                "start": -24, "end": -24,
                "flyers": [
                    ("Keller Hall - CS&E Main Office", "", 36, None, 9.0),
                    ("Walter Library - Northrop Mall", "", 36, None, 7.5),
                    ("Mechanical Engineering - North", "", 35, None, 6.0),
                    ("Coffman Union - Posting Areas", "", 35, None, 5.0),
                    ("Anderson Hall - Northwest 1", "", 34, None, 0.4),
                ],
            },
            {
                "name": "Resume Workshop",
                "event_type": "workshop",
                "url": "https://example.com/resume",
                "start": -5, "end": -5,
                "flyers": [
                    ("Keller Hall - CS&E Main Office", "", 15, None, 8.0),
                    ("Akerman Hall - AEM Grad Lounge", "", 15, None, 3.5),
                    ("Smith Hall - Northrop Mall", "", 14, None, 0.5),
                ],
            },
        ],
    },
    {
        "name": "Carlson Finance Club",
        "club_type": "academic",
        "fields": ["finance", "accounting"],
        "description": "Markets, investing, and recruiting prep.",
        "officers": [("finance", "Farah", "Ince")],
        "events": [
            {
                "name": "Wall Street Info Night",
                "event_type": "info-session",
                "url": "https://example.com/wall-street",
                "start": -9, "end": -9,
                "flyers": [
                    ("Carlson School - Level 1", "", 20, None, 7.0),
                    ("Carlson School - Student Lounges", "", 20, None, 6.0),
                    ("Willey Hall - East", "", 19, None, 3.0),
                    ("Washington Ave Pedestrian Bridge - East", "", 19, None, 4.0),
                ],
            },
        ],
    },
    {
        "name": "Hmong Student Association",
        "club_type": "cultural",
        "fields": ["all-majors"],
        "description": "Celebrating Hmong culture on campus.",
        "officers": [("hsa", "Pa", "Vang")],
        "events": [
            {
                "name": "Hmong New Year Celebration",
                "event_type": "cultural",
                "url": "https://example.com/hmong-new-year",
                "start": 14, "end": 14,
                "flyers": [
                    ("Coffman Union - Posting Areas", "red design", 10, None, 9.0),
                    ("Pioneer Hall", "", 10, None, 4.0),
                    ("Frontier Hall", "", 9, None, 3.5),
                    ("Centennial Hall", "", 9, None, 3.0),
                ],
            },
        ],
    },
    {
        "name": "Intramural Volleyball Club",
        "club_type": "sports",
        "fields": ["kinesiology", "all-majors"],
        "description": "Pickup games and an intramural league.",
        "officers": [("volleyball", "Val", "Lee")],
        "events": [
            {
                "name": "Fall League Signups",
                "event_type": "recruitment",
                "url": "https://example.com/volleyball",
                "start": -2, "end": 3,
                "flyers": [
                    ("RecWell Center - Bulletin Boards", "", 16, None, 6.5),
                    ("Pioneer Hall", "", 16, None, 3.0),
                    ("Middlebrook Hall", "", 15, None, 2.0),
                    ("St. Paul Student Center - Posting Areas", "", 15, 4, 1.0),
                ],
            },
        ],
    },
]

# Lunchtime and class-change peaks; quiet overnight.
HOUR_WEIGHTS = [
    0.10, 0.05, 0.02, 0.01, 0.01, 0.03, 0.10, 0.40, 0.90, 1.30, 1.10, 1.50,
    2.20, 1.60, 1.20, 1.40, 1.10, 0.90, 0.70, 0.60, 0.50, 0.40, 0.30, 0.20,
]

HUMAN_USER_AGENTS = [
    (0.48, "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1"),
    (0.30, "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36"),
    (0.05, "Mozilla/5.0 (Linux; Android 14; SM-S921U) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/27.0 Chrome/125.0.0.0 Mobile Safari/537.36"),
    (0.06, "Mozilla/5.0 (iPad; CPU OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1"),
    (0.06, "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36"),
    (0.04, "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36 Edg/138.0.0.0"),
    (0.01, "Mozilla/5.0 (Nintendo Switch; WifiWebAuthApplet) AppleWebKit/606.4 (KHTML, like Gecko) NF/6.0.1.15.4 NintendoBrowser/5.1.0.20393"),
]

BOT_USER_AGENTS = [
    "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
    "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    "WhatsApp/2.24.1.6 A",
    "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)",
    "curl/8.7.1",
    "",
]


class Command(BaseCommand):
    help = "Create the UMN campus, boards, demo clubs and officers, events, flyers, and realistic scans."

    def add_arguments(self, parser):
        parser.add_argument("--seed", type=int, default=None, help="Random seed for reproducible data")

    @transaction.atomic
    def handle(self, *args, **options):
        rng = random.Random(options["seed"])
        now = timezone.now()
        today = timezone.localdate()

        campus = get_default_campus()
        campus.name = settings.CAMPUS_NAME
        campus.center_latitude = Decimal(str(settings.CAMPUS_CENTER[0]))
        campus.center_longitude = Decimal(str(settings.CAMPUS_CENTER[1]))
        campus.default_zoom = settings.CAMPUS_DEFAULT_ZOOM
        campus.save()

        with (settings.BASE_DIR / "boards_umn.csv").open(newline="", encoding="utf-8-sig") as handle:
            created, updated = import_boards(handle, campus=campus)
        self.stdout.write(f"Boards: {created} created, {updated} updated.")

        self._user("admin", "admin", staff=True)

        # Start fresh: drop the demo clubs (cascading to their events, flyers, scans, notices) and
        # any club memberships the demo accounts hold, then rebuild.
        demo_usernames = [u for spec in CLUBS for u, _, _ in spec["officers"] + spec.get("pending", [])]
        Club.objects.filter(name__in=[spec["name"] for spec in CLUBS]).delete()
        for membership in Membership.objects.filter(user__username__in=demo_usernames).select_related("club"):
            club = membership.club
            membership.delete()
            if not club.memberships.exists():
                club.delete()

        boards = {b.name: b for b in Board.objects.filter(campus=campus)}
        plans = []
        for spec in CLUBS:
            club = Club.objects.create(
                name=spec["name"], club_type=spec["club_type"], fields=spec["fields"], description=spec["description"]
            )
            officers = []
            for username, first, last in spec["officers"]:
                user = self._user(username, username, staff=False, first=first, last=last)
                Membership.objects.create(club=club, user=user, status=Membership.ACTIVE)
                officers.append(user)
            for username, first, last in spec.get("pending", []):
                user = self._user(username, username, staff=False, first=first, last=last)
                membership = Membership.objects.create(club=club, user=user, status=Membership.PENDING)
                notifications.notify(
                    club, Notification.JOIN_REQUEST, f"membership:{membership.pk}",
                    f"{first} {last} asked to join {club.name}", "Approve or decline on your club page.", "/club",
                )
            for e in spec["events"]:
                event = Event.objects.create(
                    club=club,
                    created_by=officers[0],
                    name=e["name"],
                    event_type=e["event_type"],
                    destination_url=e["url"],
                    start_date=today + datetime.timedelta(days=e["start"]),
                    end_date=today + datetime.timedelta(days=e["end"]),
                )
                for board_name, label, posted_ago, removed_ago, per_day in e["flyers"]:
                    posted_at = self._at_local_hour(now - datetime.timedelta(days=posted_ago), rng.randint(8, 16))
                    removed_at = self._at_local_hour(now - datetime.timedelta(days=removed_ago), rng.randint(8, 16)) if removed_ago else None
                    flyer = Flyer.objects.create(event=event, board=boards[board_name], label=label, posted_at=posted_at, removed_at=removed_at)
                    plans.append((flyer, per_day))

        scans = self._make_scans(rng, now, plans)
        created_scans = Scan.objects.bulk_create(scans, batch_size=500)
        # scanned_at is auto_now_add, so bulk_create stamps "now"; set the generated times afterwards.
        for scan, original in zip(created_scans, scans):
            scan.scanned_at = original._planned_at
        Scan.objects.bulk_update(created_scans, ["scanned_at"], batch_size=500)

        # First scans already happened for these events; record them (one fresh, unread notice for
        # the upcoming workshop shows the feature).
        for event in Event.objects.filter(club__name__in=[s["name"] for s in CLUBS]):
            first = Scan.objects.filter(flyer__event=event, is_bot=False).order_by("scanned_at").first()
            if first:
                event.first_scan_at = first.scanned_at
                event.save(update_fields=["first_scan_at"])
                if event.name == "Intro to Git Workshop":
                    notifications.notify_first_scan(event)

        bots = sum(1 for s in scans if s.is_bot)
        self.stdout.write(self.style.SUCCESS(
            f"Seeded {len(CLUBS)} clubs, {sum(len(s['events']) for s in CLUBS)} events, {len(plans)} flyers, "
            f"{len(scans)} scans ({bots} bots)."
        ))
        self.stdout.write(
            "Log in as demo / demo (officer of Gopher Coders and Women in Computing), newofficer / newofficer (waiting to join), "
            "wic / wic (Women in Computing), or admin / admin (staff)."
        )

    def _user(self, username, password, staff, first="", last=""):
        user, _ = User.objects.get_or_create(username=username, defaults={"email": f"{username}@example.com"})
        user.is_staff = staff
        user.is_superuser = staff
        user.first_name, user.last_name = first, last
        user.set_password(password)
        user.save()
        return user

    @staticmethod
    def _at_local_hour(when, hour):
        local = timezone.localtime(when)
        return local.replace(hour=hour, minute=0, second=0, microsecond=0)

    def _make_scans(self, rng, now, plans):
        """Each flyer gets about per_day scans for each weekday it was up (less on weekends), stopping
        a day after its event; taken-down flyers keep a trickle from photos of the flyer."""
        scans = []
        for flyer, per_day in plans:
            if per_day <= 0:
                continue
            start = flyer.posted_at
            end = now
            if flyer.event.end_date:
                event_over = timezone.make_aware(datetime.datetime.combine(flyer.event.end_date + datetime.timedelta(days=2), datetime.time()))
                end = min(end, event_over)
            if flyer.removed_at:
                end = min(end, flyer.removed_at + datetime.timedelta(days=4))
            if end <= start:
                continue
            days = self._weighted_days(start, end)
            count = round(per_day * sum(w for _, w in days) * rng.uniform(0.85, 1.15))
            visitors_today = {}
            for _ in range(count):
                if flyer.removed_at and rng.random() > 0.05:
                    when = self._random_time(rng, days, start, min(end, flyer.removed_at))
                else:
                    when = self._random_time(rng, days, start, end)
                if rng.random() < BOT_RATE:
                    ua = rng.choice(BOT_USER_AGENTS)
                    ip = f"66.249.{rng.randint(0, 255)}.{rng.randint(1, 254)}"
                else:
                    day_key = timezone.localtime(when).date()
                    repeat = visitors_today.get(day_key)
                    if repeat and rng.random() < REPEAT_VISITOR_RATE:
                        ip, ua = rng.choice(repeat)
                    else:
                        ip = f"10.{rng.randint(0, 255)}.{rng.randint(0, 255)}.{rng.randint(1, 254)}"
                        ua = rng.choices([u for _, u in HUMAN_USER_AGENTS], weights=[w for w, _ in HUMAN_USER_AGENTS])[0]
                        visitors_today.setdefault(day_key, []).append((ip, ua))
                scan = Scan(
                    flyer=flyer,
                    visitor_hash=make_visitor_hash(ip, ua, when),
                    user_agent=ua[:MAX_USER_AGENT_LENGTH],
                    device_type=detect_device(ua),
                    is_bot=is_bot(ua),
                )
                scan._planned_at = when
                scans.append(scan)
        return scans

    @staticmethod
    def _weighted_days(start, end):
        days = []
        day = timezone.localtime(start).date()
        last = timezone.localtime(end).date()
        while day <= last:
            days.append((day, 1.0 if day.weekday() < 5 else 0.45))
            day += datetime.timedelta(days=1)
        return days

    @staticmethod
    def _random_time(rng, days, start, end):
        """Pick a weighted day and hour; retry until it falls inside [start, end]."""
        tz = timezone.get_current_timezone()
        for _ in range(50):
            day = rng.choices([d for d, _ in days], weights=[w for _, w in days])[0]
            hour = rng.choices(range(24), weights=HOUR_WEIGHTS)[0]
            minute = rng.randint(0, 59)
            when = datetime.datetime.combine(day, datetime.time(hour, minute, rng.randint(0, 59)), tzinfo=tz)
            if start <= when <= end:
                return when
        return start + (end - start) * rng.random()
