import csv
import io

from django.test import TestCase
from django.urls import reverse
from django.utils import timezone

from pulse.models import Flyer, Membership, SLUG_ALPHABET
from pulse.services import qr

from .helpers import Factory, local_dt


class GeoJSONTests(TestCase):
    def setUp(self):
        self.owner = Factory.user("owner")
        self.event = Factory.event(self.owner, name="Fair")
        self.board = Factory.board("Coffman")
        self.empty_board = Factory.board("Quiet Corner")
        self.retired = Factory.board("Old Kiosk", is_active=False)
        self.flyer = Factory.flyer(self.event, self.board, label="blue")
        # 3 recent human scans (2 unique visitors), 1 old scan, 1 recent bot.
        Factory.scan(self.flyer, local_dt(1), visitor="a")
        Factory.scan(self.flyer, local_dt(1, hour=14), visitor="a")
        Factory.scan(self.flyer, local_dt(2), visitor="b")
        Factory.scan(self.flyer, local_dt(20), visitor="c")
        Factory.scan(self.flyer, local_dt(1), visitor="bot", bot=True)
        self.client.force_login(self.owner)

    def features(self, **params):
        response = self.client.get(reverse("api_boards_geojson"), params)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["type"], "FeatureCollection")
        return {f["properties"]["name"]: f for f in data["features"]}

    def test_all_time_counts(self):
        props = self.features()["Coffman"]["properties"]
        self.assertEqual(props["total_scans"], 4)
        self.assertEqual(props["unique_scans"], 3)
        self.assertEqual(props["active_flyer_count"], 1)
        self.assertEqual(props["flyers"], [{
            "id": self.flyer.id, "slug": self.flyer.slug, "event": "Fair", "event_id": self.event.id,
            "label": "blue", "scans": 4,
        }])

    def test_date_filter(self):
        start = local_dt(7).date().isoformat()
        end = timezone.localdate().isoformat()
        props = self.features(start=start, end=end)["Coffman"]["properties"]
        self.assertEqual((props["total_scans"], props["unique_scans"]), (3, 2))
        self.assertEqual(props["flyers"][0]["scans"], 3)
        props = self.features(range="7d")["Coffman"]["properties"]
        self.assertEqual(props["total_scans"], 3)

    def test_advertisers_only_get_active_boards_and_geometry(self):
        features = self.features()
        self.assertNotIn("Old Kiosk", features)
        self.assertEqual(features["Quiet Corner"]["properties"]["active_flyer_count"], 0)
        self.assertEqual(features["Coffman"]["geometry"]["coordinates"], [-93.234, 44.974])

    def test_removed_flyers_not_listed_but_scans_count(self):
        self.flyer.removed_at = timezone.now()
        self.flyer.save()
        props = self.features()["Coffman"]["properties"]
        self.assertEqual(props["flyers"], [])
        self.assertEqual(props["total_scans"], 4)

    def test_event_filter(self):
        other = Factory.event(self.owner, name="Other")
        Factory.scan(Factory.flyer(other, self.board), local_dt(1), visitor="z")
        self.assertEqual(self.features()["Coffman"]["properties"]["total_scans"], 5)
        self.assertEqual(self.features(event=self.event.pk)["Coffman"]["properties"]["total_scans"], 4)

    def test_query_count_is_constant(self):
        for i in range(5):
            Factory.flyer(self.event, Factory.board(f"Extra {i}"))
        # session, user, and the user's club; then one query each for scan counts, flyers, board tags,
        # and boards. No per-board queries.
        with self.assertNumQueries(7):
            self.client.get(reverse("api_boards_geojson"))


