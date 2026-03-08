import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("portfolio", "0002_stock_metrics_and_buy_price"),
    ]

    operations = [
        migrations.AddField(
            model_name="portfolio",
            name="name",
            field=models.CharField(default="My Portfolio", max_length=100),
        ),
        migrations.AlterField(
            model_name="portfolio",
            name="user",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name="portfolios",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
    ]
