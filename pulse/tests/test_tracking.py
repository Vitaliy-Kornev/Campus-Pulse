import datetime
from unittest import mock

from django.db import connection
from django.test import TestCase
from django.utils import timezone

from pulse.models import Scan
from pulse.services import analytics
from pulse.services.tracking import detect_device, is_bot

from .helpers import IPHONE_UA, Factory


class BotAndDeviceDetectionTests(TestCase):
    def test_known_bots_are_flagged(self):
        for ua in [
            "facebookexternalhit/1.1",
            "Slackbot-LinkExpanding 1.0",
            "Mozilla/5.0 (compatible; Discordbot/2.0)",
            "Twitterbot/1.0",
            "WhatsApp/2.23.20.0",
            "TelegramBot (like TwitterBot)",
            "LinkedInBot/1.0",
            "Mozilla/5.0 (Applebot/0.1)",
            "Mozilla/5.0 (compatible; Googlebot/2.1)",
            "Mozilla/5.0 (compatible; bingbot/2.0)",
            "curl/8.4.0",
            "python-requests/2.31",
            "Mozilla/5.0 HeadlessChrome/120.0",
            "SomeCrawler/1.0",
            "",
        ]:
            with self.subTest(ua=ua):
                self.assertTrue(is_bot(ua))
        self.assertFalse(is_bot(IPHONE_UA))

    def test_device_types(self):
        self.assertEqual(detect_device(IPHONE_UA), "mobile")
        self.assertEqual(detect_device("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)"), "tablet")
        self.assertEqual(detect_device("Mozilla/5.0 (Linux; Android 14; SM-X710) Safari/537.36"), "tablet")
        self.assertEqual(detect_device("Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile Safari/537.36"), "mobile")
        self.assertEqual(detect_device("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120"), "desktop")
        self.assertEqual(detect_device(""), "unknown")


class CountingTests(TestCase):
    def setUp(self):
        self.owner = Factory.user()
        self.event = Factory.event(self.owner)
        self.flyer = Factory.flyer(self.event)
        self.url = f"/r/{self.flyer.slug}/"

    def test_bot_scans_are_stored_but_excluded_from_counts(self):
        self.client.get(self.url, HTTP_USER_AGENT=IPHONE_UA)
        self.client.get(self.url, HTTP_USER_AGENT="facebookexternalhit/1.1")
        self.assertEqual(Scan.objects.count(), 2)
        self.assertEqual(Scan.objects.filter(is_bot=True).count(), 1)
        rng = analytics.resolve_range({}, default="all")
        self.assertEqual(analytics.totals(analytics.event_scans(self.event, rng)), {"total": 1, "unique": 1})
        self.assertEqual(analytics.flyer_counts(self.flyer)["bots"], 1)

    def _scan_at(self, when):
        with mock.patch("django.utils.timezone.now", return_value=when):
            self.client.get(self.url, HTTP_USER_AGENT=IPHONE_UA, REMOTE_ADDR="198.51.100.7")

    def test_same_visitor_twice_in_a_day_counts_once(self):
        morning = timezone.now().replace(hour=15, minute=0)
        self._scan_at(morning)
        self._scan_at(morning + datetime.timedelta(hours=2))
        rng = analytics.resolve_range({}, default="all")
        self.assertEqual(analytics.totals(analytics.event_scans(self.event, rng)), {"total": 2, "unique": 1})

    def test_same_visitor_on_two_days_counts_twice(self):
        day1 = timezone.now().replace(hour=15, minute=0) - datetime.timedelta(days=1)
        self._scan_at(day1)
        self._scan_at(day1 + datetime.timedelta(days=1))
        rng = analytics.resolve_range({}, default="all")
        self.assertEqual(analytics.totals(analytics.event_scans(self.event, rng)), {"total": 2, "unique": 2})

    def test_raw_ip_never_stored(self):
        ip = "203.0.113.77"
        self.client.get(self.url, HTTP_USER_AGENT=IPHONE_UA, REMOTE_ADDR=ip)
        self.client.get(self.url, HTTP_USER_AGENT=IPHONE_UA, HTTP_X_FORWARDED_FOR=f"{ip}, 10.0.0.1")
        self.assertEqual(Scan.objects.count(), 2)
        # Search every text column of every table in the database.
        with connection.cursor() as cursor:
            for table in connection.introspection.table_names():
                cursor.execute(f'SELECT * FROM "{table}"')
                for row in cursor.fetchall():
                    self.assertNotIn(ip, " ".join(str(v) for v in row), f"raw IP found in {table}")

    def test_forwarded_for_trusts_only_our_proxy(self):
        # The proxy appends the real address; whatever the client put before it is ignored, so a
        # script can't pose as new visitors by inventing IPs.
        for fake in ("1.1.1.1", "2.2.2.2", "3.3.3.3"):
            self.client.get(self.url, HTTP_USER_AGENT=IPHONE_UA, HTTP_X_FORWARDED_FOR=f"{fake}, 203.0.113.5")
        self.assertEqual(Scan.objects.count(), 1)  # one visitor, and rescans within minutes count once
        self.client.get(self.url, HTTP_USER_AGENT=IPHONE_UA, HTTP_X_FORWARDED_FOR="198.51.100.7")
        self.assertEqual(len(set(Scan.objects.values_list("visitor_hash", flat=True))), 2)

    def test_rescans_within_minutes_count_once_but_still_redirect(self):
        for _ in range(3):
            response = self.client.get(self.url, HTTP_USER_AGENT=IPHONE_UA)
            self.assertEqual(response.status_code, 302)
        self.assertEqual(Scan.objects.count(), 1)
