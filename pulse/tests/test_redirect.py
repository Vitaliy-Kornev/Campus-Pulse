from unittest import mock

from django.test import TestCase

from pulse.models import Scan

from .helpers import IPHONE_UA, Factory


class HealthCheckTests(TestCase):
    def test_healthz_answers_any_host_without_redirect(self):
        with self.settings(SECURE_SSL_REDIRECT=True, ALLOWED_HOSTS=["campuspulse.app"]):
            response = self.client.get("/healthz", HTTP_HOST="172.26.1.5")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.content, b"ok")

    def test_healthz_fails_when_the_database_is_down(self):
        with mock.patch("pulse.middleware.connection.cursor", side_effect=Exception("down")), self.assertLogs("pulse.middleware", "ERROR"):
            response = self.client.get("/healthz")
        self.assertEqual(response.status_code, 503)


class UnknownHostTests(TestCase):
    def test_scanners_using_other_hostnames_are_refused_without_logging_an_error(self):
        # The live error alarm emails on any ERROR line; bots probing the IP mustn't trigger it.
        with self.settings(ALLOWED_HOSTS=["campus-pulse.com"]), self.assertNoLogs(level="ERROR"):
            response = self.client.get("/", HTTP_HOST="18.222.51.177")
        self.assertEqual(response.status_code, 400)


class ScanRedirectTests(TestCase):
    def setUp(self):
        self.owner = Factory.user()
        self.event = Factory.event(self.owner, url="https://example.com/event")
        self.flyer = Factory.flyer(self.event)

    def test_logs_scan_and_redirects_to_event_url(self):
        response = self.client.get(f"/r/{self.flyer.slug}/", HTTP_USER_AGENT=IPHONE_UA)
        self.assertEqual(response.status_code, 302)
        self.assertEqual(response["Location"], "https://example.com/event")
        self.assertEqual(response["Cache-Control"], "no-store")
        scan = Scan.objects.get()
        self.assertEqual(scan.flyer, self.flyer)
        self.assertEqual(scan.device_type, "mobile")
        self.assertFalse(scan.is_bot)
        self.assertEqual(len(scan.visitor_hash), 64)

    def test_uses_destination_override(self):
        self.flyer.destination_override = "https://example.com/variant-b"
        self.flyer.save()
        response = self.client.get(f"/r/{self.flyer.slug}/", HTTP_USER_AGENT=IPHONE_UA)
        self.assertEqual(response["Location"], "https://example.com/variant-b")

    def test_still_redirects_when_saving_scan_fails(self):
        with mock.patch("pulse.services.tracking.Scan.objects.create", side_effect=RuntimeError("db down")):
            with self.assertLogs("pulse.services.tracking", level="ERROR"):
                response = self.client.get(f"/r/{self.flyer.slug}/", HTTP_USER_AGENT=IPHONE_UA)
        self.assertEqual(response.status_code, 302)
        self.assertEqual(response["Location"], "https://example.com/event")
        self.assertEqual(Scan.objects.count(), 0)

    def test_unknown_slug_returns_friendly_404(self):
        response = self.client.get("/r/doesnotexist/")
        self.assertEqual(response.status_code, 404)
        self.assertContains(response, "isn't active", status_code=404)
        self.assertEqual(Scan.objects.count(), 0)

    def test_removed_flyer_still_redirects_and_logs(self):
        from django.utils import timezone

        self.flyer.removed_at = timezone.now()
        self.flyer.save()
        response = self.client.get(f"/r/{self.flyer.slug}/", HTTP_USER_AGENT=IPHONE_UA)
        self.assertEqual(response.status_code, 302)
        self.assertEqual(Scan.objects.count(), 1)

    def test_no_login_or_session_needed(self):
        response = self.client.get(f"/r/{self.flyer.slug}/", HTTP_USER_AGENT=IPHONE_UA)
        self.assertNotIn("sessionid", response.cookies)
        self.assertNotIn("Cookie", response.get("Vary", ""))

    def test_user_agent_is_capped(self):
        self.client.get(f"/r/{self.flyer.slug}/", HTTP_USER_AGENT="Mozilla/5.0 " + "x" * 2000)
        self.assertEqual(len(Scan.objects.get().user_agent), 500)
