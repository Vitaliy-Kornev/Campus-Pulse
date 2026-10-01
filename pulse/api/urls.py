from django.urls import path

from . import auth, boards, campaigns, flyers

urlpatterns = [
    # Session and accounts
    path("session/", auth.session, name="api_session"),
    path("auth/login/", auth.login_view, name="api_login"),
    path("auth/logout/", auth.logout_view, name="api_logout"),
    path("auth/signup/", auth.signup, name="api_signup"),
    path("auth/password/change/", auth.password_change, name="api_password_change"),
    path("auth/password/reset/", auth.password_reset, name="api_password_reset"),
    path("auth/password/reset/confirm/", auth.password_reset_confirm, name="api_password_reset_confirm"),
    # Boards
    path("boards/", boards.board_list, name="api_boards"),
    path("boards/<int:pk>/", boards.board_detail, name="api_board_detail"),
    path("boards/leaderboard/", boards.leaderboard, name="api_board_leaderboard"),
    path("boards.geojson", boards.boards_geojson, name="api_boards_geojson"),
    # Campaigns
    path("campaigns/", campaigns.campaign_list, name="api_campaigns"),
    path("campaigns/<int:pk>/", campaigns.campaign_detail, name="api_campaign_detail"),
    path("campaigns/<int:pk>/summary", campaigns.campaign_summary, name="api_campaign_summary"),
    path("campaigns/<int:pk>/flyers", campaigns.campaign_flyers, name="api_campaign_flyers"),
    path("campaigns/<int:pk>/timeseries", campaigns.campaign_timeseries, name="api_campaign_timeseries"),
    path("campaigns/<int:pk>/by-board", campaigns.campaign_by_board, name="api_campaign_by_board"),
    path("campaigns/<int:pk>/export.csv", campaigns.export_csv, name="api_campaign_export"),
    # Flyers
    path("flyers/", flyers.flyer_create, name="api_flyers"),
    path("flyers/<str:slug>/", flyers.flyer_detail, name="api_flyer_detail"),
    path("flyers/<str:slug>/remove/", flyers.flyer_remove, name="api_flyer_remove"),
    path("flyers/<str:slug>/repost/", flyers.flyer_repost, name="api_flyer_repost"),
    path("flyers/<str:slug>/hourly", flyers.flyer_hourly, name="api_flyer_hourly"),
    path("flyers/<str:slug>/timeseries", flyers.flyer_timeseries, name="api_flyer_timeseries"),
    path("flyers/<str:slug>/qr.png", flyers.qr_png, name="api_flyer_qr_png"),
    path("flyers/<str:slug>/qr.svg", flyers.qr_svg, name="api_flyer_qr_svg"),
]
