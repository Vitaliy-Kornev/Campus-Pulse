from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from pulse.api.authentication import IsStaff
from pulse.api.serializers import BoardSerializer
from pulse.models import Board
from pulse.services import analytics
from pulse.services.boards import get_default_campus


@api_view(["GET", "POST"])
def board_list(request):
    """GET: boards for pickers and maps (retired ones for admins only). POST: add a board.

    Any logged-in user can add a board and it goes live immediately. Only admins edit, move, or retire.
    """
    if request.method == "POST":
        serializer = BoardSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        extra = {} if request.user.is_staff else {"is_active": True}  # advertisers can't add retired boards
        board = serializer.save(campus=get_default_campus(), created_by=request.user, **extra)
        return Response(BoardSerializer(board).data, status=status.HTTP_201_CREATED)

    boards = Board.objects.all() if request.user.is_staff else Board.objects.filter(is_active=True)
    return Response(BoardSerializer(boards.order_by("area", "name"), many=True).data)


@api_view(["GET", "PATCH"])
@permission_classes([IsStaff])
def board_detail(request, pk):
    """Edit, drag-to-move, or retire/reactivate (is_active). Boards are never deleted from the UI."""
    board = get_object_or_404(Board, pk=pk)
    if request.method == "PATCH":
        serializer = BoardSerializer(board, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        board = serializer.save()
    return Response(BoardSerializer(board).data)


@api_view(["GET"])
def leaderboard(request):
    """Advertisers see their own campaigns' numbers; admins see everyone's."""
    return Response([
        {
            "id": b.id,
            "name": b.name,
            "area": b.area,
            "building": b.building,
            "floor": b.floor,
            "is_active": b.is_active,
            "lifetime_scans": b.lifetime_scans,
            "flyer_count": b.flyer_count,
            "avg_scans_per_flyer_day": b.avg_scans_per_flyer_day,
        }
        for b in analytics.board_leaderboard(request.user)
    ])


@api_view(["GET"])
def boards_geojson(request):
    rng = analytics.resolve_range(request.GET, default="all")
    campaign = analytics.require_visible_campaign(request.user, request.GET.get("campaign"))
    return Response(analytics.boards_geojson(request.user, rng, campaign=campaign))
