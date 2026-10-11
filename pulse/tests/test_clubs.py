import datetime
import json

from django.test import TestCase
from django.urls import reverse
from django.utils import timezone

from pulse.models import Club, Event, Membership, Notification
from pulse.services import notifications
from pulse.services.recommendations import recommend_boards

from .helpers import Factory, IPHONE_UA, local_dt


def post(client, name, data=None, args=None):
    return client.post(reverse(name, args=args), data or {}, content_type="application/json")


class ClubMembershipTests(TestCase):
    def setUp(self):
        self.founder = Factory.user("founder")
        self.client.force_login(self.founder)

    def create_club(self, **overrides):
        data = {"name": "Gopher Coders", "club_type": "academic", "fields": ["computer-science"], **overrides}
        return post(self.client, "api_clubs", data)

    def test_create_club_makes_founder_an_officer(self):
        response = self.create_club()
        self.assertEqual(response.status_code, 201)
        session = self.client.get(reverse("api_session")).json()
        self.assertEqual(session["user"]["club"]["name"], "Gopher Coders")
        self.assertEqual([(c["name"], c["status"]) for c in session["user"]["clubs"]], [("Gopher Coders", "active")])

    def test_club_names_are_unique_and_fields_validated(self):
        self.create_club()
        other = Factory.user("other")
        self.client.force_login(other)
        self.assertEqual(self.create_club(name="gopher  coders").status_code, 400)
        self.assertEqual(self.create_club(name="New Club", fields=["not-a-field"]).status_code, 400)
        self.assertEqual(self.create_club(name="New Club", fields=[]).status_code, 400)

    def test_join_request_needs_approval(self):
        club = Club.objects.get(pk=self.create_club().json()["id"])
        Factory.event(club, name="Club Event")
        newcomer = Factory.user("newcomer")
        self.client.force_login(newcomer)
        self.assertEqual(post(self.client, "api_club_join", args=[club.pk]).status_code, 201)
        # Pending: sees nothing of the club yet.
        self.assertEqual(self.client.get(reverse("api_events")).json(), [])
        self.assertEqual(self.client.get(reverse("api_my_club")).status_code, 403)
        self.assertTrue(Notification.objects.filter(club=club, kind=Notification.JOIN_REQUEST).exists())

        self.client.force_login(self.founder)
        membership = Membership.objects.get(user=newcomer)
        response = post(self.client, "api_club_member_action", args=[membership.pk, "approve"])
        self.assertEqual(response.status_code, 200)
        self.assertFalse(Notification.objects.filter(club=club, kind=Notification.JOIN_REQUEST).exists())

        self.client.force_login(newcomer)
        self.assertEqual([e["name"] for e in self.client.get(reverse("api_events")).json()], ["Club Event"])

    def test_decline_and_cancel(self):
        club = Club.objects.get(pk=self.create_club().json()["id"])
        newcomer = Factory.user("newcomer")
        self.client.force_login(newcomer)
        post(self.client, "api_club_join", args=[club.pk])
        self.assertEqual(post(self.client, "api_club_leave", args=[club.pk]).status_code, 204)  # cancel own request
        self.assertFalse(Membership.objects.filter(user=newcomer).exists())
        post(self.client, "api_club_join", args=[club.pk])
        self.client.force_login(self.founder)
        post(self.client, "api_club_member_action", args=[Membership.objects.get(user=newcomer).pk, "decline"])
        self.assertFalse(Membership.objects.filter(user=newcomer).exists())

    def test_last_officer_cannot_leave(self):
        club_id = self.create_club().json()["id"]
        self.assertEqual(post(self.client, "api_club_leave", args=[club_id]).status_code, 400)

    def test_cannot_act_on_other_clubs_members(self):
        self.create_club()
        rival = Factory.club("Rival Club", officers=[Factory.user("rivaladmin")])
        pending = Membership.objects.create(club=rival, user=Factory.user("x"), status=Membership.PENDING)
        self.assertEqual(post(self.client, "api_club_member_action", args=[pending.pk, "approve"]).status_code, 404)

    def test_cannot_join_the_same_club_twice(self):
        club_id = self.create_club().json()["id"]
        self.assertEqual(post(self.client, "api_club_join", args=[club_id]).status_code, 400)

    def test_event_creation_needs_a_club(self):
        loner = Factory.user("loner")
        self.client.force_login(loner)
        response = post(self.client, "api_events", {"name": "X", "destination_url": "https://example.com"})
        self.assertEqual(response.status_code, 400)


