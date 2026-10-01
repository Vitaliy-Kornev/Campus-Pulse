from django.utils import timezone
from rest_framework import serializers

from pulse.models import Board, Campaign, Flyer, http_url_validator
from pulse.services import analytics
from pulse.services.boards import get_default_campus


class BoardSerializer(serializers.ModelSerializer):
    latitude = serializers.DecimalField(max_digits=9, decimal_places=6, min_value=-90, max_value=90, coerce_to_string=False)
    longitude = serializers.DecimalField(max_digits=9, decimal_places=6, min_value=-180, max_value=180, coerce_to_string=False)

    class Meta:
        model = Board
        fields = ("id", "name", "area", "building", "floor", "description", "latitude", "longitude", "is_active")

    def validate_name(self, value):
        others = Board.objects.filter(campus=get_default_campus(), name=value)
        if self.instance is not None:
            others = others.exclude(pk=self.instance.pk)
        if others.exists():
            raise serializers.ValidationError("A board with this name already exists.")
        return value


class CampaignSerializer(serializers.ModelSerializer):
    owner = serializers.CharField(source="owner.username", read_only=True)
    # DRF's URLField also accepts ftp://; destinations must be http(s), like the model field.
    destination_url = serializers.URLField(max_length=200, validators=[http_url_validator])

    class Meta:
        model = Campaign
        fields = ("id", "name", "destination_url", "start_date", "end_date", "owner", "created_at")
        read_only_fields = ("created_at",)

    def validate(self, attrs):
        start = attrs.get("start_date", getattr(self.instance, "start_date", None))
        end = attrs.get("end_date", getattr(self.instance, "end_date", None))
        if start and end and end < start:
            raise serializers.ValidationError({"end_date": "End date must be on or after the start date."})
        return attrs


class CampaignListSerializer(CampaignSerializer):
    """Campaign rows with the counts annotated by analytics.campaigns_with_stats."""

    flyer_count = serializers.IntegerField(read_only=True)
    active_flyer_count = serializers.IntegerField(read_only=True)
    total_scans = serializers.IntegerField(read_only=True)

    class Meta(CampaignSerializer.Meta):
        fields = CampaignSerializer.Meta.fields + ("flyer_count", "active_flyer_count", "total_scans")


def active_boards():
    return Board.objects.filter(is_active=True)


class FlyerCreateSerializer(serializers.ModelSerializer):
    """Admins post for any campaign; advertisers for their own campaigns only."""

    board = serializers.PrimaryKeyRelatedField(queryset=active_boards())
    campaign = serializers.PrimaryKeyRelatedField(queryset=Campaign.objects.none())
    destination_override = serializers.URLField(max_length=200, required=False, allow_blank=True, validators=[http_url_validator])
    posted_at = serializers.DateTimeField(default=timezone.now)

    class Meta:
        model = Flyer
        fields = ("board", "campaign", "label", "destination_override", "posted_at")

    def __init__(self, *args, user, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["campaign"].queryset = analytics.visible_campaigns(user)


class RepostSerializer(serializers.Serializer):
    board = serializers.PrimaryKeyRelatedField(queryset=active_boards())
    mark_original_removed = serializers.BooleanField(default=False)

    def __init__(self, *args, original, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["board"].queryset = active_boards().exclude(pk=original.board_id)


class FlyerRowSerializer(serializers.ModelSerializer):
    """A flyer table row. Expects the annotations from analytics.flyer_table."""

    board = serializers.CharField(source="board.name")
    total_scans = serializers.IntegerField()
    unique_scans = serializers.IntegerField()
    after_removal_scans = serializers.IntegerField()

    class Meta:
        model = Flyer
        fields = (
            "slug", "board", "label", "posted_at", "removed_at", "is_active", "days_posted",
            "total_scans", "unique_scans", "scans_per_day", "after_removal_scans",
        )
