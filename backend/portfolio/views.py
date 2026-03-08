from django.contrib.auth import get_user_model
from django.contrib.auth import authenticate, login, logout
from rest_framework import status
from rest_framework.permissions import IsAuthenticated, AllowAny, IsAdminUser
from rest_framework.response import Response
from rest_framework.views import APIView

from .cluster import analyze_portfolio
from .models import Country, Sector, Stock, Portfolio, PortfolioStock
from .serializers import PortfolioSerializer, PortfolioSummarySerializer
from .services.yahoo_service import (
    build_stock_universe_csv,
    get_assets_comparison,
    get_available_sectors,
    get_bitcoin_analysis,
    get_metals_analysis,
    get_sector_stocks,
    get_stock_forecast,
    get_stock_data,
    get_symbols_by_sector,
)


def _get_requested_portfolio_id(request):
    portfolio_id = request.query_params.get("portfolio_id")
    if portfolio_id is None and hasattr(request, "data"):
        portfolio_id = request.data.get("portfolio_id")
    return portfolio_id


def _get_portfolio_for_request(request, create_if_missing=True):
    raw_id = _get_requested_portfolio_id(request)
    queryset = Portfolio.objects.filter(user=request.user).order_by("id")

    if raw_id is not None:
        try:
            portfolio_id = int(raw_id)
        except (TypeError, ValueError) as exc:
            raise ValueError("portfolio_id must be an integer.") from exc

        portfolio = queryset.filter(id=portfolio_id).first()
        if not portfolio:
            raise Portfolio.DoesNotExist
        return portfolio

    existing = queryset.first()
    if existing:
        return existing

    if create_if_missing:
        return Portfolio.objects.create(user=request.user, name="My Portfolio")

    raise Portfolio.DoesNotExist


class StockListCreateView(APIView):
    def get_permissions(self):
        return [AllowAny()]

    def get(self, request):
        all_items = []
        for sector in get_available_sectors():
            all_items.extend(get_sector_stocks(sector))
        return Response(all_items, status=status.HTTP_200_OK)