class ClubSharingTests(TestCase):
    def test_officers_share_events_and_other_clubs_stay_private(self):
        a1, a2, b1 = Factory.user("a1"), Factory.user("a2"), Factory.user("b1")
        club_a = Factory.club("Club A", officers=[a1, a2])
        club_b = Factory.club("Club B", officers=[b1])
        event_a = Factory.event(club_a, name="A event")
        event_b = Factory.event(club_b, name="B event")
        self.client.force_login(a2)
        self.assertEqual([e["name"] for e in self.client.get(reverse("api_events")).json()], ["A event"])
        self.assertEqual(self.client.get(reverse("api_event_detail", args=[event_a.pk])).status_code, 200)
        self.assertEqual(self.client.get(reverse("api_event_detail", args=[event_b.pk])).status_code, 404)
        self.assertEqual(self.client.get(reverse("api_event_recap", args=[event_b.pk])).status_code, 404)


class RecommendationTests(TestCase):
    def setUp(self):
        self.keller = Factory.board("Keller Hall")
        self.quiet = Factory.board("Quiet Hall")
        self.dorm = Factory.board("Dorm")
        # Another computer-science club did well at Keller, badly at Quiet Hall.
        self.cs_other = Factory.club("Secret CS Club", officers=[Factory.user("other")], fields=["computer-science"])
        talk = Factory.event(self.cs_other, name="Secret Talk", event_type="speaker")
        keller_flyer = Factory.flyer(talk, self.keller, posted_at=timezone.now() - datetime.timedelta(days=4))
        for i in range(40):
            Factory.scan(keller_flyer, visitor=f"k{i}")
        quiet_flyer = Factory.flyer(talk, self.quiet, posted_at=timezone.now() - datetime.timedelta(days=4))
        Factory.scan(quiet_flyer, visitor="q")
        # A cultural club did well at the dorm.
        cultural = Factory.club("Cultural Club", officers=[Factory.user("cult")], club_type="cultural", fields=["all-majors"])
        dorm_flyer = Factory.flyer(Factory.event(cultural, event_type="cultural"), self.dorm, posted_at=timezone.now() - datetime.timedelta(days=4))
        for i in range(25):
            Factory.scan(dorm_flyer, visitor=f"d{i}")

    def test_similar_club_gets_its_boards_first(self):
        me = Factory.user("me")
        Factory.club("My CS Club", officers=[me], fields=["computer-science"])
        self.client.force_login(me)
        recs = self.client.get(reverse("api_board_recommendations"), {"event_type": "workshop"}).json()
        self.assertEqual(recs[0]["board_id"], self.keller.pk)
        self.assertEqual(recs[0]["tier"], "strong")
        self.assertEqual(recs[0]["reason"], "Strong with Computer science clubs")
        self.assertNotIn(self.quiet.pk, [r["board_id"] for r in recs])

    def test_recommendations_reveal_no_other_club_details(self):
        me = Factory.user("me")
        Factory.club("My CS Club", officers=[me], fields=["computer-science"])
        self.client.force_login(me)
        raw = self.client.get(reverse("api_board_recommendations"), {"event_type": "workshop"}).content.decode()
        for secret in ("Secret CS Club", "Secret Talk", "Cultural Club", "40", "25"):
            self.assertNotIn(secret, raw)
        self.assertEqual(set(json.loads(raw)[0]), {"board_id", "tier", "reason"})

    def test_rankings_are_cached_but_a_changed_profile_is_fresh(self):
        club = Factory.club("CS 2", officers=[Factory.user("cs2")], fields=["computer-science"])
        locmem = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache", "LOCATION": "recs-test"}}
        with self.settings(CACHES=locmem):
            from django.core.cache import cache

            cache.clear()
            first = recommend_boards(club, "workshop")
            with self.assertNumQueries(1):  # only the still-active check
                self.assertEqual(recommend_boards(club, "workshop"), first)
            club.fields = ["theatre-dance"]
            self.assertNotEqual(recommend_boards(club, "workshop"), first)
            cache.clear()

    def test_retired_boards_never_recommended(self):
        self.keller.is_active = False
        self.keller.save()
        club = Factory.club("CS 2", officers=[Factory.user("cs2")], fields=["computer-science"])
        self.assertNotIn(self.keller.pk, [r["board_id"] for r in recommend_boards(club, "workshop")])

    def test_no_history_means_no_recommendations(self):
        club = Factory.club("CS 2", officers=[Factory.user("cs2")], fields=["computer-science"])
        Event.objects.exclude(club=club).delete()
        self.assertEqual(recommend_boards(club, "workshop"), [])

    def test_nothing_until_the_kind_of_event_is_known(self):
        me = Factory.user("me")
        Factory.club("My CS Club", officers=[me], fields=["computer-science"])
        self.client.force_login(me)
        self.assertEqual(self.client.get(reverse("api_board_recommendations")).json(), [])
        self.assertNotEqual(self.client.get(reverse("api_board_recommendations"), {"event_type": "workshop"}).json(), [])

    def test_nothing_until_the_club_says_what_it_is(self):
        blank = Factory.club("Placeholder", officers=[Factory.user("p")], club_type="other", fields=())
        self.assertEqual(recommend_boards(blank, "workshop"), [])
        self.assertEqual(recommend_boards(None, "workshop"), [])

    def test_unrelated_clubs_success_does_not_count(self):
        # The dorm was busy, but only for a cultural club; a CS club shouldn't hear about it,
        # even for the same kind of event.
        club = Factory.club("CS 2", officers=[Factory.user("cs2")], fields=["computer-science"])
        self.assertNotIn(self.dorm.pk, [r["board_id"] for r in recommend_boards(club, "cultural")])
        cultural_too = Factory.club("Dance", officers=[Factory.user("dance")], club_type="cultural", fields=["theatre-dance"])
        self.assertIn(self.dorm.pk, [r["board_id"] for r in recommend_boards(cultural_too, "cultural")])

    def test_being_academic_is_not_enough_to_be_alike(self):
        finance = Factory.club("Finance", officers=[Factory.user("fin")], club_type="academic", fields=["finance"])
        self.assertEqual(recommend_boards(finance, "speaker"), [])  # the CS club's Keller success isn't theirs


