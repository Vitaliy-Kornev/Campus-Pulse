from django.core import mail
from django.test import TestCase
from django.urls import reverse

from pulse.models import Event

from .helpers import Factory


def post(client, name, data=None, args=None, **extra):
    return client.post(reverse(name, args=args), data or {}, content_type="application/json", **extra)


class LoginLimitTests(TestCase):
    def setUp(self):
        Factory.user("officer")

    def login(self, password, **extra):
        return post(self.client, "api_login", {"username": "officer", "password": password}, **extra)

    def test_five_wrong_passwords_lock_the_account_for_a_while(self):
        for _ in range(5):
            self.assertEqual(self.login("wrong").status_code, 400)
        locked = self.login("pw-12345!")  # even the right password, until the window passes
        self.assertEqual(locked.status_code, 429)
        self.assertIn("Wait 15 minutes", locked.json()["detail"])

    def test_a_good_login_resets_the_count(self):
        for _ in range(4):
            self.login("wrong")
        self.assertEqual(self.login("pw-12345!").status_code, 200)
        self.client.logout()
        for _ in range(4):
            self.assertEqual(self.login("wrong").status_code, 400)

    def test_lockout_is_per_account_not_per_network(self):
        for _ in range(5):
            self.login("wrong")
        Factory.user("classmate")
        ok = post(self.client, "api_login", {"username": "classmate", "password": "pw-12345!"})
        self.assertEqual(ok.status_code, 200)


class ResetLimitTests(TestCase):
    def test_reset_emails_stop_quietly_after_three_an_hour(self):
        Factory.user("officer")
        for _ in range(5):
            self.assertEqual(post(self.client, "api_password_reset", {"email": "officer@example.com"}).status_code, 204)
        self.assertEqual(len(mail.outbox), 3)


class SignupLimitTests(TestCase):
    def test_signups_from_one_network_are_capped(self):
        codes = []
        for i in range(21):
            self.client.logout()
            data = {"username": f"new{i}", "email": f"new{i}@example.com", "password1": "Gopher-pass-2026", "password2": "Gopher-pass-2026"}
            codes.append(post(self.client, "api_signup", data, HTTP_X_FORWARDED_FOR="198.51.100.9").status_code)
        self.assertEqual(codes[:20], [201] * 20)
        self.assertEqual(codes[20], 429)


class CreateLimitTests(TestCase):
    def setUp(self):
        self.officer = Factory.user("officer")
        Factory.club("Gopher Coders", officers=[self.officer])
        self.client.force_login(self.officer)

    def test_join_requests_are_capped_per_day(self):
        clubs = [Factory.club(f"Club {i}", officers=[Factory.user(f"o{i}")]) for i in range(21)]
        codes = [post(self.client, "api_club_join", args=[c.pk]).status_code for c in clubs]
        self.assertEqual(codes[:20], [201] * 20)
        self.assertEqual(codes[20], 429)

    def test_same_event_twice_is_refused(self):
        data = {"name": "Intro to Git", "destination_url": "https://example.com/git", "event_type": "workshop", "start_date": "2026-11-01"}
        self.assertEqual(post(self.client, "api_events", data).status_code, 201)
        again = post(self.client, "api_events", {**data, "name": "intro to git"})
        self.assertEqual(again.status_code, 400)
        self.assertIn("already has an event", again.json()["name"][0])
        self.assertEqual(Event.objects.count(), 1)
        # A different date is a different event.
        self.assertEqual(post(self.client, "api_events", {**data, "start_date": "2026-12-01"}).status_code, 201)


class BrowserErrorTests(TestCase):
    def test_browser_errors_are_logged_without_query_strings(self):
        with self.assertLogs("pulse.browser", "ERROR") as logs:
            response = post(self.client, "api_client_errors", {"message": "boom", "stack": "at x", "page": "/events/3?token=secret"})
        self.assertEqual(response.status_code, 204)
        self.assertIn("Browser error on /events/3: boom", logs.output[0])
        self.assertNotIn("secret", logs.output[0])

    def test_reports_per_network_are_capped(self):
        with self.assertLogs("pulse.browser", "ERROR") as logs:
            for _ in range(35):
                post(self.client, "api_client_errors", {"message": "loop"})
        self.assertEqual(len(logs.output), 30)
