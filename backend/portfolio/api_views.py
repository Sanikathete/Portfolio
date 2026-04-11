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
    "in": "India",
    "india": "India",
    "bharat": "India",
}


def _normalize_country_name(name):
    value = str(name or "").strip()
    if not value:
        return "Unknown"
    return COUNTRY_ALIASES.get(value.lower(), value)


def _normalize_sector_name(name):
    value = str(name or "").strip()
    if not value:
        return "Unknown"

    value = value.replace("_", " ")
    value = " ".join(value.split())
    if value.isupper():
        value = value.title()
    return value or "Unknown"


def _normalize_stock_name(name, fallback_symbol):
    value = str(name or "").strip()
    if not value or value.lower() == "unknown stock":
        return str(fallback_symbol or "").strip().upper() or "Unknown Stock"
    return value


def _catalog_signature():
    csv_mtime_ns = None
    try:
        if CATALOG_CSV_PATH.exists():
            csv_mtime_ns = CATALOG_CSV_PATH.stat().st_mtime_ns
    except OSError:
        csv_mtime_ns = None

    return (
        csv_mtime_ns,
        Country.objects.count(),
        Sector.objects.count(),
        Stock.objects.count(),
    )


@lru_cache(maxsize=8)
def _catalog_payload_cached(signature):
    countries = set()
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

            if not country_name or not symbol or not sector_name:
                continue

            countries.add(country_name)
            sector_key = (country_name, sector_name.lower())
            sectors.setdefault(sector_key, sector_name)
            stock_key = (country_name, sector_name.lower(), symbol)
            stocks.setdefault(
                stock_key,
                {
                    "name": stock_name,
                    "symbol": symbol,
                },
            )

    for item in Country.objects.all().order_by("name"):
        country_name = _normalize_country_name(item.name)
        if country_name:
            countries.add(country_name)

    for item in Sector.objects.select_related("country").all().order_by("name"):
        country_name = _normalize_country_name(getattr(item.country, "name", "Unknown"))
        if not country_name:
            continue
        countries.add(country_name)
        sector_name = _normalize_sector_name(item.name)
        sector_key = (country_name, sector_name.lower())
        sectors.setdefault(sector_key, sector_name)

    for item in Stock.objects.select_related("country", "sector").all().order_by("name"):
        country_name = _normalize_country_name(
            getattr(getattr(item, "country", None), "name", None) or "United States"
        )
        if not country_name:
            continue

        symbol = str(item.symbol or "").strip().upper()
        if not symbol:
            continue

        countries.add(country_name)
        sector_name = _normalize_sector_name(getattr(getattr(item, "sector", None), "name", None))
        sector_key = (country_name, sector_name.lower())
        sectors.setdefault(sector_key, sector_name)
        stock_key = (country_name, sector_name.lower(), symbol)
        stocks.setdefault(
            stock_key,
            {
                "name": _normalize_stock_name(item.company_name or item.name, symbol),
                "symbol": symbol,
            },
        )

    global_name = "Global"
    # Reserve an explicit "Global" option so the UI can show an "all markets" view,
    # even when there is no corresponding Country row in the database.
    country_names = sorted(name for name in countries if name and name != global_name)
    country_ids = {global_name: 0, **{name: idx + 1 for idx, name in enumerate(country_names)}}

    country_list = [{"id": 0, "name": global_name}] + [
        {"id": country_ids[name], "name": name} for name in country_names
    ]

    global_sector_names = {}
    for (country_name, sector_key_lower), sector_name in sectors.items():
        if not sector_name:
            continue
        global_sector_names.setdefault(sector_key_lower, sector_name)

    sector_records = []
    for (country_name, sector_key_lower), sector_name in sectors.items():
        if (
            not sector_name
            or country_name not in country_ids
            or country_name == global_name
        ):
            continue
        sector_records.append(
            {
                "country_id": country_ids[country_name],
                "name": sector_name,
                "sector_key": sector_key_lower,
                "country_key": country_name,
            }
        )

    for sector_key_lower, sector_name in global_sector_names.items():
        sector_records.append(
            {
                "country_id": 0,
                "name": sector_name,
                "sector_key": sector_key_lower,
                "country_key": global_name,
            }
        )

    sector_records.sort(key=lambda item: (item["country_id"], item["name"].lower()))
    sector_list = []
    sector_id_by_key = {}
    for idx, record in enumerate(sector_records, start=1):
        sector_id_by_key[(record["country_key"], record["sector_key"])] = idx
        sector_list.append(
            {
                "id": idx,
                "name": record["name"],
                "country_id": record["country_id"],
            }
        )

    stock_records = []
    for (country_name, sector_key_lower, symbol), stock in stocks.items():
        if country_name == global_name:
            continue
        sector_id = sector_id_by_key.get((country_name, sector_key_lower))
        global_sector_id = sector_id_by_key.get((global_name, sector_key_lower))
        if sector_id:
            stock_records.append(
                {
                    "name": stock["name"],
                    "symbol": symbol,
                    "sector_id": sector_id,
                    "country_id": country_ids.get(country_name, 0),
                }
            )
        if global_sector_id:
            stock_records.append(
                {
                    "name": stock["name"],
                    "symbol": symbol,
                    "sector_id": global_sector_id,
                    "country_id": 0,
                }
            )

    stock_records.sort(key=lambda item: (item["sector_id"], item["symbol"]))
    stock_list = []
    for idx, record in enumerate(stock_records, start=1):
        stock_list.append(
            {
                "id": idx,
                "name": record["name"],
                "symbol": record["symbol"],
                "sector_id": record["sector_id"],
                "country_id": record["country_id"],
            }
        )

    return {
        "countries": country_list,
        "sectors": sector_list,
        "stocks": stock_list,
    }


def _catalog_payload():
    return _catalog_payload_cached(_catalog_signature())


class CountryListAPIView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        payload = _catalog_payload()["countries"]
        response = Response(payload, status=status.HTTP_200_OK)
        response["Cache-Control"] = "no-store"
        return response


class SectorByCountryAPIView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, country_id):
        payload = [
            {"id": item["id"], "name": item["name"]}
            for item in _catalog_payload()["sectors"]
            if int(item["country_id"]) == int(country_id)
        ]
        response = Response(payload, status=status.HTTP_200_OK)
        response["Cache-Control"] = "no-store"
        return response


class StockBySectorAPIView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, sector_id):
        payload = [
            {"id": item["id"], "name": item["name"], "symbol": item["symbol"]}
            for item in _catalog_payload()["stocks"]
            if int(item["sector_id"]) == int(sector_id)
        ]
        response = Response(payload, status=status.HTTP_200_OK)
        response["Cache-Control"] = "no-store"
        return response


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
