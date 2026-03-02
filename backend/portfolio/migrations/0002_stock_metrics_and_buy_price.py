from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("portfolio", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="stock",
            name="pe_ratio",
            field=models.FloatField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="stock",
            name="previous_close",
            field=models.FloatField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="stock",
            name="market_cap",
            field=models.BigIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="portfoliostock",
            name="buy_price",
            field=models.FloatField(default=0.0),
            preserve_default=False,
        ),
    ]
