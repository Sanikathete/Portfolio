from django.core.management.base import BaseCommand

from portfolio.services.yahoo_service import build_stock_universe_csv


class Command(BaseCommand):
    help = (
        "Fetch symbols across sectors from yfinance, build a pandas DataFrame, "
        "and save it to backend/portfolio/data/stocks_by_sector.csv."
    )

    def handle(self, *args, **options):
        try:
            result = build_stock_universe_csv()
        except Exception as exc:
            self.stdout.write(self.style.ERROR(f"CSV generation failed: {exc}"))
            return

        self.stdout.write(
            self.style.SUCCESS(
                f"Generated {result['path']} with {result['symbols_count']} symbols in "
                f"{result['sectors_count']} sectors."
            )
        )
