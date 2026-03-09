from django.contrib.auth import authenticate, get_user_model
from django.db import transaction
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from portfolio.models import Country, Portfolio, PortfolioStock, Sector, Stock
from portfolio.services.finance_tracker_service import (
    btc_forecast_payload,
    build_stock_snapshot,
    metals_history_payload,
    portfolio_detail_payload,
    refresh_portfolio,
    risk_clusters_payload,
    search_yahoo_symbols,
    stock_detail_payload,
    top_discount_payload,
    top_growth_payload,
)


def _default_market():
    return Country.objects.get_or_create(name="Global", defaults={"code": "GL"})[0]


def _sector_for_name(name: str):
    clean_name = str(name or "").strip() or "Unknown"
    country = _default_market()
    sector, _ = Sector.objects.get_or_create(name=clean_name[:100], country=country)
    return sector


def _portfolio_for_user(user, portfolio_id):
    return Portfolio.objects.filter(user=user, id=portfolio_id).first()


def _token_for_user(user):
    Token.objects.filter(user=user).delete()
    return Token.objects.create(user=user)


class AuthSignupView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        username = str(request.data.get("username") or "").strip()
        password = request.data.get("password") or ""
        if not username or not password:
            return Response({"detail": "username and password are required."}, status=status.HTTP_400_BAD_REQUEST)
        if len(password) < 8:
            return Response({"detail": "password must be at least 8 characters."}, status=status.HTTP_400_BAD_REQUEST)

        user_model = get_user_model()
        if user_model.objects.filter(username=username).exists():
            return Response({"detail": "username already exists."}, status=status.HTTP_400_BAD_REQUEST)

        user = user_model.objects.create_user(username=username, password=password)
        token = _token_for_user(user)
        return Response(
            {
                "token": token.key,
                "user": {"id": user.id, "username": user.username},
            },
            status=status.HTTP_201_CREATED,
        )


class AuthLoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        username = str(request.data.get("username") or "").strip()
        password = request.data.get("password") or ""
        user = authenticate(request, username=username, password=password)
        if not user:
            return Response({"detail": "Invalid username or password."}, status=status.HTTP_401_UNAUTHORIZED)

        token = _token_for_user(user)
        return Response(
            {
                "token": token.key,
                "user": {"id": user.id, "username": user.username},
            },
            status=status.HTTP_200_OK,
        )


class AuthLogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if getattr(request, "auth", None):
            request.auth.delete()
        else:
            Token.objects.filter(user=request.user).delete()
        return Response({"detail": "Logged out successfully."}, status=status.HTTP_200_OK)


class AuthMeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({"id": request.user.id, "username": request.user.username}, status=status.HTTP_200_OK)


class PortfolioListCreatePromptView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        portfolios = []
        for portfolio in Portfolio.objects.filter(user=request.user).order_by("id"):
            portfolios.append(
                {
                    "id": portfolio.id,
                    "name": portfolio.name,
                    "sector": portfolio.sector_name or getattr(getattr(portfolio, "sector", None), "name", ""),
                }
            )
        return Response(portfolios, status=status.HTTP_200_OK)

    def post(self, request):
        name = str(request.data.get("name") or "").strip() or "My Portfolio"
        sector_name = str(request.data.get("sector") or "").strip()
        portfolio = Portfolio.objects.create(
            user=request.user,
            name=name[:100],
            sector_name=sector_name[:100],
            sector=_sector_for_name(sector_name) if sector_name else None,
        )
        return Response(
            {
                "id": portfolio.id,
                "name": portfolio.name,
                "sector": portfolio.sector_name or "",
            },
            status=status.HTTP_201_CREATED,
        )


