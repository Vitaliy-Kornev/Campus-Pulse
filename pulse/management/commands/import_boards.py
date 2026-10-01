from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from pulse.services.boards import BoardImportError, import_boards


class Command(BaseCommand):
    help = (
        "Create or update poster boards from a CSV with columns "
        "area,name,building,floor,description,latitude,longitude. Existing boards are matched by name."
    )

    def add_arguments(self, parser):
        parser.add_argument("csv_path", help="Path to the boards CSV file")

    def handle(self, *args, **options):
        path = Path(options["csv_path"])
        if not path.exists():
            raise CommandError(f"File not found: {path}")
        try:
            with path.open(newline="", encoding="utf-8-sig") as handle:
                created, updated = import_boards(handle)
        except BoardImportError as exc:
            raise CommandError(str(exc))
        self.stdout.write(self.style.SUCCESS(f"Imported boards from {path}: {created} created, {updated} updated."))
        self.stdout.write("Coordinates may be approximate: check each board on the Manage boards map and drag to fix.")