class NotificationTests(TestCase):
    def setUp(self):
        self.officer = Factory.user("officer")
        self.club = Factory.club("Club", officers=[self.officer])
        self.event = Factory.event(self.club, name="Talk", end_date=timezone.localdate() + datetime.timedelta(days=10))
        self.flyer = Factory.flyer(self.event)
        self.client.force_login(self.officer)

    def scan(self, ua=IPHONE_UA):
        self.client.get(reverse("scan_redirect", args=[self.flyer.slug]), HTTP_USER_AGENT=ua)

    def test_first_scan_notifies_once_per_event(self):
        self.scan(ua="curl/8.0")  # bots don't count
        self.assertFalse(Notification.objects.filter(kind=Notification.FIRST_SCAN).exists())
        self.scan()
        self.scan()
        second_flyer = Factory.flyer(self.event)
        self.client.get(reverse("scan_redirect", args=[second_flyer.slug]), HTTP_USER_AGENT=IPHONE_UA)
        self.assertEqual(Notification.objects.filter(kind=Notification.FIRST_SCAN).count(), 1)
        data = self.client.get(reverse("api_notifications")).json()
        self.assertEqual(data["unread"], 1)
        self.assertEqual(data["items"][0]["link"], f"/events/{self.event.pk}")

    def test_move_it_nudge_and_recap(self):
        self.flyer.posted_at = timezone.now() - datetime.timedelta(days=6)
        self.flyer.save()
        kinds = [n["kind"] for n in self.client.get(reverse("api_notifications")).json()["items"]]
        self.assertEqual(kinds, ["move_it"])
        detail = self.client.get(reverse("api_flyer_detail", args=[self.flyer.slug])).json()
        self.assertTrue(detail["move_it"])

        self.event.end_date = timezone.localdate() - datetime.timedelta(days=1)
        self.event.save()
        kinds = {n["kind"] for n in self.client.get(reverse("api_notifications")).json()["items"]}
        self.assertEqual(kinds, {"move_it", "recap"})
        # Refreshing again creates nothing new.
        notifications.refresh(self.club)
        self.assertEqual(Notification.objects.count(), 2)

    def test_mark_read_per_officer(self):
        notifications.notify_first_scan(self.event)
        post(self.client, "api_notifications_read")
        self.assertEqual(self.client.get(reverse("api_notifications")).json()["unread"], 0)
        colleague = Factory.user("colleague")
        Membership.objects.create(club=self.club, user=colleague, status=Membership.ACTIVE)
        self.client.force_login(colleague)
        self.assertEqual(self.client.get(reverse("api_notifications")).json()["unread"], 1)


