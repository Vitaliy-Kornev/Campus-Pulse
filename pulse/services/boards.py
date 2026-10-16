"""Board import and campus helpers."""

import csv
from decimal import Decimal, InvalidOperation

from django.conf import settings
from django.db import transaction

from pulse.models import Board, Campus

BOARD_CSV_COLUMNS = ("area", "name", "building", "floor", "description", "latitude", "longitude")


class BoardImportError(ValueError):
    pass


def get_default_campus():
    campus = Campus.objects.order_by("pk").first()
    if campus is None:
        lat, lng = settings.CAMPUS_CENTER
        campus = Campus.objects.create(
            name=settings.CAMPUS_NAME,
            center_latitude=Decimal(str(lat)),
            center_longitude=Decimal(str(lng)),
            default_zoom=settings.CAMPUS_DEFAULT_ZOOM,
        )
    return campus


def _decimal(value, column, line):
    try:
        return Decimal(str(value).strip()).quantize(Decimal("0.000001"))
    except (InvalidOperation, AttributeError):
        raise BoardImportError(f"Line {line}: invalid {column} {value!r}")


@transaction.atomic
def import_boards(rows_file, campus=None):
    """Create or update boards (matched by name) from a CSV file object. Returns (created, updated)."""
    campus = campus or get_default_campus()
    reader = csv.DictReader(rows_file)
    missing = [c for c in BOARD_CSV_COLUMNS if c not in (reader.fieldnames or [])]
    if missing:
        raise BoardImportError(f"CSV is missing columns: {', '.join(missing)}")

    existing = {b.name: b for b in Board.objects.filter(campus=campus)}
    created = updated = 0
    for line, row in enumerate(reader, start=2):
        name = (row.get("name") or "").strip()
        if not name:
            raise BoardImportError(f"Line {line}: name is required")
        values = {
            "area": (row.get("area") or "").strip(),
            "building": (row.get("building") or "").strip(),
            "floor": (row.get("floor") or "").strip(),
            "description": (row.get("description") or "").strip(),
            "latitude": _decimal(row.get("latitude"), "latitude", line),
            "longitude": _decimal(row.get("longitude"), "longitude", line),
        }
        board = existing.get(name)
        if board is None:
            board = Board.objects.create(campus=campus, name=name, **values)
            existing[name] = board
            created += 1
        else:
            for field, value in values.items():
                setattr(board, field, value)
            board.save()
            updated += 1
    return created, updated