class PortfolioDetailPromptView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, portfolio_id):
        portfolio = _portfolio_for_user(request.user, portfolio_id)
        if portfolio is None:
            return Response({"detail": "Portfolio not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(portfolio_detail_payload(portfolio), status=status.HTTP_200_OK)

    def delete(self, request, portfolio_id):
        portfolio = _portfolio_for_user(request.user, portfolio_id)
        if portfolio is None:
            return Response({"detail": "Portfolio not found."}, status=status.HTTP_404_NOT_FOUND)
        portfolio.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class StockListCreatePromptView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        portfolio_id = request.query_params.get("portfolio_id")
        if not portfolio_id:
            return Response([], status=status.HTTP_200_OK)
        portfolio = _portfolio_for_user(request.user, portfolio_id)
        if portfolio is None:
            return Response({"detail": "Portfolio not found."}, status=status.HTTP_404_NOT_FOUND)
        payload = portfolio_detail_payload(portfolio)
        return Response(payload["stocks"], status=status.HTTP_200_OK)

    @transaction.atomic
    def post(self, request):
        portfolio_id = request.data.get("portfolio_id")
        ticker = str(request.data.get("ticker") or request.data.get("symbol") or "").strip().upper()
        quantity = request.data.get("quantity", 1)
        if not portfolio_id or not ticker:
            return Response({"detail": "portfolio_id and ticker are required."}, status=status.HTTP_400_BAD_REQUEST)

        portfolio = _portfolio_for_user(request.user, portfolio_id)
        if portfolio is None:
            return Response({"detail": "Portfolio not found."}, status=status.HTTP_404_NOT_FOUND)

        try:
            quantity = int(quantity)
        except (TypeError, ValueError):
            return Response({"detail": "quantity must be an integer."}, status=status.HTTP_400_BAD_REQUEST)
        if quantity <= 0:
            return Response({"detail": "quantity must be greater than 0."}, status=status.HTTP_400_BAD_REQUEST)

        snapshot = build_stock_snapshot(ticker, fallback_sector=portfolio.sector_name or None)
        sector = _sector_for_name(snapshot["sector"])
        stock, _ = Stock.objects.update_or_create(
            symbol=ticker,
            defaults={
                "portfolio": None,
                "country": _default_market(),
                "sector": sector,
                "name": snapshot["company_name"],
                "company_name": snapshot["company_name"],
                "price": snapshot["current_price"],
                "pe_ratio": snapshot["pe_ratio"],
                "eps": snapshot["eps"],
                "previous_close": snapshot["previous_close"],
                "market_cap": snapshot["market_cap"],
                "min_price": snapshot["min_price"],
                "max_price": snapshot["max_price"],
                "intrinsic_value": snapshot["intrinsic_value"],
                "discount_level": snapshot["discount_level"],
                "opportunity_score": snapshot["opportunity_score"],
            },
        )

        holding, created = PortfolioStock.objects.get_or_create(
            portfolio=portfolio,
            stock=stock,
            defaults={"quantity": quantity, "buy_price": snapshot["current_price"]},
        )
        if not created:
            existing_cost = holding.buy_price * holding.quantity
            new_cost = snapshot["current_price"] * quantity
            total_quantity = holding.quantity + quantity
            holding.quantity = total_quantity
            holding.buy_price = round((existing_cost + new_cost) / total_quantity, 2)
            holding.save(update_fields=["quantity", "buy_price"])

        return Response(portfolio_detail_payload(portfolio), status=status.HTTP_201_CREATED)


class StockSearchPromptView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        query = request.query_params.get("q")
        return Response(search_yahoo_symbols(query), status=status.HTTP_200_OK)


class StockDetailPromptView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, stock_id):
        stock = Stock.objects.filter(id=stock_id, portfolio_stocks__portfolio__user=request.user).distinct().first()
        if stock is None:
            return Response({"detail": "Stock not found."}, status=status.HTTP_404_NOT_FOUND)
        range_code = request.query_params.get("range", "3M")
        return Response(stock_detail_payload(stock, range_code=range_code), status=status.HTTP_200_OK)

    def delete(self, request, stock_id):
        portfolio_id = request.query_params.get("portfolio_id") or request.data.get("portfolio_id")
        portfolio = _portfolio_for_user(request.user, portfolio_id) if portfolio_id else None
        if portfolio is None:
            return Response({"detail": "Portfolio not found."}, status=status.HTTP_404_NOT_FOUND)

        deleted, _ = PortfolioStock.objects.filter(portfolio=portfolio, stock_id=stock_id).delete()
        if deleted == 0:
            return Response({"detail": "Stock not found in portfolio."}, status=status.HTTP_404_NOT_FOUND)
        refresh_portfolio(portfolio)
        return Response(portfolio_detail_payload(portfolio), status=status.HTTP_200_OK)


class PortfolioTopDiscountPromptView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, portfolio_id):
        portfolio = _portfolio_for_user(request.user, portfolio_id)
        if portfolio is None:
            return Response({"detail": "Portfolio not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(top_discount_payload(portfolio), status=status.HTTP_200_OK)


class PortfolioTopGrowthPromptView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, portfolio_id):
        portfolio = _portfolio_for_user(request.user, portfolio_id)
        if portfolio is None:
            return Response({"detail": "Portfolio not found."}, status=status.HTTP_404_NOT_FOUND)
        range_code = request.query_params.get("range", "1M")
        return Response(top_growth_payload(portfolio, range_code=range_code), status=status.HTTP_200_OK)


class PortfolioRiskClustersPromptView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, portfolio_id):
        portfolio = _portfolio_for_user(request.user, portfolio_id)
        if portfolio is None:
            return Response({"detail": "Portfolio not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(risk_clusters_payload(portfolio), status=status.HTTP_200_OK)


class MetalsHistoryPromptView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        range_code = request.query_params.get("range", "3Y")
        return Response(metals_history_payload(range_code=range_code), status=status.HTTP_200_OK)


class CryptoForecastPromptView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        model_name = request.query_params.get("model", "linear")
        horizon = request.query_params.get("horizon", 30)
        return Response(btc_forecast_payload(model_name=model_name, horizon=horizon), status=status.HTTP_200_OK)
