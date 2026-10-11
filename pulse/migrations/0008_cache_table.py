from django.core.management import call_command
from django.db import migrations


def create_cache_table(apps, schema_editor):
    """The shared cache (rate limits, cached recommendations) lives in a database table."""
    call_command("createcachetable", "pulse_cache", database=schema_editor.connection.alias, verbosity=0)


class Migration(migrations.Migration):
    dependencies = [("pulse", "0007_dismiss_notifications")]

    operations = [migrations.RunPython(create_cache_table, migrations.RunPython.noop)]
