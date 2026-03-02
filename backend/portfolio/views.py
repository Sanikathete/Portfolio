from rest_framework import status
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Stock, Portfolio, PortfolioStock
from .serializers import PortfolioSerializer
from .services.yahoo_service import (
    get_available_sectors,
    get_sector_stocks,
    get_stock_data,
    get_symbols_by_sector,
)


class StockListCreateView(APIView):
    def get_permissions(self):
        return [AllowAny()]

    def get(self, request):
        all_items = []
        for sector in get_available_sectors():
            all_items.extend(get_sector_stocks(sector))
        return Response(all_items, status=status.HTTP_200_OK)


class PortfolioView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        portfolio, _ = Portfolio.objects.get_or_create(user=request.user)
        serializer = PortfolioSerializer(portfolio, context={"market_cache": {}})
        return Response(serializer.data, status=status.HTTP_200_OK)


class PortfolioAddStockView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        symbol = (request.data.get("symbol") or "").upper().strip()
        quantity = request.data.get("quantity")

        if not symbol or quantity is None:
            return Response(
                {"detail": "symbol and quantity are required."},
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

        market = get_stock_data(symbol)
        stock, _ = Stock.objects.update_or_create(
            symbol=market["symbol"],
            defaults={
                "company_name": market["company_name"],
                "sector": market["sector"],
                "price": market["current_price"],
                "pe_ratio": market["pe_ratio"],
                "previous_close": market["previous_close"],
                "market_cap": market["market_cap"],
            },
        )
        portfolio, _ = Portfolio.objects.get_or_create(user=request.user)
        buy_price = market["current_price"]

        portfolio_stock, created = PortfolioStock.objects.get_or_create(
            portfolio=portfolio,
            stock=stock,
            defaults={"quantity": quantity, "buy_price": buy_price},
        )
        if not created:
            total_quantity = portfolio_stock.quantity + quantity
            weighted_buy = (
                (portfolio_stock.buy_price * portfolio_stock.quantity) + (buy_price * quantity)
            ) / total_quantity
            portfolio_stock.buy_price = round(weighted_buy, 2)
            portfolio_stock.quantity = total_quantity
            portfolio_stock.save()

        serializer = PortfolioSerializer(portfolio, context={"market_cache": {}})
        return Response(serializer.data, status=status.HTTP_200_OK)


class PortfolioRemoveStockView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request):
        stock_id = request.data.get("stock_id")
        if stock_id is None:
            return Response(
                {"detail": "stock_id is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        portfolio, _ = Portfolio.objects.get_or_create(user=request.user)
        deleted_count, _ = PortfolioStock.objects.filter(
            portfolio=portfolio, stock_id=stock_id
        ).delete()
        if deleted_count == 0:
            return Response(
                {"detail": "Stock not found in portfolio."},
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = PortfolioSerializer(portfolio, context={"market_cache": {}})
        return Response(serializer.data, status=status.HTTP_200_OK)


class PortfolioTotalView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        portfolio, _ = Portfolio.objects.get_or_create(user=request.user)
        total_value = 0.0
        for holding in portfolio.holdings.select_related("stock"):
            market = get_stock_data(holding.stock.symbol, fallback_sector=holding.stock.sector)
            total_value += market["current_price"] * holding.quantity
        return Response({"total_value": round(total_value, 2)}, status=status.HTTP_200_OK)


class SectorListView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        return Response({"sectors": get_available_sectors()}, status=status.HTTP_200_OK)


class StocksBySectorView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, sector_name):
        normalized = sector_name.upper()
        symbols = get_symbols_by_sector(normalized)
        if not symbols:
            return Response(
                {"detail": "Sector not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        data = get_sector_stocks(normalized)
        return Response(data, status=status.HTTP_200_OK)


class StockDetailsView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, symbol):
        try:
            stock_data = get_stock_data(symbol)
        except Exception:
            return Response(
                {"detail": "Unable to fetch stock details."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        profit_loss = 0.0
        quantity = 0
        buy_price = None

        if request.user.is_authenticated:
            portfolio, _ = Portfolio.objects.get_or_create(user=request.user)
            holding = portfolio.holdings.select_related("stock").filter(
                stock__symbol=symbol.upper()
            ).first()
            if holding:
                quantity = holding.quantity
                buy_price = holding.buy_price
                profit_loss = (stock_data["current_price"] - holding.buy_price) * holding.quantity

        response_payload = {
            **stock_data,
            "quantity": quantity,
            "buy_price": buy_price,
            "profit_loss": round(profit_loss, 2),
        }
        return Response(response_payload, status=status.HTTP_200_OK)


class PortfolioAnalyticsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        portfolio, _ = Portfolio.objects.get_or_create(user=request.user)
        holdings = portfolio.holdings.select_related("stock")

        total_value = 0.0
        total_profit_loss = 0.0
        sector_distribution = {}
        pe_values = []
        best_stock = None
        best_profit = None
        growth_series = []
        market_cache = {}

        for holding in holdings:
            symbol = holding.stock.symbol
            market = market_cache.get(symbol)
            if market is None:
                market = get_stock_data(symbol, fallback_sector=holding.stock.sector)
                market_cache[symbol] = market

            current_price = market["current_price"]
            position_value = current_price * holding.quantity
            profit_loss = (current_price - holding.buy_price) * holding.quantity
            pe_ratio = market["pe_ratio"]
            sector = market["sector"] or "UNKNOWN"

            total_value += position_value
            total_profit_loss += profit_loss
            sector_distribution[sector] = round(
                sector_distribution.get(sector, 0.0) + position_value, 2
            )
            if pe_ratio > 0:
                pe_values.append(pe_ratio)

            if best_profit is None or profit_loss > best_profit:
                best_profit = profit_loss
                best_stock = symbol

            for index, item in enumerate(market["historical_7d"]):
                if len(growth_series) <= index:
                    growth_series.append({"date": item["date"], "value": 0.0})
                growth_series[index]["value"] += item["price"] * holding.quantity

        average_pe_ratio = round(sum(pe_values) / len(pe_values), 2) if pe_values else 0.0
        growth_series = [
            {"date": item["date"], "value": round(item["value"], 2)} for item in growth_series
        ]

        return Response(
            {
                "total_value": round(total_value, 2),
                "total_profit_loss": round(total_profit_loss, 2),
                "sector_distribution": sector_distribution,
                "average_pe_ratio": average_pe_ratio,
                "best_performing_stock": best_stock,
                "portfolio_growth": growth_series,
            },
            status=status.HTTP_200_OK,
        )
