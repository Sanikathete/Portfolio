import pandas as pd
import yfinance as yf

from portfolio.models import Country, Sector, Stock


MARKET_UNIVERSE = {
    "India": {
        "code": "IN",
        "symbols": ["TCS.NS", "INFY.NS", "HDFCBANK.NS", "RELIANCE.NS", "SBIN.NS"],
    },
    "USA": {
        "code": "US",
        "symbols": ["AAPL", "MSFT", "NVDA", "JPM", "XOM"],
    },
    "Japan": {
        "code": "JP",
        "symbols": ["7203.T", "6758.T", "9984.T", "9432.T", "8306.T"],
    },
}


def _safe_float(value, default=0.0):
    try:
        if value is None or pd.isna(value):
            return float(default)
        return float(value)
    except (TypeError, ValueError):
        return float(default)


def load_market_stocks():
    loaded = 0

    for country_name, config in MARKET_UNIVERSE.items():
        country, _ = Country.objects.get_or_create(
            name=country_name, defaults={"code": config["code"]}
        )
        if country.code != config["code"]:
            country.code = config["code"]
            country.save(update_fields=["code"])

        for symbol in config["symbols"]:
            ticker = yf.Ticker(symbol)
            try:
                info = ticker.info or {}
            except Exception:
                info = {}

            stock_name = info.get("shortName") or info.get("longName") or symbol
            sector_name = info.get("sector") or "Other"
            current_price = _safe_float(
                info.get("currentPrice")
                or info.get("regularMarketPrice")
                or info.get("previousClose"),
                default=0.0,
            )
            previous_close = _safe_float(info.get("previousClose"), default=current_price)
            pe_ratio = _safe_float(info.get("trailingPE"), default=0.0)
            market_cap = int(info.get("marketCap") or 0)

            sector, _ = Sector.objects.get_or_create(name=sector_name, country=country)
            Stock.objects.update_or_create(
                symbol=symbol.upper(),
                defaults={
                    "name": stock_name,
                    "company_name": stock_name,
                    "country": country,
                    "sector": sector,
                    "price": current_price,
                    "quantity": 0,
                    "previous_close": previous_close,
                    "pe_ratio": pe_ratio,
                    "market_cap": market_cap,
                    "portfolio": None,
                },
            )
            loaded += 1

    return {"loaded": loaded}


if __name__ == "__main__":
    result = load_market_stocks()
    print(result)
