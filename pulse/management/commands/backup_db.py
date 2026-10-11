"""Copy the database to a timestamped file, and delete copies older than --keep days.

    python manage.py backup_db --dir /srv/campus-pulse-backups --keep 14

PostgreSQL is dumped with pg_dump (custom format, for pg_restore); SQLite is copied with SQLite's
own online backup, which is safe while the app is running. Prints the new file's path.
"""

import datetime
import os
import sqlite3
import subprocess
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.db import connection

from pulse.models import Club, Event, Flyer


class Command(BaseCommand):
    help = "Back up the database to a timestamped file and prune old backups."

    def add_arguments(self, parser):
        parser.add_argument("--dir", default="backups", help="Folder for backups (created if missing).")
        parser.add_argument("--keep", type=int, default=14, help="Delete backups older than this many days (0 keeps all).")

    def handle(self, *args, **options):
        folder = Path(options["dir"]).expanduser()
        folder.mkdir(parents=True, exist_ok=True)
        stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
        settings = connection.settings_dict

        if connection.vendor == "postgresql":
            target = folder / f"campuspulse-{stamp}.dump"
            env = {**os.environ, "PGPASSWORD": settings.get("PASSWORD") or ""}
            command = ["pg_dump", "--format=custom", "--no-owner", "--file", str(target), "--dbname", settings["NAME"]]
            for flag, key in (("--host", "HOST"), ("--port", "PORT"), ("--username", "USER")):
                if settings.get(key):
                    command += [flag, str(settings[key])]
            result = subprocess.run(command, env=env, capture_output=True, text=True)
            if result.returncode != 0:
                target.unlink(missing_ok=True)
                raise CommandError(f"pg_dump failed: {result.stderr.strip()}")
        elif connection.vendor == "sqlite":
            target = folder / f"campuspulse-{stamp}.sqlite3"
            with sqlite3.connect(settings["NAME"]) as source, sqlite3.connect(target) as copy:
                source.backup(copy)
        else:
            raise CommandError(f"Backups aren't supported for {connection.vendor}.")

        if target.stat().st_size == 0:
            raise CommandError(f"The backup at {target} is empty.")
        # What the backup should contain, for the restore drill to check against.
        counts = {"clubs": Club.objects.count(), "events": Event.objects.count(), "flyers": Flyer.objects.count()}
        Path(f"{target}.counts").write_text(",".join(f"{k}={v}" for k, v in counts.items()) + "\n")
        self._prune(folder, options["keep"], keep=target)
        self.stdout.write(str(target))

    def _prune(self, folder, days, keep):
        if days <= 0:
            return
        cutoff = datetime.datetime.now().timestamp() - days * 86400
        for old in list(folder.glob("campuspulse-*.dump")) + list(folder.glob("campuspulse-*.sqlite3")):
            if old != keep and old.stat().st_mtime < cutoff:
                old.unlink()
                Path(f"{old}.counts").unlink(missing_ok=True)
