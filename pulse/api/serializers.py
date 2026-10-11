from django.utils import timezone
from rest_framework import serializers

from pulse.models import Board, Event, Flyer, http_url_validator
from pulse.services import analytics
from pulse.services.boards import get_default_campus
from pulse.services.tags import tag_map


def tags_from(serializer):
    """The board tag map, built once per response and shared by every row (one query)."""
    context = serializer.context
    if "tags" not in context:
        context["tags"] = tag_map()
    return context["tags"]


class BoardSerializer(serializers.ModelSerializer):
    tag = serializers.SerializerMethodField()
    latitude = serializers.DecimalField(max_digits=9, decimal_places=6, min_value=-90, max_value=90, coerce_to_string=False)
    longitude = serializers.DecimalField(max_digits=9, decimal_places=6, min_value=-180, max_value=180, coerce_to_string=False)

    class Meta:
        model = Board
        fields = ("id", "tag", "name", "area", "building", "floor", "description", "latitude", "longitude", "is_active")

    def get_tag(self, board):
        return tags_from(self).get(board.id, "")

    def validate_name(self, value):
        others = Board.objects.filter(campus=get_default_campus(), name=value)
        if self.instance is not None:
            others = others.exclude(pk=self.instance.pk)
        if others.exists():
            raise serializers.ValidationError("A board with this name already exists.")
        return value


class EventSerializer(serializers.ModelSerializer):
    club = serializers.CharField(source="club.name", read_only=True)
    has_ended = serializers.BooleanField(read_only=True)
    # DRF's URLField also accepts ftp://; destinations must be http(s), like the model field.
    destination_url = serializers.URLField(max_length=200, validators=[http_url_validator])

    class Meta:
        model = Event
        fields = ("id", "name", "event_type", "destination_url", "start_date", "end_date", "club", "has_ended", "created_at")
        read_only_fields = ("created_at",)

    def validate(self, attrs):
        start = attrs.get("start_date", getattr(self.instance, "start_date", None))
        end = attrs.get("end_date", getattr(self.instance, "end_date", None))
        if start and end and end < start:
            raise serializers.ValidationError({"end_date": "End date must be on or after the start date."})
        return attrs


class EventListSerializer(EventSerializer):
    """Event rows with the counts annotated by analytics.events_with_stats."""

    flyer_count = serializers.IntegerField(read_only=True)
    active_flyer_count = serializers.IntegerField(read_only=True)
    total_scans = serializers.IntegerField(read_only=True)

    class Meta(EventSerializer.Meta):
        fields = EventSerializer.Meta.fields + ("flyer_count", "active_flyer_count", "total_scans")


def active_boards():
    return Board.objects.filter(is_active=True)


class FlyerCreateSerializer(serializers.ModelSerializer):
    """Admins post for any event; officers for their own club's events only."""

    board = serializers.PrimaryKeyRelatedField(queryset=active_boards())
    event = serializers.PrimaryKeyRelatedField(queryset=Event.objects.none())
    destination_override = serializers.URLField(max_length=200, required=False, allow_blank=True, validators=[http_url_validator])
    posted_at = serializers.DateTimeField(default=timezone.now)

    class Meta:
        model = Flyer
        fields = ("board", "event", "label", "destination_override", "posted_at")

    def __init__(self, *args, user, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["event"].queryset = analytics.visible_events(user)


class RepostSerializer(serializers.Serializer):
    board = serializers.PrimaryKeyRelatedField(queryset=active_boards())
    mark_original_removed = serializers.BooleanField(default=False)

    def __init__(self, *args, original, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["board"].queryset = active_boards().exclude(pk=original.board_id)


class FlyerRowSerializer(serializers.ModelSerializer):
    """A flyer table row. Expects the annotations from analytics.flyer_table."""

    board = serializers.CharField(source="board.name")
    board_id = serializers.IntegerField(source="board.id")
    board_building = serializers.CharField(source="board.building")
    board_tag = serializers.SerializerMethodField()
    total_scans = serializers.IntegerField()
    unique_scans = serializers.IntegerField()
    after_removal_scans = serializers.IntegerField()

    class Meta:
        model = Flyer
        fields = (
            "slug", "board", "board_id", "board_building", "board_tag", "label", "posted_at", "removed_at", "is_active", "days_posted",
            "total_scans", "unique_scans", "scans_per_day", "after_removal_scans",
        )

    def get_board_tag(self, flyer):
        return tags_from(self).get(flyer.board_id, "")
