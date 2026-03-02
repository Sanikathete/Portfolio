from rest_framework import serializers
from .models import Stock, Portfolio, PortfolioStock
from .services.yahoo_service import get_stock_data


class StockSerializer(serializers.ModelSerializer):
    class Meta:
        model = Stock
        fields = [
            "id",
            "symbol",
            "company_name",
            "sector",
            "price",
            "pe_ratio",
            "previous_close",
            "market_cap",
        ]


class PortfolioStockSerializer(serializers.ModelSerializer):
    stock = StockSerializer(read_only=True)
    current_price = serializers.SerializerMethodField()
    pe_ratio = serializers.SerializerMethodField()
    previous_close = serializers.SerializerMethodField()
    discount_percent = serializers.SerializerMethodField()
    profit_loss = serializers.SerializerMethodField()
    position_value = serializers.SerializerMethodField()

    class Meta:
        model = PortfolioStock
        fields = [
            "id",
            "stock",
            "quantity",
            "buy_price",
            "current_price",
            "pe_ratio",
            "previous_close",
            "discount_percent",
            "profit_loss",
            "position_value",
        ]

    def _market_data(self, obj):
        cache = self.context.setdefault("market_cache", {})
        symbol = obj.stock.symbol
        if symbol not in cache:
            cache[symbol] = get_stock_data(symbol, fallback_sector=obj.stock.sector)
        return cache[symbol]

    def get_current_price(self, obj):
        return self._market_data(obj).get("current_price", obj.stock.price)

    def get_pe_ratio(self, obj):
        return self._market_data(obj).get("pe_ratio", obj.stock.pe_ratio or 0)

    def get_previous_close(self, obj):
        return self._market_data(obj).get("previous_close", obj.stock.previous_close or 0)

    def get_discount_percent(self, obj):
        return self._market_data(obj).get("discount_percent", 0)

    def get_profit_loss(self, obj):
        current_price = self._market_data(obj).get("current_price", obj.stock.price)
        return round((current_price - obj.buy_price) * obj.quantity, 2)

    def get_position_value(self, obj):
        current_price = self._market_data(obj).get("current_price", obj.stock.price)
        return round(current_price * obj.quantity, 2)


class PortfolioSerializer(serializers.ModelSerializer):
    stocks = PortfolioStockSerializer(source="holdings", many=True, read_only=True)
    total_value = serializers.SerializerMethodField()

    class Meta:
        model = Portfolio
        fields = ["id", "user", "stocks", "total_value"]
        read_only_fields = ["id", "user", "stocks", "total_value"]

    def get_total_value(self, obj):
        total = 0.0
        for holding in obj.holdings.select_related("stock"):
            market = get_stock_data(holding.stock.symbol, fallback_sector=holding.stock.sector)
            total += market.get("current_price", holding.stock.price) * holding.quantity
        return round(total, 2)
