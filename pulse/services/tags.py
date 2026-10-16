"""Board tags: the short sign label each board wears in the app and on printed QR labels.

A tag starts from the building ("Coffman Memorial Union" → CMU, "Pioneer Hall" → PIO). Two
different buildings that would share a tag get longer ones (Willey → WILL, Wilkins → WILK), and
boards in the same building are numbered in name order (Jones Hall East 1/2 → JON1, JON2), so
every board's tag is unique. These are abbreviations, not official UMN building codes.
"""

import re
from collections import defaultdict

from pulse.models import Board

GENERIC = {"hall", "residence", "center", "building", "apartments", "of", "the", "and", "&"}


def _words(building):
    return [w for w in re.split(r"[\s\-–/,]+", building or "") if w and w.lower() not in GENERIC]


def _part(word, length):
    if word[:1].isdigit():
        return re.sub(r"(st|nd|rd|th)$", "", word, flags=re.IGNORECASE).upper()
    return word[:length].upper()


def building_code(building, length=3):
    """Initials when the name has several distinctive words, else the start of the one that matters."""
    words = _words(building)
    if not words:
        return "—"
    if len(words) == 1:
        return _part(words[0], length)
    if length > 3 and len(words) == 2:
        return _part(words[0], 1) + _part(words[1], length - 1)
    return "".join(_part(w, 1) for w in words[:3])


def _building_codes(buildings):
    """A distinct code per building: lengthen colliding codes until they differ."""
    codes = {}
    for length in (3, 4, 5):
        pending = [b for b in buildings if b not in codes]
        by_code = defaultdict(list)
        for building in pending:
            by_code[building_code(building, length)].append(building)
        for code, group in by_code.items():
            if len(group) == 1 and code not in codes.values():
                codes[group[0]] = code
    for building in buildings:  # last resort: still colliding after five letters
        codes.setdefault(building, building_code(building, 5))
    return codes


def tag_map():
    """{board_id: tag} for every board, retired ones included so tags never shift. One query."""
    rows = list(Board.objects.order_by("name").values_list("id", "building", "name"))
    codes = _building_codes(sorted({building or name for _, building, name in rows}))
    by_building = defaultdict(list)
    for board_id, building, name in rows:
        by_building[building or name].append(board_id)
    tags = {}
    for building, ids in by_building.items():
        for index, board_id in enumerate(ids, start=1):
            tags[board_id] = codes[building] + (str(index) if len(ids) > 1 else "")
    return tags
