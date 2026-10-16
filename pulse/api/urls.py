from django.urls import path

from . import auth, boards, clubs, errors, events, flyers

urlpatterns = [
    # Session and accounts
    path("session/", auth.session, name="api_session"),
    path("client-errors/", errors.client_error, name="api_client_errors"),
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
    # Events
    path("events/", events.event_list, name="api_events"),
    path("events/<int:pk>/", events.event_detail, name="api_event_detail"),
    path("events/<int:pk>/summary", events.event_summary, name="api_event_summary"),
    path("events/<int:pk>/flyers", events.event_flyers, name="api_event_flyers"),
    path("events/<int:pk>/timeseries", events.event_timeseries, name="api_event_timeseries"),
    path("events/<int:pk>/by-board", events.event_by_board, name="api_event_by_board"),
    path("events/<int:pk>/export.csv", events.export_csv, name="api_event_export"),
    path("events/<int:pk>/recap", events.event_recap, name="api_event_recap"),
    path("recommendations/boards", events.board_recommendations, name="api_board_recommendations"),
    # Clubs and notifications
    path("taxonomy/", clubs.taxonomy_view, name="api_taxonomy"),
    path("clubs/", clubs.club_list, name="api_clubs"),
    path("clubs/<int:pk>/join/", clubs.join_club, name="api_club_join"),
    path("clubs/<int:pk>/open/", clubs.open_club, name="api_club_open"),
    path("clubs/<int:pk>/leave/", clubs.leave_club, name="api_club_leave"),
    path("club/", clubs.my_club, name="api_my_club"),
    path("club/members/<int:pk>/<str:action>/", clubs.member_action, name="api_club_member_action"),
    path("notifications/", clubs.notification_list, name="api_notifications"),
    path("notifications/read/", clubs.notifications_read, name="api_notifications_read"),
    path("notifications/dismiss/", clubs.notifications_dismiss, name="api_notifications_dismiss"),
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
