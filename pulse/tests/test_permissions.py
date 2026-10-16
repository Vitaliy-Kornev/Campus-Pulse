from django.test import TestCase
from django.urls import reverse

from pulse.models import Board, Flyer

from .helpers import Factory


class OwnershipScopingTests(TestCase):
    """Advertisers only ever see their own events. Other users' objects are 404, not 403."""

    def setUp(self):
        self.alice = Factory.user("alice")
        self.bob = Factory.user("bob")
        self.bob_event = Factory.event(self.bob, name="Bob's Secret Event")
        self.bob_flyer = Factory.flyer(self.bob_event)
        Factory.scan(self.bob_flyer)
        self.alice_event = Factory.event(self.alice, name="Alice Event")
        self.client.force_login(self.alice)

    def test_cannot_see_other_events(self):
        pk = self.bob_event.pk
        for name in (
            "api_event_detail", "api_event_summary", "api_event_flyers",
            "api_event_timeseries", "api_event_by_board", "api_event_export",
        ):
            with self.subTest(name=name):
                self.assertEqual(self.client.get(reverse(name, args=[pk])).status_code, 404)
        response = self.client.patch(reverse("api_event_detail", args=[pk]), {"name": "Mine now"}, content_type="application/json")
        self.assertEqual(response.status_code, 404)
        self.bob_event.refresh_from_db()
        self.assertEqual(self.bob_event.name, "Bob's Secret Event")

    def test_cannot_see_other_flyers(self):
        slug = self.bob_flyer.slug
        for name in ("api_flyer_detail", "api_flyer_qr_png", "api_flyer_qr_svg", "api_flyer_hourly", "api_flyer_timeseries"):
            with self.subTest(name=name):
                self.assertEqual(self.client.get(reverse(name, args=[slug])).status_code, 404)

    def test_geojson_event_filter_is_scoped(self):
        url = reverse("api_boards_geojson") + f"?event={self.bob_event.pk}"
        self.assertEqual(self.client.get(url).status_code, 404)

    def test_geojson_excludes_other_advertisers_flyers_and_scans(self):
        response = self.client.get(reverse("api_boards_geojson"))
        board = next(f for f in response.json()["features"] if f["properties"]["id"] == self.bob_flyer.board_id)
        self.assertEqual(board["properties"]["total_scans"], 0)
        self.assertEqual(board["properties"]["flyers"], [])
        self.assertNotContains(response, "Secret")

    def test_event_list_only_shows_own(self):
        names = [c["name"] for c in self.client.get(reverse("api_events")).json()]
        self.assertEqual(names, ["Alice Event"])

    def test_leaderboard_only_counts_own_events(self):
        def board_row():
            rows = self.client.get(reverse("api_board_leaderboard")).json()
            return next(b for b in rows if b["id"] == self.bob_flyer.board_id)

        row = board_row()
        self.assertEqual((row["lifetime_scans"], row["flyer_count"], row["avg_scans_per_flyer_day"]), (0, 0, 0))

        # Alice's own flyer on the same board counts once a student scans it.
        alice_flyer = Factory.flyer(self.alice_event, self.bob_flyer.board)
        Factory.scan(alice_flyer, visitor="x")
        Factory.scan(alice_flyer, visitor="bot", bot=True)
        row = board_row()
        self.assertEqual((row["lifetime_scans"], row["flyer_count"]), (1, 1))

        self.client.force_login(Factory.user("boss", staff=True))
        row = board_row()
        self.assertEqual((row["lifetime_scans"], row["flyer_count"]), (2, 2))

    def test_staff_sees_everything(self):
        self.client.force_login(Factory.user("boss", staff=True))
        self.assertEqual(self.client.get(reverse("api_event_detail", args=[self.bob_event.pk])).status_code, 200)
        self.assertEqual(self.client.get(reverse("api_flyer_detail", args=[self.bob_flyer.slug])).status_code, 200)
        names = {c["name"] for c in self.client.get(reverse("api_events")).json()}
        self.assertEqual(names, {"Alice Event", "Bob's Secret Event"})

    def test_anonymous_users_get_401(self):
        self.client.logout()
        for url in (reverse("api_boards_geojson"), reverse("api_events"), reverse("api_flyer_detail", args=[self.bob_flyer.slug])):
            with self.subTest(url=url):
                self.assertEqual(self.client.get(url).status_code, 401)
        self.assertIsNone(self.client.get(reverse("api_session")).json()["user"])