class EventApiTests(TestCase):
    def setUp(self):
        self.owner = Factory.user("owner")
        self.event = Factory.event(self.owner)
        self.board_a = Factory.board("A")
        self.board_b = Factory.board("B")
        fa = Factory.flyer(self.event, self.board_a)
        fb = Factory.flyer(self.event, self.board_b)
        Factory.scan(fa, local_dt(0, hour=9), visitor="1")
        Factory.scan(fb, local_dt(2, hour=12), visitor="2")
        Factory.scan(fb, local_dt(2, hour=12), visitor="3")
        Factory.scan(fb, local_dt(2, hour=12), visitor="bot", bot=True)
        self.fb = fb
        self.client.force_login(self.owner)

    def test_timeseries_is_zero_filled(self):
        rows = self.client.get(reverse("api_event_timeseries", args=[self.event.pk]), {"range": "7d"}).json()
        self.assertEqual(len(rows), 7)
        by_date = {r["date"]: r for r in rows}
        self.assertEqual(by_date[local_dt(2).date().isoformat()], {"date": local_dt(2).date().isoformat(), "total": 2, "unique": 2})
        self.assertEqual(by_date[local_dt(1).date().isoformat()]["total"], 0)
        self.assertEqual(by_date[timezone.localdate().isoformat()]["total"], 1)

    def test_by_board_sorted_descending(self):
        rows = self.client.get(reverse("api_event_by_board", args=[self.event.pk])).json()
        self.assertEqual([(r["board"], r["total"]) for r in rows], [("B", 2), ("A", 1)])

    def test_hourly_uses_campus_time(self):
        rows = self.client.get(reverse("api_flyer_hourly", args=[self.fb.slug])).json()
        self.assertEqual(len(rows), 24)
        self.assertEqual(rows[12]["total"], 2)
        self.assertEqual(sum(r["total"] for r in rows), 2)

    def test_csv_export_excludes_bots_and_hashes(self):
        response = self.client.get(reverse("api_event_export", args=[self.event.pk]))
        self.assertEqual(response["Content-Type"], "text/csv")
        rows = list(csv.reader(io.StringIO(b"".join(response.streaming_content).decode())))
        self.assertEqual(rows[0], ["flyer_slug", "board_name", "scanned_at", "device_type", "after_removal"])
        self.assertEqual(len(rows), 4)
        self.assertNotIn("visitor", ",".join(rows[0]))

    def test_summary_and_flyer_rows(self):
        summary = self.client.get(reverse("api_event_summary", args=[self.event.pk]), {"range": "all"}).json()
        self.assertEqual(summary["total"], 3)
        self.assertEqual(summary["unique"], 3)
        self.assertEqual(summary["active_flyers"], 2)
        self.assertEqual(summary["best_board"]["board"], "B")
        rows = self.client.get(reverse("api_event_flyers", args=[self.event.pk])).json()
        self.assertEqual(sorted((r["board"], r["total_scans"]) for r in rows), [("A", 1), ("B", 2)])
        self.assertTrue(all(r["is_active"] for r in rows))


