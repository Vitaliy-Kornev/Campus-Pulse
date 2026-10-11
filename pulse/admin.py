from django.contrib import admin
from django.utils import timezone

from .models import Board, Campus, Club, Event, Flyer, Membership, Notification, Scan


@admin.register(Campus)
class CampusAdmin(admin.ModelAdmin):
    list_display = ("name", "center_latitude", "center_longitude", "default_zoom", "created_at")
    search_fields = ("name",)


@admin.register(Board)
class BoardAdmin(admin.ModelAdmin):
    list_display = ("name", "area", "building", "floor", "latitude", "longitude", "is_active", "created_by")
    list_filter = ("is_active", "area", "campus")
    list_select_related = ("created_by",)
    raw_id_fields = ("created_by",)
    search_fields = ("name", "building", "description")
    actions = ("retire_boards", "reactivate_boards")

    @admin.action(description="Retire selected boards")
    def retire_boards(self, request, queryset):
        queryset.update(is_active=False)

    @admin.action(description="Reactivate selected boards")
    def reactivate_boards(self, request, queryset):
        queryset.update(is_active=True)

    def get_actions(self, request):
        actions = super().get_actions(request)
        actions.pop("delete_selected", None)  # boards are retired, not deleted
        return actions

    def has_delete_permission(self, request, obj=None):
        if obj is not None and obj.flyers.exists():
            return False
        return super().has_delete_permission(request, obj)


class MembershipInline(admin.TabularInline):
    model = Membership
    extra = 0
    raw_id_fields = ("user",)


@admin.register(Club)
class ClubAdmin(admin.ModelAdmin):
    list_display = ("name", "club_type", "created_at")
    list_filter = ("club_type",)
    search_fields = ("name", "description")
    inlines = [MembershipInline]


@admin.register(Event)
class EventAdmin(admin.ModelAdmin):
    list_display = ("name", "club", "event_type", "destination_url", "start_date", "end_date", "created_at")
    list_filter = ("event_type", "start_date", "end_date")
    search_fields = ("name", "club__name", "destination_url")
    list_select_related = ("club",)
    raw_id_fields = ("created_by",)


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ("title", "club", "kind", "created_at")
    list_filter = ("kind",)
    search_fields = ("title", "club__name")


@admin.register(Flyer)
class FlyerAdmin(admin.ModelAdmin):
    list_display = ("slug", "event", "board", "label", "posted_at", "removed_at")
    list_filter = ("board__area", "event", ("removed_at", admin.EmptyFieldListFilter))
    search_fields = ("slug", "label", "event__name", "board__name")
    list_select_related = ("event", "board")
    readonly_fields = ("slug", "created_at")
    actions = ("mark_removed",)

    @admin.action(description="Mark selected flyers removed")
    def mark_removed(self, request, queryset):
        queryset.filter(removed_at__isnull=True).update(removed_at=timezone.now())

    def get_actions(self, request):
        actions = super().get_actions(request)
        actions.pop("delete_selected", None)  # flyers with scans must never be hard-deleted
        return actions

    def has_delete_permission(self, request, obj=None):
        if obj is not None and obj.scans.exists():
            return False
        return super().has_delete_permission(request, obj)


@admin.register(Scan)
class ScanAdmin(admin.ModelAdmin):
    list_display = ("flyer", "scanned_at", "device_type", "is_bot")
    list_filter = ("is_bot", "device_type", "flyer__event")
    search_fields = ("flyer__slug", "visitor_hash", "user_agent")
    list_select_related = ("flyer", "flyer__event", "flyer__board")
    date_hierarchy = "scanned_at"
    readonly_fields = ("flyer", "scanned_at", "visitor_hash", "user_agent", "device_type", "is_bot", "created_at")

