from django.conf import settings
from django.db import models


class Country(models.Model):
    name = models.CharField(max_length=100)
    code = models.CharField(max_length=10)

    class Meta:
        unique_together = ("name", "code")

    def __str__(self):
        return self.name


class Sector(models.Model):
    name = models.CharField(max_length=100)
    country = models.ForeignKey(Country, on_delete=models.CASCADE, related_name="sectors")

    class Meta:
        unique_together = ("name", "country")

    def __str__(self):
        return self.name


class Portfolio(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="portfolios"
    )
    sector = models.ForeignKey(Sector, on_delete=models.CASCADE, null=True, blank=True)
    sector_name = models.CharField(max_length=100, blank=True, default="")
    name = models.CharField(max_length=100, default="My Portfolio")

    def total_value(self):
        return sum(item.quantity * item.stock.price for item in self.holdings.select_related("stock"))

    def __str__(self):
        return f"{self.user.username} - {self.name}"


class PortfolioStock(models.Model):
    portfolio = models.ForeignKey(
        Portfolio, on_delete=models.CASCADE, related_name="holdings"
    )
    stock = models.ForeignKey(
        "Stock", on_delete=models.CASCADE, related_name="portfolio_stocks"
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


class Stock(models.Model):
    portfolio = models.ForeignKey(
        "Portfolio",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="stocks",
    )
    country = models.ForeignKey(
        Country,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="stocks",
    )
    sector = models.ForeignKey(
        Sector,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="stocks",
    )
    name = models.CharField(max_length=200)
    symbol = models.CharField(max_length=20, unique=True)
    price = models.FloatField()
    quantity = models.IntegerField(default=0)
    company_name = models.CharField(max_length=255, blank=True, default="")
    pe_ratio = models.FloatField(null=True, blank=True)
    eps = models.FloatField(null=True, blank=True)
    previous_close = models.FloatField(null=True, blank=True)
    market_cap = models.BigIntegerField(null=True, blank=True)
    min_price = models.FloatField(null=True, blank=True)
    max_price = models.FloatField(null=True, blank=True)
    intrinsic_value = models.FloatField(null=True, blank=True)
    discount_level = models.FloatField(null=True, blank=True)
    opportunity_score = models.FloatField(null=True, blank=True)

    def __str__(self):
        return self.name