class RecapTests(TestCase):
    def test_recap_ranks_boards_and_suggests_unused_ones(self):
        officer = Factory.user("officer")
        club = Factory.club("Club", officers=[officer])
        start = timezone.localdate() - datetime.timedelta(days=3)
        event = Factory.event(club, start_date=start, end_date=start, event_type="workshop")
        busy, empty, unused = Factory.board("Busy"), Factory.board("Empty"), Factory.board("Unused")
        busy_flyer = Factory.flyer(event, busy, posted_at=timezone.now() - datetime.timedelta(days=8))
        Factory.flyer(event, empty, posted_at=timezone.now() - datetime.timedelta(days=8))
        Factory.scan(busy_flyer, local_dt(6), visitor="a")
        Factory.scan(busy_flyer, local_dt(5), visitor="b")
        # Another club's success at the unused board makes it a suggestion for next time.
        other = Factory.event(Factory.club("Other", officers=[Factory.user("o")]), event_type="workshop")
        other_flyer = Factory.flyer(other, unused, posted_at=timezone.now() - datetime.timedelta(days=2))
        for i in range(30):
            Factory.scan(other_flyer, visitor=f"u{i}")

        self.client.force_login(officer)
        recap = self.client.get(reverse("api_event_recap", args=[event.pk])).json()
        self.assertTrue(recap["has_ended"])
        self.assertEqual(recap["total"], 2)
        self.assertEqual(recap["before_start"], 2)
        self.assertEqual(recap["best"]["board"], "Busy")
        self.assertEqual([b["board"] for b in recap["no_scans"]], ["Empty"])
        self.assertEqual([s["board"] for s in recap["next_time"]], ["Unused"])


