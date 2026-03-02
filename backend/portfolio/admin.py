from django.contrib import admin
from .models import Stock, Portfolio, PortfolioStock


@admin.register(Stock)
class StockAdmin(admin.ModelAdmin):
    list_display = ("id", "symbol", "company_name", "sector", "price", "pe_ratio")
    search_fields = ("symbol", "company_name", "sector")

    def has_add_permission(self, request):
        return False


class PortfolioStockInline(admin.TabularInline):
    model = PortfolioStock
    extra = 0
    readonly_fields = ("stock", "quantity", "buy_price")

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(Portfolio)
class PortfolioAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "display_total_value")
    inlines = [PortfolioStockInline]

    def display_total_value(self, obj):
        return obj.total_value()

    display_total_value.short_description = "Total Value"


@admin.register(PortfolioStock)
class PortfolioStockAdmin(admin.ModelAdmin):
    list_display = ("id", "portfolio", "stock", "quantity", "buy_price")
    search_fields = ("portfolio__user__username", "stock__symbol")

    def has_add_permission(self, request):
        return False