class StaffOnlyTests(TestCase):
    def setUp(self):
        self.advertiser = Factory.user("adv")
        self.event = Factory.event(self.advertiser)
        self.board = Factory.board("Existing")
        self.client.force_login(self.advertiser)

    def post(self, name, data=None, args=None):
        return self.client.post(reverse(name, args=args), data or {}, content_type="application/json")

    def test_advertiser_can_add_board_that_goes_live(self):
        # is_active=False would retire it if it were honored; advertisers can't retire boards.
        payload = {"name": "Dorm Lobby", "area": "East Bank", "building": "X", "latitude": "44.97", "longitude": "-93.23", "is_active": False}
        self.assertEqual(self.post("api_boards", payload).status_code, 201)
        board = Board.objects.get(name="Dorm Lobby")
        self.assertTrue(board.is_active)
        self.assertEqual(board.created_by, self.advertiser)
        names = [f["properties"]["name"] for f in self.client.get(reverse("api_boards_geojson")).json()["features"]]
        self.assertIn("Dorm Lobby", names)

    def test_board_names_are_unique(self):
        payload = {"name": "Existing", "area": "East Bank", "building": "X", "latitude": "44.97", "longitude": "-93.23"}
        response = self.post("api_boards", payload)
        self.assertEqual(response.status_code, 400)
        self.assertIn("name", response.json())

    def test_non_staff_cannot_manage_boards(self):
        url = reverse("api_board_detail", args=[self.board.pk])
        self.assertEqual(self.client.get(url).status_code, 403)
        for payload in ({"latitude": 1, "longitude": 1}, {"is_active": False}):
            self.assertEqual(self.client.patch(url, payload, content_type="application/json").status_code, 403)
        self.board.refresh_from_db()
        self.assertTrue(self.board.is_active)

    def test_retired_boards_hidden_from_advertisers(self):
        Factory.board("Retired Kiosk", is_active=False)
        names = [f["properties"]["name"] for f in self.client.get(reverse("api_boards_geojson")).json()["features"]]
        self.assertNotIn("Retired Kiosk", names)
        self.assertNotContains(self.client.get(reverse("api_board_leaderboard")), "Retired Kiosk")
        self.assertNotContains(self.client.get(reverse("api_boards")), "Retired Kiosk")

        self.client.force_login(Factory.user("admin", staff=True))
        features = {f["properties"]["name"]: f for f in self.client.get(reverse("api_boards_geojson")).json()["features"]}
        self.assertFalse(features["Retired Kiosk"]["properties"]["is_active"])
        self.assertTrue(features["Existing"]["properties"]["is_active"])
        self.assertContains(self.client.get(reverse("api_board_leaderboard")), "Retired Kiosk")
        self.assertContains(self.client.get(reverse("api_boards")), "Retired Kiosk")

    def test_advertiser_can_post_and_manage_own_flyers(self):
        payload = {"board": self.board.pk, "event": self.event.pk, "posted_at": "2026-01-01T10:00"}
        response = self.post("api_flyers", payload)
        self.assertEqual(response.status_code, 201)
        flyer = Flyer.objects.get()
        self.assertEqual(response.json(), {"slug": flyer.slug})
        self.assertEqual(flyer.event, self.event)

        self.post("api_flyer_remove", args=[flyer.slug])
        flyer.refresh_from_db()
        self.assertIsNotNone(flyer.removed_at)
        other_board = Factory.board("Other spot")
        self.assertEqual(self.post("api_flyer_repost", {"board": other_board.pk}, args=[flyer.slug]).status_code, 201)
        self.assertTrue(Flyer.objects.filter(event=self.event, board=other_board).exists())

    def test_advertiser_cannot_post_or_manage_others_flyers(self):
        other_event = Factory.event(Factory.user("rival"))
        payload = {"board": self.board.pk, "event": other_event.pk, "posted_at": "2026-01-01T10:00"}
        response = self.post("api_flyers", payload)
        self.assertEqual(response.status_code, 400)  # not one of your events
        self.assertIn("event", response.json())
        self.assertFalse(Flyer.objects.filter(event=other_event).exists())

        rival_flyer = Factory.flyer(other_event, self.board)
        self.assertEqual(self.post("api_flyer_remove", args=[rival_flyer.slug]).status_code, 404)
        self.assertEqual(self.post("api_flyer_repost", {"board": self.board.pk}, args=[rival_flyer.slug]).status_code, 404)
        rival_flyer.refresh_from_db()
        self.assertIsNone(rival_flyer.removed_at)

    def test_cannot_post_flyer_on_retired_board(self):
        retired = Factory.board("Gone", is_active=False)
        response = self.post("api_flyers", {"board": retired.pk, "event": self.event.pk})
        self.assertEqual(response.status_code, 400)
        self.assertIn("board", response.json())

    def test_staff_can_create_board_and_flyer(self):
        self.client.force_login(Factory.user("admin", staff=True))
        payload = {"name": "New Spot", "area": "East Bank", "building": "Hall", "latitude": "44.975", "longitude": "-93.235", "is_active": True}
        self.assertEqual(self.post("api_boards", payload).status_code, 201)
        board = Board.objects.get(name="New Spot")
        response = self.post("api_flyers", {"board": board.pk, "event": self.event.pk, "posted_at": "2026-01-01T10:00"})
        self.assertEqual(response.status_code, 201)
        flyer = Flyer.objects.get(board=board)
        self.assertEqual(len(flyer.slug), 8)

    def test_staff_can_move_edit_and_retire_board(self):
        self.client.force_login(Factory.user("admin", staff=True))
        url = reverse("api_board_detail", args=[self.board.pk])
        response = self.client.patch(url, {"latitude": "44.981234", "longitude": "-93.231111"}, content_type="application/json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["latitude"], 44.981234)
        self.board.refresh_from_db()
        self.assertEqual(str(self.board.latitude), "44.981234")

        self.client.patch(url, {"name": "Renamed", "is_active": False}, content_type="application/json")
        self.board.refresh_from_db()
        self.assertEqual((self.board.name, self.board.is_active), ("Renamed", False))

    def test_coordinates_must_be_in_range(self):
        self.client.force_login(Factory.user("admin", staff=True))
        url = reverse("api_board_detail", args=[self.board.pk])
        response = self.client.patch(url, {"latitude": "91"}, content_type="application/json")
        self.assertEqual(response.status_code, 400)


class ValidationTests(TestCase):
    def test_destination_must_be_http_or_https(self):
        user = Factory.user()
        club = Factory.club_of(user)
        self.client.force_login(user)
        url = reverse("api_events")
        for destination in ("javascript:alert(1)", "ftp://example.com/file"):
            response = self.client.post(url, {"name": "X", "destination_url": destination}, content_type="application/json")
            self.assertEqual(response.status_code, 400)
            self.assertIn("destination_url", response.json())
        self.assertFalse(club.events.exists())
        response = self.client.post(url, {"name": "X", "destination_url": "https://example.com"}, content_type="application/json")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["club"], club.name)

    def test_end_date_after_start(self):
        user = Factory.user()
        Factory.club_of(user)
        self.client.force_login(user)
        response = self.client.post(
            reverse("api_events"),
            {"name": "X", "destination_url": "https://example.com", "start_date": "2026-05-02", "end_date": "2026-05-01"},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("end_date", response.json())