class FlyerAndQrTests(TestCase):
    def setUp(self):
        self.admin = Factory.user("admin", staff=True)
        self.event = Factory.event(self.admin)
        self.flyer = Factory.flyer(self.event)
        self.client.force_login(self.admin)

    def test_slug_format(self):
        self.assertEqual(len(self.flyer.slug), 8)
        self.assertTrue(set(self.flyer.slug) <= set(SLUG_ALPHABET))
        self.assertFalse(set("0O1lI") & set(SLUG_ALPHABET))

    def test_qr_endpoints(self):
        png = self.client.get(reverse("api_flyer_qr_png", args=[self.flyer.slug]) + "?download=1")
        self.assertEqual(png["Content-Type"], "image/png")
        self.assertTrue(png.content.startswith(b"\x89PNG"))
        self.assertIn("attachment", png["Content-Disposition"])
        svg = self.client.get(reverse("api_flyer_qr_svg", args=[self.flyer.slug]))
        self.assertEqual(svg["Content-Type"], "image/svg+xml")
        self.assertIn(b"<svg", svg.content)

    def test_qr_backgrounds(self):
        transparent = self.client.get(reverse("api_flyer_qr_png", args=[self.flyer.slug])).content
        white = self.client.get(reverse("api_flyer_qr_png", args=[self.flyer.slug]) + "?background=white&download=1")
        self.assertNotEqual(transparent, white.content)
        self.assertIn(b"tRNS", transparent)  # palette transparency chunk
        self.assertNotIn(b"tRNS", white.content)
        self.assertIn("-white.png", white["Content-Disposition"])
        svg = self.client.get(reverse("api_flyer_qr_svg", args=[self.flyer.slug])).content
        self.assertNotIn(b'fill="#fff"', svg)
        svg_white = self.client.get(reverse("api_flyer_qr_svg", args=[self.flyer.slug]) + "?background=white").content
        self.assertIn(b"#fff", svg_white)

    def test_qr_uses_site_url_and_level_h(self):
        with self.settings(SITE_URL="https://campuspulse.app"):
            self.assertEqual(qr.scan_url(self.flyer), f"https://campuspulse.app/r/{self.flyer.slug}/")
            code = qr.make_qr(self.flyer)
            self.assertEqual(code.error, "H")

    def test_print_label_data(self):
        """The print page shows the event name and the short URL as a fallback for failed scans."""
        with self.settings(SITE_URL="https://campuspulse.app"):
            data = self.client.get(reverse("api_flyer_detail", args=[self.flyer.slug])).json()
        self.assertEqual(data["short_url"], f"campuspulse.app/r/{self.flyer.slug}/")
        self.assertEqual(data["event"]["name"], self.event.name)

    def test_remove_and_repost(self):
        response = self.client.post(reverse("api_flyer_remove", args=[self.flyer.slug]))
        self.assertFalse(response.json()["is_active"])
        self.flyer.refresh_from_db()
        self.assertIsNotNone(self.flyer.removed_at)
        new_board = Factory.board("Elsewhere")
        response = self.client.post(reverse("api_flyer_repost", args=[self.flyer.slug]), {"board": new_board.pk}, content_type="application/json")
        new = Flyer.objects.get(board=new_board)
        self.assertEqual(new.event, self.event)
        self.assertNotEqual(new.slug, self.flyer.slug)
        self.assertEqual(response.json(), {"slug": new.slug})

    def test_repost_to_same_board_is_rejected(self):
        response = self.client.post(reverse("api_flyer_repost", args=[self.flyer.slug]), {"board": self.flyer.board_id}, content_type="application/json")
        self.assertEqual(response.status_code, 400)

    def test_detail_payload(self):
        Factory.scan(self.flyer, visitor="a")
        Factory.scan(self.flyer, visitor="b", bot=True)
        data = self.client.get(reverse("api_flyer_detail", args=[self.flyer.slug])).json()
        self.assertEqual(data["counts"]["total"], 1)
        self.assertEqual(data["counts"]["bots"], 1)  # admins see bot counts
        self.assertTrue(data["scan_url"].endswith(f"/r/{self.flyer.slug}/"))
        self.assertEqual(data["devices"], [{"device_type": "mobile", "total": 1}])

        officer = Factory.user("officer")
        Membership.objects.create(club=self.flyer.event.club, user=officer, status=Membership.ACTIVE)
        self.client.force_login(officer)
        data = self.client.get(reverse("api_flyer_detail", args=[self.flyer.slug])).json()
        self.assertNotIn("bots", data["counts"])

    def test_flyer_with_scans_cannot_be_deleted(self):
        from django.db.models import ProtectedError

        Factory.scan(self.flyer)
        with self.assertRaises(ProtectedError):
            self.flyer.delete()

    def test_days_posted_and_scans_per_day(self):
        self.flyer.posted_at = timezone.now() - timezone.timedelta(days=4, hours=1)
        self.flyer.save()
        for v in "abcdefgh":
            Factory.scan(self.flyer, visitor=v)
        Factory.scan(self.flyer, visitor="x", bot=True)
        self.assertEqual(self.flyer.days_posted, 4)
        self.assertEqual(self.flyer.scans_per_day, 2.0)
        self.flyer.posted_at = timezone.now()
        self.assertEqual(self.flyer.days_posted, 1)


