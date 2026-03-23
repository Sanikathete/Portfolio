from functools import lru_cache
from pathlib import Path

import pandas as pd
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from portfolio.analytics.data_pipeline import analyze_portfolio
from portfolio.models import Country, Portfolio, PortfolioStock, Sector, Stock


CATALOG_CSV_PATH = Path(__file__).resolve().parent / "data" / "stocks_by_sector.csv"
COUNTRY_ALIASES = {
    "us": "United States",
    "u.s.": "United States",
    "u.s.a.": "United States",
    "usa": "United States",
    "united states of america": "United States",
    "uk": "United Kingdom",
    "u.k.": "United Kingdom",
    "great britain": "United Kingdom",
}


def _normalize_country_name(name):
    value = str(name or "").strip()
    if not value:
        return "Unknown"
    return COUNTRY_ALIASES.get(value.lower(), value)


def _normalize_sector_name(name):
    value = str(name or "").strip()
    return value or "Unknown"


def _normalize_stock_name(name, fallback_symbol):
    value = str(name or "").strip()
    if not value or value.lower() == "unknown stock":
        return str(fallback_symbol or "").strip().upper() or "Unknown Stock"
    return value


@lru_cache(maxsize=1)
def _catalog_payload():
    countries = {}
    sectors = {}
    stocks = {}

    csv_df = pd.read_csv(CATALOG_CSV_PATH) if CATALOG_CSV_PATH.exists() else pd.DataFrame()
    if not csv_df.empty:
        csv_df = csv_df.fillna("")
        for _, row in csv_df.iterrows():
            country_name = _normalize_country_name(row.get("country"))
            sector_name = _normalize_sector_name(row.get("sector"))
            symbol = str(row.get("symbol", "")).strip().upper()
            stock_name = _normalize_stock_name(row.get("company_name", ""), symbol)

            if country_name not in countries:
                countries[country_name] = {
                    "id": len(countries) + 1,
                    "name": country_name,
                }

            sector_key = (countries[country_name]["id"], sector_name.lower())
            if sector_key not in sectors:
                sectors[sector_key] = {
                    "id": len(sectors) + 1,
                    "name": sector_name,
                    "country_id": countries[country_name]["id"],
                }

            stock_key = (sectors[sector_key]["id"], symbol)
            if stock_key not in stocks:
                stocks[stock_key] = {
                    "id": len(stocks) + 1,
                    "name": stock_name,
                    "symbol": symbol,
                    "sector_id": sectors[sector_key]["id"],
                    "country_id": countries[country_name]["id"],
                }

    for item in Country.objects.all().order_by("name"):
        country_name = _normalize_country_name(item.name)
        if country_name not in countries:
            countries[country_name] = {
                "id": len(countries) + 1,
                "name": country_name,
            }

    for item in Sector.objects.select_related("country").all().order_by("name"):
        country_name = _normalize_country_name(getattr(item.country, "name", "Unknown"))
        if country_name not in countries:
            countries[country_name] = {
                "id": len(countries) + 1,
                "name": country_name,
            }
        sector_key = (countries[country_name]["id"], item.name.lower())
        if sector_key not in sectors:
            sectors[sector_key] = {
                "id": len(sectors) + 1,
                "name": item.name,
                "country_id": countries[country_name]["id"],
            }

    for item in Stock.objects.select_related("country", "sector").all().order_by("name"):
        country_name = _normalize_country_name(
            getattr(getattr(item, "country", None), "name", None) or "United States"
        )
        if country_name not in countries:
            countries[country_name] = {
                "id": len(countries) + 1,
                "name": country_name,
            }
        sector_name = _normalize_sector_name(getattr(getattr(item, "sector", None), "name", None))
        sector_key = (countries[country_name]["id"], sector_name.lower())
        if sector_key not in sectors:
            sectors[sector_key] = {
                "id": len(sectors) + 1,
                "name": sector_name,
                "country_id": countries[country_name]["id"],
            }
        stock_key = (sectors[sector_key]["id"], item.symbol.upper())
        if stock_key not in stocks:
            stocks[stock_key] = {
                "id": len(stocks) + 1,
                "name": _normalize_stock_name(item.company_name or item.name, item.symbol),
                "symbol": item.symbol.upper(),
                "sector_id": sectors[sector_key]["id"],
                "country_id": countries[country_name]["id"],
            }

    country_list = sorted(countries.values(), key=lambda item: item["name"])
    sector_list = sorted(sectors.values(), key=lambda item: (item["country_id"], item["name"].lower()))
    stock_list = sorted(stocks.values(), key=lambda item: (item["sector_id"], item["symbol"]))
    return {
        "countries": country_list,
        "sectors": sector_list,
        "stocks": stock_list,
    }


class CountryListAPIView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        payload = _catalog_payload()["countries"]
        return Response(payload, status=status.HTTP_200_OK)


class SectorByCountryAPIView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, country_id):
        payload = [
            {"id": item["id"], "name": item["name"]}
            for item in _catalog_payload()["sectors"]
            if int(item["country_id"]) == int(country_id)
        ]
        return Response(payload, status=status.HTTP_200_OK)


class StockBySectorAPIView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, sector_id):
        payload = [
            {"id": item["id"], "name": item["name"], "symbol": item["symbol"]}
            for item in _catalog_payload()["stocks"]
            if int(item["sector_id"]) == int(sector_id)
        ]
        return Response(payload, status=status.HTTP_200_OK)


class AddStockAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        portfolio_id = request.data.get("portfolio_id")
        stock_id = request.data.get("stock_id")
        quantity = request.data.get("quantity")

        if portfolio_id is None or stock_id is None or quantity is None:
            return Response(
                {"detail": "portfolio_id, stock_id and quantity are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            quantity = int(quantity)
        except (TypeError, ValueError):
            return Response(
                {"detail": "quantity must be an integer."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if quantity <= 0:
            return Response(
                {"detail": "quantity must be greater than 0."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        portfolio = Portfolio.objects.filter(id=portfolio_id, user=request.user).first()
        if not portfolio:
            return Response(
                {"detail": "Portfolio not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        stock = Stock.objects.filter(id=stock_id).first()
        if not stock:
            return Response(
                {"detail": "Stock not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        stock.portfolio = portfolio
        stock.quantity = (stock.quantity or 0) + quantity
        stock.save(update_fields=["portfolio", "quantity"])

        portfolio_stock, created = PortfolioStock.objects.get_or_create(
            portfolio=portfolio,
            stock=stock,
            defaults={"quantity": quantity, "buy_price": stock.price},
        )
        if not created:
            portfolio_stock.quantity += quantity
            if not portfolio_stock.buy_price:
                portfolio_stock.buy_price = stock.price
            portfolio_stock.save(update_fields=["quantity", "buy_price"])

        return Response(
            {
                "detail": "Stock added to portfolio.",
                "portfolio_id": portfolio.id,
                "stock_id": stock.id,
                "quantity": stock.quantity,
            },
            status=status.HTTP_200_OK,
        )


class PortfolioAnalyticsAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, portfolio_id):
        portfolio = Portfolio.objects.filter(id=portfolio_id, user=request.user).first()
        if not portfolio:
            return Response(
                {"detail": "Portfolio not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        payload = analyze_portfolio(portfolio.id)
        return Response(payload, status=status.HTTP_200_OK)
