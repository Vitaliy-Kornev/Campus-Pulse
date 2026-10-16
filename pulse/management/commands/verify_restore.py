"""Check that a restored database is complete and usable. Run against the restored copy:

    DATABASE_URL=postgres://.../restored python manage.py verify_restore --expect flyers=120,scans=4300

Fails (exit code 1) if migrations are missing, the counts fall short of --expect, or any flyer
lost its event, board, or link: each printed QR code depends on its flyer row surviving.
"""

from django.core.management.base import BaseCommand, CommandError
from django.db import connection
from django.db.migrations.executor import MigrationExecutor

from pulse.models import Board, Club, Event, Flyer, Membership, Scan


class Command(BaseCommand):
    help = "Verify a restored database: migrations, row counts, and every flyer's QR code target."

    def add_arguments(self, parser):
        parser.add_argument("--expect", default="", help='Minimum counts, e.g. "flyers=120,scans=4300".')

    def handle(self, *args, **options):
        problems = []
        executor = MigrationExecutor(connection)
        pending = executor.migration_plan(executor.loader.graph.leaf_nodes())
        if pending:
            problems.append(f"{len(pending)} migrations not applied (is the backup from newer code?)")

        counts = {
            "boards": Board.objects.count(),
            "clubs": Club.objects.count(),
            "officers": Membership.objects.count(),
            "events": Event.objects.count(),
            "flyers": Flyer.objects.count(),
            "scans": Scan.objects.count(),
        }
        for name, value in counts.items():
            self.stdout.write(f"{name:>9}: {value}")

        for item in filter(None, (part.strip() for part in options["expect"].split(","))):
            name, _, minimum = item.partition("=")
            if name not in counts or not minimum.isdigit():
                raise CommandError(f"Can't read --expect item {item!r}.")
            if counts[name] < int(minimum):
                problems.append(f"only {counts[name]} {name}, expected at least {minimum}")

        broken = [
            f.slug
            for f in Flyer.objects.select_related("event", "board").only("slug", "destination_override", "event__destination_url", "board__id")
            if not f.destination.startswith(("http://", "https://"))
        ]
        if broken:
            problems.append(f"{len(broken)} flyers have no working link, e.g. {', '.join(broken[:5])}")

        if problems:
            raise CommandError("Restore check FAILED:\n  - " + "\n  - ".join(problems))
        self.stdout.write(self.style.SUCCESS(f"Restore check passed: every one of {counts['flyers']} QR codes still has a working link."))