class SignupView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        username = (request.data.get("username") or "").strip()
        password = request.data.get("password") or ""

        if not username or not password:
            return Response(
                {"detail": "username and password are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if len(password) < 8:
            return Response(
                {"detail": "password must be at least 8 characters."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user_model = get_user_model()
        if user_model.objects.filter(username=username).exists():
            return Response(
                {"detail": "username already exists."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user_model.objects.create_user(username=username, password=password)
        return Response(
            {"detail": "Account created successfully. Please log in."},
            status=status.HTTP_201_CREATED,
        )


class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        username = (request.data.get("username") or "").strip()
        password = request.data.get("password") or ""

        user = authenticate(request, username=username, password=password)
        if not user:
            return Response(
                {"detail": "Invalid username or password."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        login(request, user)
        request.session.set_expiry(None)
        return Response(
            {"detail": "Login successful.", "username": user.username},
            status=status.HTTP_200_OK,
        )


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        logout(request)
        return Response({"detail": "Logged out successfully."}, status=status.HTTP_200_OK)


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({"username": request.user.username}, status=status.HTTP_200_OK)


class ForgotPasswordView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        username = (request.data.get("username") or "").strip()
        password = request.data.get("password") or ""
        confirm_password = request.data.get("confirm_password") or ""

        if not username or not password or not confirm_password:
            return Response(
                {"detail": "username, password and confirm_password are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if password != confirm_password:
            return Response(
                {"detail": "Passwords do not match."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if len(password) < 8:
            return Response(
                {"detail": "password must be at least 8 characters."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user_model = get_user_model()
        user = user_model.objects.filter(username=username).first()
        if not user:
            return Response(
                {"detail": "Account not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        user.set_password(password)
        user.save(update_fields=["password"])

        return Response(
            {"detail": "Password updated successfully. Please log in."},
            status=status.HTTP_200_OK,
        )


class PortfolioListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        portfolios = Portfolio.objects.filter(user=request.user).order_by("id")
        if not portfolios.exists():
            Portfolio.objects.create(user=request.user, name="My Portfolio")
            portfolios = Portfolio.objects.filter(user=request.user).order_by("id")
        serializer = PortfolioSummarySerializer(portfolios, many=True)
        return Response({"portfolios": serializer.data}, status=status.HTTP_200_OK)

    def post(self, request):
        name = (request.data.get("name") or "").strip()
        if not name:
            count = Portfolio.objects.filter(user=request.user).count() + 1
            name = f"Portfolio {count}"

        portfolio = Portfolio.objects.create(user=request.user, name=name[:100])
        serializer = PortfolioSummarySerializer(portfolio)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class PortfolioView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            portfolio = _get_portfolio_for_request(request, create_if_missing=True)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except Portfolio.DoesNotExist:
            return Response({"detail": "Portfolio not found."}, status=status.HTTP_404_NOT_FOUND)

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
        if float(market.get("current_price", 0) or 0) <= 0:
            return Response(
                {"detail": "Unable to fetch a valid market price for this stock right now."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        default_country, _ = Country.objects.get_or_create(name="Global", defaults={"code": "GL"})
        sector_name = str(market.get("sector") or "Other").replace("_", " ").title()
        sector, _ = Sector.objects.get_or_create(name=sector_name[:100], country=default_country)

        stock, _ = Stock.objects.update_or_create(
            symbol=market["symbol"],
            defaults={
                "name": market["company_name"],
                "company_name": market["company_name"],
                "country": default_country,
                "sector": sector,
                "price": market["current_price"],
                "pe_ratio": market["pe_ratio"],
                "previous_close": market["previous_close"],
                "market_cap": market["market_cap"],
            },
        )
        try:
            portfolio = _get_portfolio_for_request(request, create_if_missing=True)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except Portfolio.DoesNotExist:
            return Response({"detail": "Portfolio not found."}, status=status.HTTP_404_NOT_FOUND)

        buy_price = market["current_price"]

        portfolio_stock, created = PortfolioStock.objects.get_or_create(
            portfolio=portfolio,
            stock=stock,
            defaults={"quantity": quantity, "buy_price": buy_price},
        )
        if not created:
            total_quantity = portfolio_stock.quantity + quantity
            existing_buy_price = (
                portfolio_stock.buy_price if portfolio_stock.buy_price and portfolio_stock.buy_price > 0 else buy_price
            )
            weighted_buy = (
                (existing_buy_price * portfolio_stock.quantity) + (buy_price * quantity)
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

        try:
            portfolio = _get_portfolio_for_request(request, create_if_missing=False)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except Portfolio.DoesNotExist:
            return Response({"detail": "Portfolio not found."}, status=status.HTTP_404_NOT_FOUND)

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
        try:
            portfolio = _get_portfolio_for_request(request, create_if_missing=True)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except Portfolio.DoesNotExist:
            return Response({"total_value": 0.0}, status=status.HTTP_200_OK)

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
            try:
                portfolio = _get_portfolio_for_request(request, create_if_missing=False)
            except (ValueError, Portfolio.DoesNotExist):
                portfolio = None

            if portfolio:
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


class StockForecastView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, symbol):
        try:
            payload = get_stock_forecast(symbol)
        except Exception:
            return Response(
                {"detail": "Unable to fetch stock forecast."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(payload, status=status.HTTP_200_OK)


class MetalsAnalysisView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            payload = get_metals_analysis()
        except Exception:
            return Response(
                {"detail": "Unable to fetch metals analysis."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(payload, status=status.HTTP_200_OK)


class BitcoinAnalysisView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            payload = get_bitcoin_analysis()
        except Exception:
            return Response(
                {"detail": "Unable to fetch Bitcoin analysis."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(payload, status=status.HTTP_200_OK)


class AssetComparisonView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            portfolio = _get_portfolio_for_request(request, create_if_missing=False)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except Portfolio.DoesNotExist:
            portfolio = None

        portfolio_symbols = []
        portfolio_name = None
        portfolio_id = None
        if portfolio is not None:
            portfolio_id = portfolio.id
            portfolio_name = portfolio.name
            portfolio_symbols = list(
                portfolio.holdings.select_related("stock").values_list("stock__symbol", flat=True)
            )

        try:
            payload = get_assets_comparison(portfolio_symbols)
        except Exception:
            return Response(
                {"detail": "Unable to fetch asset comparison."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        payload["portfolio_id"] = portfolio_id
        payload["portfolio_name"] = portfolio_name
        return Response(payload, status=status.HTTP_200_OK)


class PortfolioAnalyticsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            portfolio = _get_portfolio_for_request(request, create_if_missing=True)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except Portfolio.DoesNotExist:
            return Response(
                {
                    "total_value": 0.0,
                    "total_profit_loss": 0.0,
                    "min_portfolio_value": 0.0,
                    "max_portfolio_value": 0.0,
                    "sector_distribution": {},
                    "average_pe_ratio": 0.0,
                    "best_performing_stock": None,
                    "portfolio_growth": [],
                    "discount_distribution": [],
                    "opportunity_distribution": [],
                },
                status=status.HTTP_200_OK,
            )

        holdings = portfolio.holdings.select_related("stock")

        total_value = 0.0
        total_profit_loss = 0.0
        sector_distribution = {}
        pe_values = []
        best_stock = None
        best_profit = None
        growth_series = []
        discount_distribution = []
        opportunity_distribution = []
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

            discount_percent = round(float(market.get("discount_percent", 0.0) or 0.0), 2)
            discount_distribution.append(
                {
                    "symbol": symbol,
                    "discount_percent": discount_percent,
                }
            )
            previous_close = float(market.get("previous_close", 0.0) or 0.0)
            opportunity_value = 0.0
            if previous_close > current_price:
                opportunity_value = (previous_close - current_price) * holding.quantity
            opportunity_distribution.append(
                {
                    "symbol": symbol,
                    "opportunity_value": round(opportunity_value, 2),
                }
            )

            for index, item in enumerate(market["historical_7d"]):
                if len(growth_series) <= index:
                    growth_series.append({"date": item["date"], "value": 0.0})
                growth_series[index]["value"] += item["price"] * holding.quantity

        average_pe_ratio = round(sum(pe_values) / len(pe_values), 2) if pe_values else 0.0
        growth_series = [
            {"date": item["date"], "value": round(item["value"], 2)} for item in growth_series
        ]
        if growth_series:
            values = [item["value"] for item in growth_series]
            min_portfolio_value = round(min(values), 2)
            max_portfolio_value = round(max(values), 2)
        else:
            min_portfolio_value = round(total_value, 2)
            max_portfolio_value = round(total_value, 2)

        return Response(
            {
                "total_value": round(total_value, 2),
                "total_profit_loss": round(total_profit_loss, 2),
                "min_portfolio_value": min_portfolio_value,
                "max_portfolio_value": max_portfolio_value,
                "sector_distribution": sector_distribution,
                "average_pe_ratio": average_pe_ratio,
                "best_performing_stock": best_stock,
                "portfolio_growth": growth_series,
                "discount_distribution": discount_distribution,
                "opportunity_distribution": opportunity_distribution,
            },
            status=status.HTTP_200_OK,
        )


class PortfolioMLAnalysisView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            portfolio = _get_portfolio_for_request(request, create_if_missing=True)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except Portfolio.DoesNotExist:
            return Response({"detail": "Portfolio not found."}, status=status.HTTP_404_NOT_FOUND)

        result = analyze_portfolio(portfolio.id)
        return Response(result, status=status.HTTP_200_OK)


class StockUniverseRebuildView(APIView):
    permission_classes = [IsAdminUser]

    def post(self, request):
        try:
            result = build_stock_universe_csv()
        except Exception as exc:
            return Response(
                {"detail": f"Failed to rebuild stock universe: {exc}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        return Response(
            {
                "detail": "Stock universe CSV rebuilt successfully.",
                **result,
            },
            status=status.HTTP_200_OK,
        )
