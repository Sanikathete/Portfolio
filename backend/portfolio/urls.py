from django.urls import path
from .views import (
    StockListCreateView,
    PortfolioView,
    PortfolioAddStockView,
    PortfolioRemoveStockView,
    PortfolioTotalView,
    SectorListView,
    StocksBySectorView,
    StockDetailsView,
    PortfolioAnalyticsView,
)


urlpatterns = [
    path("stocks/", StockListCreateView.as_view(), name="stocks"),
    path("sectors/", SectorListView.as_view(), name="sectors"),
    path(
        "stocks/by-sector/<str:sector_name>/",
        StocksBySectorView.as_view(),
        name="stocks-by-sector",
    ),
    path(
        "stocks/details/<str:symbol>/",
        StockDetailsView.as_view(),
        name="stock-details",
    ),
    path("portfolio/", PortfolioView.as_view(), name="portfolio"),
    path("portfolio/add/", PortfolioAddStockView.as_view(), name="portfolio-add"),
    path("portfolio/remove/", PortfolioRemoveStockView.as_view(), name="portfolio-remove"),
    path("portfolio/total/", PortfolioTotalView.as_view(), name="portfolio-total"),
    path("portfolio/analytics/", PortfolioAnalyticsView.as_view(), name="portfolio-analytics"),
]
