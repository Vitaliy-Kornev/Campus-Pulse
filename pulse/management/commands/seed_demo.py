"""Seed the UMN campus, its boards, demo users, campaigns, flyers, and ~2,000 realistic scans.

Safe to re-run: boards are updated by name and the demo campaigns are rebuilt from scratch.
"""

import datetime
import random
from decimal import Decimal

from django.conf import settings
from django.contrib.auth.models import User
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from pulse.models import Board, Campaign, Flyer, Scan
from pulse.services.boards import get_default_campus, import_boards
from pulse.services.tracking import MAX_USER_AGENT_LENGTH, detect_device, is_bot, make_visitor_hash

TARGET_SCANS = 2000
BOT_RATE = 0.05
REPEAT_VISITOR_RATE = 0.15

# How busy each spot is. Unlisted boards default to 1.0.
BOARD_POPULARITY = {
    "Coffman Union - Posting Areas": 3.2,
    "Washington Ave Pedestrian Bridge - East": 2.6,
    "Washington Ave Pedestrian Bridge - West": 2.0,
    "Walter Library - Northrop Mall": 2.0,
    "Willey Hall - East": 1.6,
    "RecWell Center - Bulletin Boards": 1.5,
    "Keller Hall - CS&E Main Office": 1.3,
    "Pioneer Hall": 1.2,
    "Frontier Hall": 1.0,
    "Comstock Hall": 0.9,
    "Carlson School - Level 1": 0.9,
    "Mechanical Engineering - North": 0.7,
    "Anderson Hall - Northwest 1": 0.6,
    "Middlebrook Hall": 0.5,
    "St. Paul Student Center - Posting Areas": 0.45,
    "Akerman Hall - AEM Grad Lounge": 0.3,
}

