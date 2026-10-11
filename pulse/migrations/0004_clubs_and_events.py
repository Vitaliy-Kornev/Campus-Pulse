"""Campaigns become events, owned by clubs (shared by their officers) instead of single users.

Existing campaigns move to a placeholder club per former owner, so no data is lost on a live
database; officers can rename the club and fill in its profile afterwards.
"""

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


def move_owners_into_clubs(apps, schema_editor):
    Event = apps.get_model("pulse", "Event")
    Club = apps.get_model("pulse", "Club")
    Membership = apps.get_model("pulse", "Membership")
    clubs = {}
    for event in Event.objects.select_related("owner"):
        owner = event.owner
        if owner.pk not in clubs:
            name = f"{owner.username}'s club"
            club, _ = Club.objects.get_or_create(name=name, defaults={"club_type": "other", "fields": []})
            Membership.objects.get_or_create(user=owner, defaults={"club": club, "status": "active"})
            clubs[owner.pk] = club
        event.club = clubs[owner.pk]
        event.created_by = owner
        event.save(update_fields=["club", "created_by"])


class Migration(migrations.Migration):
    dependencies = [
        ("pulse", "0003_board_created_by"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="Club",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=150, unique=True)),
                ("club_type", models.CharField(default="other", max_length=30)),
                ("fields", models.JSONField(blank=True, default=list, help_text="Field-of-study codes from pulse.taxonomy.")),
                ("description", models.TextField(blank=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
            options={"ordering": ["name"]},
        ),
        migrations.CreateModel(
            name="Membership",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("status", models.CharField(default="pending", max_length=10)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("club", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="memberships", to="pulse.club")),
                ("user", models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name="membership", to=settings.AUTH_USER_MODEL)),
            ],
            options={"ordering": ["created_at"]},
        ),
        migrations.RenameModel("Campaign", "Event"),
        migrations.RenameField("flyer", "campaign", "event"),
        migrations.AddField(
            model_name="event",
            name="club",
            field=models.ForeignKey(null=True, on_delete=django.db.models.deletion.CASCADE, related_name="events", to="pulse.club"),
        ),
        migrations.AddField(
            model_name="event",
            name="created_by",
            field=models.ForeignKey(
                blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="events_created", to=settings.AUTH_USER_MODEL
            ),
        ),
        migrations.RunPython(move_owners_into_clubs, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="event",
            name="club",
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="events", to="pulse.club"),
        ),
        migrations.RemoveField(model_name="event", name="owner"),
        migrations.AddField(model_name="event", name="event_type", field=models.CharField(default="other", max_length=30)),
        migrations.AddField(model_name="event", name="first_scan_at", field=models.DateTimeField(blank=True, null=True)),
        migrations.CreateModel(
            name="Notification",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("kind", models.CharField(max_length=20)),
                ("key", models.CharField(max_length=60, help_text="What the notice is about, e.g. flyer:Ab3dEf7h; keeps it unique.")),
                ("title", models.CharField(max_length=200)),
                ("body", models.CharField(blank=True, max_length=300)),
                ("link", models.CharField(blank=True, max_length=200)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("club", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="notifications", to="pulse.club")),
                ("read_by", models.ManyToManyField(blank=True, related_name="read_notifications", to=settings.AUTH_USER_MODEL)),
            ],
            options={"ordering": ["-created_at"]},
        ),
        migrations.AddConstraint(
            model_name="notification",
            constraint=models.UniqueConstraint(fields=("club", "kind", "key"), name="unique_notification_per_subject"),
        ),
    ]
