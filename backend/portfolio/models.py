from django.conf import settings
from django.db import models


class Stock(models.Model):
    symbol = models.CharField(max_length=20, unique=True)
    company_name = models.CharField(max_length=255)
    sector = models.CharField(max_length=100)
    price = models.FloatField()
    pe_ratio = models.FloatField(null=True, blank=True)
    previous_close = models.FloatField(null=True, blank=True)
    market_cap = models.BigIntegerField(null=True, blank=True)

    def __str__(self):
        return f"{self.symbol} - {self.company_name}"


class Portfolio(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="portfolio"
    )

    def total_value(self):
        return sum(item.quantity * item.stock.price for item in self.holdings.select_related("stock"))

    def __str__(self):
        return f"{self.user.username}'s Portfolio"


class PortfolioStock(models.Model):
    portfolio = models.ForeignKey(
        Portfolio, on_delete=models.CASCADE, related_name="holdings"
    )
    stock = models.ForeignKey(
        Stock, on_delete=models.CASCADE, related_name="portfolio_stocks"
    )
    quantity = models.IntegerField()
    buy_price = models.FloatField()

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["portfolio", "stock"], name="unique_portfolio_stock"
            )
        ]

    def __str__(self):
        return f"{self.portfolio.user.username} - {self.stock.symbol} ({self.quantity})"