class AuthTests(TestCase):
    def setUp(self):
        self.client = self.client_class(enforce_csrf_checks=True)

    def csrf_post(self, name, data):
        token = self.client.get(reverse("api_session")).cookies["csrftoken"].value
        return self.client.post(reverse(name), data, content_type="application/json", HTTP_X_CSRFTOKEN=token)

    def test_session_sets_csrf_cookie_and_config(self):
        response = self.client.get(reverse("api_session"))
        self.assertIn("csrftoken", response.cookies)
        data = response.json()
        self.assertIsNone(data["user"])
        self.assertIn("tiles", data["config"])

    def test_login_requires_csrf(self):
        Factory.user("adv")
        response = self.client.post(reverse("api_login"), {"username": "adv", "password": "pw-12345!"}, content_type="application/json")
        self.assertEqual(response.status_code, 403)

    def test_login_and_logout(self):
        Factory.user("adv")
        self.assertEqual(self.csrf_post("api_login", {"username": "adv", "password": "wrong"}).status_code, 400)
        response = self.csrf_post("api_login", {"username": "adv", "password": "pw-12345!"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["user"], {"id": response.json()["user"]["id"], "username": "adv", "email": "adv@example.com", "full_name": "", "is_staff": False, "club": None, "clubs": []})
        self.assertEqual(self.client.get(reverse("api_session")).json()["user"]["username"], "adv")
        self.assertEqual(self.csrf_post("api_logout", {}).status_code, 204)
        self.assertIsNone(self.client.get(reverse("api_session")).json()["user"])

    def test_signup_creates_advertiser(self):
        response = self.csrf_post("api_signup", {
            "username": "newbie", "email": "n@example.com", "password1": "a-Strong-pass-99", "password2": "a-Strong-pass-99",
        })
        self.assertEqual(response.status_code, 201)
        from django.contrib.auth.models import User

        self.assertFalse(User.objects.get(username="newbie").is_staff)
        self.assertEqual(self.client.get(reverse("api_session")).json()["user"]["username"], "newbie")

    def test_signup_validation_errors(self):
        response = self.csrf_post("api_signup", {"username": "x", "email": "bad", "password1": "a", "password2": "b"})
        self.assertEqual(response.status_code, 400)
        self.assertIn("email", response.json())
        self.assertIn("password2", response.json())

    def test_password_change(self):
        user = Factory.user("adv")
        self.client.force_login(user)
        response = self.csrf_post("api_password_change", {
            "old_password": "pw-12345!", "new_password1": "Another-pass-77", "new_password2": "Another-pass-77",
        })
        self.assertEqual(response.status_code, 204)
        user.refresh_from_db()
        self.assertTrue(user.check_password("Another-pass-77"))
        self.assertEqual(self.client.get(reverse("api_session")).json()["user"]["username"], "adv")  # still logged in

    def test_password_reset_flow(self):
        import re

        from django.core import mail

        user = Factory.user("adv")
        self.assertEqual(self.csrf_post("api_password_reset", {"email": "nobody@example.com"}).status_code, 204)
        self.assertEqual(len(mail.outbox), 0)
        self.assertEqual(self.csrf_post("api_password_reset", {"email": "adv@example.com"}).status_code, 204)
        self.assertEqual(len(mail.outbox), 1)
        uid, token = re.search(r"/reset/([^/]+)/(\S+)", mail.outbox[0].body).groups()

        bad = self.csrf_post("api_password_reset_confirm", {"uid": uid, "token": "nope", "new_password1": "x", "new_password2": "x"})
        self.assertEqual(bad.status_code, 400)
        response = self.csrf_post("api_password_reset_confirm", {
            "uid": uid, "token": token, "new_password1": "Fresh-pass-42", "new_password2": "Fresh-pass-42",
        })
        self.assertEqual(response.status_code, 204)
        user.refresh_from_db()
        self.assertTrue(user.check_password("Fresh-pass-42"))


class SpaTests(TestCase):
    def test_pages_serve_the_react_app(self):
        from django.conf import settings

        index = settings.FRONTEND_DIST / "index.html"
        for path in ("/", "/map", "/events/3", "/flyers/abc/print"):
            with self.subTest(path=path):
                response = self.client.get(path)
                if index.exists():
                    self.assertEqual(response.status_code, 200)
                    self.assertContains(response, '<div id="root">')
                else:
                    self.assertEqual(response.status_code, 503)
                self.assertIn("csrftoken", response.cookies)

    def test_api_and_admin_are_not_swallowed(self):
        self.assertEqual(self.client.get("/api/nope/").status_code, 404)
        self.assertEqual(self.client.get("/admin/").status_code, 302)


class BoardTagTests(TestCase):
    def test_tags_are_unique_and_readable(self):
        from pulse.services.tags import tag_map

        willey = Factory.board("Willey Hall - East", building="Willey Hall")
        wilkins = Factory.board("Wilkins Hall", building="Wilkins Hall")
        east1 = Factory.board("Jones Hall - East 1", building="Jones Hall")
        east2 = Factory.board("Jones Hall - East 2", building="Jones Hall")
        coffman = Factory.board("Coffman Union", building="Coffman Memorial Union")
        tags = tag_map()
        self.assertEqual(len(set(tags.values())), len(tags))
        self.assertEqual(tags[coffman.id], "CMU")
        self.assertEqual((tags[willey.id], tags[wilkins.id]), ("WILL", "WILK"))
        self.assertEqual((tags[east1.id], tags[east2.id]), ("JON1", "JON2"))

        self.client.force_login(Factory.user("adv"))
        rows = self.client.get(reverse("api_boards")).json()
        self.assertEqual({r["name"]: r["tag"] for r in rows}["Coffman Union"], "CMU")