class ManyClubsTests(TestCase):
    """One account, several clubs: each screen is about one club, and the clubs never mix."""

    def setUp(self):
        self.officer = Factory.user("officer")
        self.coders = Factory.club("Gopher Coders", officers=[self.officer])
        self.wic = Factory.club("Women in Computing", officers=[self.officer, Factory.user("wic")])
        self.git = Factory.event(self.coders, name="Intro to Git")
        self.talk = Factory.event(self.wic, name="Tech Talk")
        self.client.force_login(self.officer)

    def open(self, club):
        return post(self.client, "api_club_open", args=[club.pk])

    def event_names(self):
        return [e["name"] for e in self.client.get(reverse("api_events")).json()]

    def test_session_lists_every_club_and_the_current_one(self):
        self.open(self.wic)
        user = self.client.get(reverse("api_session")).json()["user"]
        self.assertEqual(user["club"]["name"], "Women in Computing")
        self.assertEqual([c["name"] for c in user["clubs"]], ["Gopher Coders", "Women in Computing"])

    def test_switching_clubs_switches_every_screen(self):
        self.open(self.coders)
        self.assertEqual(self.event_names(), ["Intro to Git"])
        self.assertEqual(self.client.get(reverse("api_event_detail", args=[self.talk.pk])).status_code, 404)
        self.assertEqual(self.client.get(reverse("api_my_club")).json()["name"], "Gopher Coders")

        self.open(self.wic)
        self.assertEqual(self.event_names(), ["Tech Talk"])
        self.assertEqual(self.client.get(reverse("api_event_detail", args=[self.git.pk])).status_code, 404)
        self.assertEqual(self.client.get(reverse("api_my_club")).json()["name"], "Women in Computing")

    def test_new_events_belong_to_the_current_club_only(self):
        self.open(self.wic)
        data = {"name": "Mentor Mixer", "destination_url": "https://example.com/mixer", "event_type": "social"}
        self.assertEqual(post(self.client, "api_events", data).status_code, 201)
        self.assertEqual(Event.objects.get(name="Mentor Mixer").club, self.wic)

    def test_cannot_open_a_club_still_pending_or_not_joined(self):
        hsa = Factory.club("Hmong Student Association", officers=[Factory.user("hsa")])
        self.assertEqual(self.open(hsa).status_code, 404)
        self.assertEqual(post(self.client, "api_club_join", args=[hsa.pk]).status_code, 201)
        self.assertEqual(self.open(hsa).status_code, 404)

    def test_new_club_opens_straight_away(self):
        data = {"name": "Chess Club", "club_type": "hobby", "fields": ["all-majors"]}
        self.assertEqual(post(self.client, "api_clubs", data).status_code, 201)
        self.assertEqual(self.client.get(reverse("api_session")).json()["user"]["club"]["name"], "Chess Club")
        self.assertEqual(self.officer.memberships.count(), 3)

    def test_leaving_one_club_keeps_the_others(self):
        self.open(self.wic)
        self.assertEqual(post(self.client, "api_club_leave", args=[self.wic.pk]).status_code, 204)
        self.assertEqual(self.client.get(reverse("api_session")).json()["user"]["club"]["name"], "Gopher Coders")
        self.assertEqual(self.event_names(), ["Intro to Git"])
        self.assertTrue(self.wic.memberships.exists())  # the club carries on with its other officer

    def test_notifications_come_from_every_club_labeled(self):
        notifications.notify_first_scan(self.git)
        notifications.notify_first_scan(self.talk)
        Factory.club("Rival", officers=[Factory.user("rival")])
        items = self.client.get(reverse("api_notifications")).json()["items"]
        self.assertEqual(sorted(n["club"]["name"] for n in items), ["Gopher Coders", "Women in Computing"])
        post(self.client, "api_notifications_read")
        self.assertEqual(self.client.get(reverse("api_notifications")).json()["unread"], 0)

    def test_dismissed_notices_disappear_for_that_officer_only(self):
        notifications.notify_first_scan(self.git)
        colleague = Factory.user("colleague")
        Membership.objects.create(club=self.coders, user=colleague, status=Membership.ACTIVE)
        notice = Notification.objects.get(club=self.coders)
        self.assertEqual(post(self.client, "api_notifications_dismiss", {"ids": [notice.pk]}).status_code, 204)
        listing = self.client.get(reverse("api_notifications")).json()
        self.assertEqual((listing["items"], listing["unread"]), ([], 0))
        # Still due, but not recreated or shown again after the list refreshes.
        notifications.notify_first_scan(self.git)
        self.assertEqual(self.client.get(reverse("api_notifications")).json()["items"], [])
        self.client.force_login(colleague)
        self.assertEqual([n["id"] for n in self.client.get(reverse("api_notifications")).json()["items"]], [notice.pk])

    def test_cannot_dismiss_other_clubs_notices(self):
        rival = Factory.club("Rival", officers=[Factory.user("rival")])
        notice = notifications.notify_first_scan(Factory.event(rival)) or Notification.objects.get(club=rival)
        post(self.client, "api_notifications_dismiss", {"ids": [notice.pk]})
        self.assertFalse(notice.dismissed_by.exists())

    def test_club_search_shows_where_you_already_are(self):
        results = {c["name"]: c["your_status"] for c in self.client.get(reverse("api_clubs")).json()}
        self.assertEqual(results["Gopher Coders"], "active")
