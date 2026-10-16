import tempfile
from io import StringIO
from pathlib import Path

from django.conf import settings
from django.core.management import CommandError, call_command
from django.test import TestCase

from pulse.models import Board, Club, Event, Flyer, Scan

HEADER = "area,name,building,floor,description,latitude,longitude\n"


class ImportBoardsTests(TestCase):
    def _import(self, content):
        with tempfile.NamedTemporaryFile("w", suffix=".csv", delete=False) as handle:
            handle.write(content)
        out = StringIO()
        try:
            call_command("import_boards", handle.name, stdout=out)
        finally:
            Path(handle.name).unlink()
        return out.getvalue()

    def test_creates_then_updates_by_name(self):
        output = self._import(HEADER + "East Bank,Coffman,Coffman Union,1,Lobby,44.9730,-93.2353\nWest Bank,Blegen,Blegen Hall,,,44.9715,-93.2437\n")
        self.assertIn("2 created, 0 updated", output)
        self.assertEqual(Board.objects.count(), 2)

        output = self._import(HEADER + "East Bank,Coffman,Coffman Memorial Union,2,Moved upstairs,44.973111,-93.235222\nSt. Paul,New One,Center,,,44.98,-93.18\n")
        self.assertIn("1 created, 1 updated", output)
        self.assertEqual(Board.objects.count(), 3)
        coffman = Board.objects.get(name="Coffman")
        self.assertEqual(coffman.building, "Coffman Memorial Union")
        self.assertEqual(coffman.floor, "2")
        self.assertEqual(str(coffman.latitude), "44.973111")

    def test_missing_columns_fail(self):
        with self.assertRaises(CommandError):
            self._import("name,latitude\nX,1\n")

    def test_bad_coordinates_fail_without_partial_import(self):
        with self.assertRaises(CommandError):
            self._import(HEADER + "A,Good,B,,,44.9,-93.2\nA,Bad,B,,,not-a-number,-93.2\n")
        self.assertEqual(Board.objects.count(), 0)

    def test_umn_csv_has_41_boards(self):
        self._import((settings.BASE_DIR / "boards_umn.csv").read_text())
        self.assertEqual(Board.objects.count(), 41)
        self.assertEqual(set(Board.objects.values_list("area", flat=True)), {"East Bank", "West Bank", "St. Paul"})
        self.assertEqual(Board.objects.get(name="Frontier Hall").approx_board_count, 21)


class SeedDemoTests(TestCase):
    def test_seed_demo_runs_and_is_repeatable(self):
        call_command("seed_demo", seed=1, stdout=StringIO())
        call_command("seed_demo", seed=1, stdout=StringIO())
        self.assertEqual(Board.objects.count(), 41)
        self.assertEqual(Event.objects.count(), 7)
        self.assertEqual(Club.objects.count(), 5)
        self.assertGreaterEqual(Flyer.objects.count(), 25)
        total = Scan.objects.count()
        self.assertTrue(1000 <= total <= 1700, total)
        bot_share = Scan.objects.filter(is_bot=True).count() / total
        self.assertTrue(0.02 < bot_share < 0.09, bot_share)
