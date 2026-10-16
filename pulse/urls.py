from django.urls import include, path, re_path

from .views import redirect, spa

urlpatterns = [
    path("r/<str:slug>/", redirect.scan_redirect, name="scan_redirect"),
    path("api/", include("pulse.api.urls")),
    # Every other path is a page of the React app, which does its own routing.
    re_path(r"^(?!(?:api|admin|static|r)(?:/|$)).*$", spa.index, name="spa"),
]
