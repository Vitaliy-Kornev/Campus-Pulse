import csv

from django.http import StreamingHttpResponse
from django.utils import timezone
from django.utils.text import slugify
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from pulse.api.serializers import CampaignListSerializer, CampaignSerializer, FlyerRowSerializer
from pulse.models import Scan
from pulse.services import analytics


@api_view(["GET", "POST"])
def campaign_list(request):
    if request.method == "POST":
        serializer = CampaignSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        campaign = serializer.save(owner=request.user)
        return Response(CampaignSerializer(campaign).data, status=status.HTTP_201_CREATED)
    campaigns = analytics.campaigns_with_stats(request.user)
    return Response(CampaignListSerializer(campaigns, many=True).data)


@api_view(["GET", "PATCH"])
def campaign_detail(request, pk):
    campaign = analytics.get_campaign_for(request.user, pk)
    if request.method == "PATCH":
        serializer = CampaignSerializer(campaign, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        campaign = serializer.save()
    return Response(CampaignSerializer(campaign).data)


@api_view(["GET"])
def campaign_summary(request, pk):
    campaign = analytics.get_campaign_for(request.user, pk)
    rng = analytics.resolve_range(request.GET, default="30d")
    return Response(analytics.campaign_summary(campaign, rng))


@api_view(["GET"])
def campaign_flyers(request, pk):
    """Lifetime totals per flyer, newest first. Bots excluded."""
    campaign = analytics.get_campaign_for(request.user, pk)
    flyers = analytics.flyer_table(campaign.flyers.all()).order_by("-posted_at")
    return Response(FlyerRowSerializer(flyers, many=True).data)


@api_view(["GET"])
def campaign_timeseries(request, pk):
    campaign = analytics.get_campaign_for(request.user, pk)
    rng = analytics.resolve_range(request.GET, default="30d")
    return Response(analytics.timeseries(analytics.campaign_scans(campaign, rng), rng))


@api_view(["GET"])
def campaign_by_board(request, pk):
    campaign = analytics.get_campaign_for(request.user, pk)
    rng = analytics.resolve_range(request.GET, default="30d")
    return Response(analytics.by_board(analytics.campaign_scans(campaign, rng)))


class _Echo:
    def write(self, value):
        return value


@api_view(["GET"])
def export_csv(request, pk):
    """Every non-bot scan for the campaign. No visitor hashes."""
    campaign = analytics.get_campaign_for(request.user, pk)
    scans = (
        Scan.objects.filter(flyer__campaign=campaign, is_bot=False)
        .select_related("flyer", "flyer__board")
        .order_by("scanned_at")
    )
    writer = csv.writer(_Echo())

    def rows():
        yield writer.writerow(["flyer_slug", "board_name", "scanned_at", "device_type", "after_removal"])
        for scan in scans.iterator(chunk_size=2000):
            removed_at = scan.flyer.removed_at
            yield writer.writerow([
                scan.flyer.slug,
                scan.flyer.board.name,
                timezone.localtime(scan.scanned_at).isoformat(),
                scan.device_type,
                "yes" if removed_at and scan.scanned_at > removed_at else "no",
            ])

    filename = f"campus-pulse-{slugify(campaign.name) or campaign.pk}-scans.csv"
    response = StreamingHttpResponse(rows(), content_type="text/csv")
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    return response