# (board name, label, posted days ago, removed days ago or None)
CAMPAIGNS = [
    {
        "name": "Fall Career Fair 2026",
        "destination_url": "https://example.com/career-fair",
        "appeal": 1.0,
        "flyers": [
            ("Coffman Union - Posting Areas", "blue design", 28, None),
            ("Washington Ave Pedestrian Bridge - East", "", 28, None),
            ("Walter Library - Northrop Mall", "", 27, None),
            ("Keller Hall - CS&E Main Office", "", 27, None),
            ("Carlson School - Level 1", "", 26, None),
            ("Willey Hall - East", "", 26, 6),
        ],
    },
    {
        "name": "Gopher Hackathon",
        "destination_url": "https://example.com/hackathon",
        "appeal": 0.8,
        "flyers": [
            ("Mechanical Engineering - North", "", 21, None),
            ("Akerman Hall - AEM Grad Lounge", "", 21, 9),
            ("Washington Ave Pedestrian Bridge - West", "", 20, None),
            ("Comstock Hall", "", 19, None),
            ("RecWell Center - Bulletin Boards", "", 19, None),
        ],
    },
    {
        "name": "Intramural Volleyball Signups",
        "destination_url": "https://example.com/intramurals",
        "appeal": 1.2,
        "flyers": [
            ("Pioneer Hall", "", 15, None),
            ("Frontier Hall", "", 15, None),
            ("Middlebrook Hall", "", 14, None),
            ("Anderson Hall - Northwest 1", "", 14, None),
            ("St. Paul Student Center - Posting Areas", "", 13, None),
            ("Coffman Union - Posting Areas", "orange design", 12, None),
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
    help = "Create the UMN campus, boards, demo users, campaigns, flyers, and realistic scans."

    def add_arguments(self, parser):
        parser.add_argument("--seed", type=int, default=None, help="Random seed for reproducible data")

    @transaction.atomic
    def handle(self, *args, **options):
        rng = random.Random(options["seed"])
        now = timezone.now()

        campus = get_default_campus()
        campus.name = settings.CAMPUS_NAME
        campus.center_latitude = Decimal(str(settings.CAMPUS_CENTER[0]))
        campus.center_longitude = Decimal(str(settings.CAMPUS_CENTER[1]))
        campus.default_zoom = settings.CAMPUS_DEFAULT_ZOOM
        campus.save()

        with (settings.BASE_DIR / "boards_umn.csv").open(newline="", encoding="utf-8-sig") as handle:
            created, updated = import_boards(handle, campus=campus)
        self.stdout.write(f"Boards: {created} created, {updated} updated.")

        admin = self._user("admin", "admin", staff=True)
        demo = self._user("demo", "demo", staff=False)
        self.stdout.write("Users: admin / admin (staff), demo / demo (advertiser).")

        # Rebuild the demo campaigns (cascades to their flyers and scans).
        Campaign.objects.filter(owner=demo, name__in=[c["name"] for c in CAMPAIGNS]).delete()

        boards = {b.name: b for b in Board.objects.filter(campus=campus)}
        flyer_plans = []
        today = timezone.localdate()
        for spec in CAMPAIGNS:
            campaign = Campaign.objects.create(
                owner=demo,
                name=spec["name"],
                destination_url=spec["destination_url"],
                start_date=today - datetime.timedelta(days=30),
                end_date=today + datetime.timedelta(days=30),
            )
            for board_name, label, posted_ago, removed_ago in spec["flyers"]:
                posted_at = self._at_local_hour(now - datetime.timedelta(days=posted_ago), rng.randint(8, 16))
                removed_at = self._at_local_hour(now - datetime.timedelta(days=removed_ago), rng.randint(8, 16)) if removed_ago else None
                flyer = Flyer.objects.create(
                    campaign=campaign, board=boards[board_name], label=label, posted_at=posted_at, removed_at=removed_at
                )
                weight = BOARD_POPULARITY.get(board_name, 1.0) * spec["appeal"]
                flyer_plans.append((flyer, weight))

        scans = self._make_scans(rng, now, flyer_plans)
        created_scans = Scan.objects.bulk_create(scans, batch_size=500)
        # scanned_at is auto_now_add, so bulk_create stamps "now"; set the generated times afterwards.
        for scan, original in zip(created_scans, scans):
            scan.scanned_at = original._planned_at
        Scan.objects.bulk_update(created_scans, ["scanned_at"], batch_size=500)

        bots = sum(1 for s in scans if s.is_bot)
        self.stdout.write(self.style.SUCCESS(
            f"Seeded {len(CAMPAIGNS)} campaigns, {len(flyer_plans)} flyers, {len(scans)} scans ({bots} bots)."
        ))
        self.stdout.write(f"Admin user id {admin.pk}. Log in at {settings.SITE_URL}/accounts/login/")

    def _user(self, username, password, staff):
        user, _ = User.objects.get_or_create(username=username, defaults={"email": f"{username}@example.com"})
        user.is_staff = staff
        user.is_superuser = staff
        user.set_password(password)
        user.save()
        return user

    @staticmethod
    def _at_local_hour(when, hour):
        local = timezone.localtime(when)
        return local.replace(hour=hour, minute=0, second=0, microsecond=0)

    def _make_scans(self, rng, now, flyer_plans):
        """Spread TARGET_SCANS across flyers by popularity × days posted, with daily and weekly rhythm."""
        window_start = now - datetime.timedelta(days=30)
        exposure = []
        for flyer, weight in flyer_plans:
            start = max(flyer.posted_at, window_start)
            end = flyer.removed_at or now
            days = max(1.0, (end - start).total_seconds() / 86400)
            exposure.append(weight * days)
        total_exposure = sum(exposure)

        scans = []
        for (flyer, _), exp in zip(flyer_plans, exposure):
            count = round(TARGET_SCANS * exp / total_exposure)
            start = max(flyer.posted_at, window_start)
            # Removed flyers keep getting a trickle of scans from photos of the flyer.
            end = (flyer.removed_at + datetime.timedelta(days=4)) if flyer.removed_at else now
            end = min(end, now)
            days = self._weighted_days(start, end)
            visitors_today = {}
            for _ in range(count):
                if flyer.removed_at and rng.random() > 0.05:
                    when = self._random_time(rng, days, start, flyer.removed_at)
                else:
                    when = self._random_time(rng, days, start, end)
                bot = rng.random() < BOT_RATE
                if bot:
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
