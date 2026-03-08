from __future__ import annotations

import copy
import hashlib
import time
import warnings
from functools import lru_cache
from datetime import timedelta
from pathlib import Path
from typing import Dict, List, Tuple

import pandas as pd
import numpy as np
import yfinance as yf
try:
    from statsmodels.tsa.arima.model import ARIMA
except Exception:
    ARIMA = None
try:
    from sklearn.linear_model import LinearRegression
except Exception:
    LinearRegression = None


DATA_DIR = Path(__file__).resolve().parent.parent / "data"
DEFAULT_STOCKS_CSV = DATA_DIR / "stocks_by_sector.csv"
FALLBACK_SECTOR_MAP = {
    "TECHNOLOGY": ["AAPL", "MSFT", "NVDA", "ORCL", "ADBE", "CRM"],
    "HEALTHCARE": ["JNJ", "PFE", "UNH", "ABBV", "MRK"],
    "FINANCIAL_SERVICES": ["JPM", "BAC", "WFC", "GS", "MS"],
    "CONSUMER_CYCLICAL": ["AMZN", "TSLA", "HD", "NKE", "SBUX"],
    "CONSUMER_DEFENSIVE": ["PG", "KO", "PEP", "WMT", "COST"],
    "ENERGY": ["XOM", "CVX", "COP", "SLB", "EOG"],
    "INDUSTRIALS": ["GE", "CAT", "HON", "UPS", "DE"],
    "COMMUNICATION_SERVICES": ["GOOGL", "META", "NFLX", "DIS", "TMUS"],
    "UTILITIES": ["NEE", "DUK", "SO", "AEP", "EXC"],
    "REAL_ESTATE": ["PLD", "AMT", "EQIX", "CCI", "SPG"],
    "BASIC_MATERIALS": ["LIN", "APD", "ECL", "NEM", "FCX"],
}
SPECIAL_ASSETS = {
    "gold": {"symbol": "GC=F", "label": "Gold", "asset_type": "commodity"},
    "silver": {"symbol": "SI=F", "label": "Silver", "asset_type": "commodity"},
    "bitcoin": {"symbol": "BTC-USD", "label": "Bitcoin", "asset_type": "crypto"},
}
FALLBACK_ASSET_BASELINES = {
    "GC=F": {"label": "Gold", "price": 2925.0, "sector": "COMMODITY"},
    "SI=F": {"label": "Silver", "price": 32.4, "sector": "COMMODITY"},
    "BTC-USD": {"label": "Bitcoin", "price": 68250.0, "sector": "CRYPTO"},
}
CACHE_TTL_SECONDS = 300
_MARKET_CACHE: Dict[str, Tuple[float, Dict]] = {}
_FORECAST_CACHE: Dict[str, Tuple[float, Dict]] = {}


def _safe_float(value, default=0.0):
    try:
        if value is None or pd.isna(value):
            return float(default)
        return float(value)
    except (TypeError, ValueError):
        return float(default)


def _safe_int(value, default=0):
    try:
        if value is None or pd.isna(value):
            return int(default)
        return int(value)
    except (TypeError, ValueError):
        return int(default)


def _normalize_sector(value: str | None) -> str:
    if not value:
        return "UNKNOWN"
    return str(value).strip().upper().replace(" ", "_")


def _cache_get(cache_store: Dict[str, Tuple[float, Dict]], cache_key: str):
    entry = cache_store.get(cache_key)
    if not entry:
        return None
    expires_at, payload = entry
    if expires_at < time.time():
        cache_store.pop(cache_key, None)
        return None
    return copy.deepcopy(payload)


def _cache_set(cache_store: Dict[str, Tuple[float, Dict]], cache_key: str, payload: Dict):
    cache_store[cache_key] = (time.time() + CACHE_TTL_SECONDS, copy.deepcopy(payload))


def _lookup_stock_model(symbol: str):
    try:
        from portfolio.models import Stock
    except Exception:
        return None

    return Stock.objects.filter(symbol=symbol.upper()).first()


def _build_profile(symbol: str, fallback_sector: str | None = None, default_label: str | None = None) -> Dict:
    normalized_symbol = symbol.upper()
    baseline = FALLBACK_ASSET_BASELINES.get(normalized_symbol, {})
    stock = _lookup_stock_model(normalized_symbol)

    if stock is not None:
        stored_name = str(stock.name or "").strip()
        if stored_name.lower() == "unknown stock":
            stored_name = ""
        label = stock.company_name or stored_name or baseline.get("label") or default_label or normalized_symbol
        sector = _normalize_sector(
            getattr(getattr(stock, "sector", None), "name", None)
            or getattr(stock, "sector", None)
            or baseline.get("sector")
            or fallback_sector
        )
        price = _safe_float(stock.price, default=baseline.get("price", 100.0))
        previous_close = _safe_float(stock.previous_close, default=price)
        pe_ratio = _safe_float(stock.pe_ratio, default=0.0)
        market_cap = _safe_int(stock.market_cap, default=0)
    else:
        label = baseline.get("label") or default_label or normalized_symbol
        sector = _normalize_sector(baseline.get("sector") or fallback_sector)
        price = _safe_float(baseline.get("price", 100.0))
        previous_close = price
        pe_ratio = 0.0
        market_cap = 0

    return {
        "symbol": normalized_symbol,
        "label": label,
        "sector": sector,
        "price": round(price, 2),
        "previous_close": round(previous_close, 2),
        "pe_ratio": round(pe_ratio, 2),
        "market_cap": market_cap,
    }


def _make_series_dates(length: int) -> List[str]:
    end_date = pd.Timestamp.utcnow().normalize()
    start_date = end_date - pd.Timedelta(days=max(length - 1, 0))
    return [item.strftime("%Y-%m-%d") for item in pd.date_range(start=start_date, periods=length, freq="D")]


def _build_synthetic_history(symbol: str, current_price: float, periods: int) -> List[Dict]:
    safe_price = max(_safe_float(current_price, default=100.0), 1.0)
    seed = int(hashlib.sha256(symbol.upper().encode("ascii", errors="ignore")).hexdigest()[:8], 16)
    amplitude = 0.008 + ((seed % 7) * 0.0025)
    drift = (((seed // 7) % 11) - 5) / 260.0
    phase = (seed % 31) / 5.0

    dates = _make_series_dates(periods)
    values = []
    for index in range(periods):
        progress = index - (periods - 1)
        swing = np.sin((index / 2.7) + phase) * amplitude
        micro = np.cos((index / 1.8) + (phase / 2.0)) * (amplitude / 2.8)
        trend = drift * progress
        factor = max(0.65, 1.0 + swing + micro + trend)
        values.append(round(safe_price * factor, 2))

    adjustment = safe_price - values[-1]
    values = [round(max(value + adjustment, 0.01), 2) for value in values]
    return [{"date": date, "price": value} for date, value in zip(dates, values)]


def _history_to_frame(history: List[Dict]) -> pd.DataFrame:
    frame = pd.DataFrame(history)
    if frame.empty:
        return frame
    frame["date"] = pd.to_datetime(frame["date"], errors="coerce")
    frame["price"] = pd.to_numeric(frame["price"], errors="coerce")
    return frame.dropna(subset=["date", "price"]).sort_values("date").reset_index(drop=True)


def _fetch_history(symbol: str, period: str, interval: str) -> pd.DataFrame:
    ticker = yf.Ticker(symbol.upper())
    try:
        history_df = ticker.history(period=period, interval=interval)
    except Exception:
        history_df = pd.DataFrame()
    return history_df


@lru_cache(maxsize=1)
def _get_sector_map() -> Dict[str, List[str]]:
    if DEFAULT_STOCKS_CSV.exists():
        df = pd.read_csv(DEFAULT_STOCKS_CSV)
        required_cols = {"sector", "symbol"}
        if required_cols.issubset(df.columns):
            mapped: Dict[str, List[str]] = {}
            for _, row in df.iterrows():
                sector = _normalize_sector(row.get("sector"))
                symbol = str(row.get("symbol", "")).strip().upper()
                if sector and symbol:
                    mapped.setdefault(sector, [])
                    if symbol not in mapped[sector]:
                        mapped[sector].append(symbol)
            if mapped:
                return mapped
    return FALLBACK_SECTOR_MAP


def clear_sector_cache() -> None:
    _get_sector_map.cache_clear()


def build_stock_universe_csv() -> Dict[str, str | int]:
    rows = []
    for fallback_sector, symbols in FALLBACK_SECTOR_MAP.items():
        for symbol in symbols:
            ticker = yf.Ticker(symbol)
            try:
                info = ticker.info or {}
            except Exception:
                info = {}

            rows.append(
                {
                    "symbol": symbol,
                    "company_name": info.get("shortName") or info.get("longName") or symbol,
                    "sector": info.get("sector") or fallback_sector.replace("_", " "),
                    "industry": info.get("industry") or "",
                    "exchange": info.get("exchange") or "",
                    "country": info.get("country") or "",
                }
            )

    df = pd.DataFrame(rows)
    if df.empty:
        raise ValueError("No rows returned from yfinance.")

    df["symbol"] = df["symbol"].astype(str).str.upper().str.strip()
    df["sector"] = df["sector"].astype(str).str.strip()
    df = df.drop_duplicates(subset=["symbol"], keep="first")
    df = df.sort_values(["sector", "symbol"]).reset_index(drop=True)

    DEFAULT_STOCKS_CSV.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(DEFAULT_STOCKS_CSV, index=False)
    clear_sector_cache()

    return {
        "path": str(DEFAULT_STOCKS_CSV),
        "symbols_count": int(len(df)),
        "sectors_count": int(df["sector"].nunique()),
    }


def get_available_sectors() -> List[str]:
    return sorted(_get_sector_map().keys())


def get_symbols_by_sector(sector_name: str) -> List[str]:
    return _get_sector_map().get(_normalize_sector(sector_name), [])


def get_sector_symbol_pairs() -> List[Tuple[str, str]]:
    pairs: List[Tuple[str, str]] = []
    for sector, symbols in _get_sector_map().items():
        for symbol in symbols:
            pairs.append((sector, symbol))
    return pairs


def get_stock_data(symbol: str, fallback_sector: str | None = None) -> Dict:
    normalized_symbol = symbol.upper()
    cache_key = f"{normalized_symbol}|{fallback_sector or ''}"
    cached_payload = _cache_get(_MARKET_CACHE, cache_key)
    if cached_payload is not None:
        return cached_payload

    profile = _build_profile(normalized_symbol, fallback_sector=fallback_sector)
    history_df = _fetch_history(normalized_symbol, period="7d", interval="1d")

    if history_df.empty:
        history = _build_synthetic_history(normalized_symbol, profile["price"], 7)
    else:
        history = [
            {
                "date": idx.strftime("%Y-%m-%d"),
                "price": round(_safe_float(row.get("Close"), default=profile["price"]), 2),
            }
            for idx, row in history_df.tail(7).iterrows()
        ]

    if history:
        current_price = _safe_float(history[-1]["price"], default=profile["price"])
        previous_close = _safe_float(
            history[-2]["price"] if len(history) > 1 else history[-1]["price"],
            default=profile["previous_close"],
        )
    else:
        current_price = profile["price"]
        previous_close = profile["previous_close"]

    discount_percent = 0.0
    if previous_close:
        discount_percent = ((previous_close - current_price) / previous_close) * 100

    payload = {
        "symbol": normalized_symbol,
        "company_name": profile["label"],
        "sector": profile["sector"],
        "current_price": round(current_price, 2),
        "pe_ratio": round(profile["pe_ratio"], 2),
        "previous_close": round(previous_close, 2),
        "market_cap": profile["market_cap"],
        "historical_7d": history,
        "discount_percent": round(discount_percent, 2),
    }
    _cache_set(_MARKET_CACHE, cache_key, payload)
    return payload


def get_sector_stocks(sector_name: str) -> List[Dict]:
    symbols = get_symbols_by_sector(sector_name)
    normalized_sector = _normalize_sector(sector_name)
    return [get_stock_data(symbol, fallback_sector=normalized_sector) for symbol in symbols]


def _build_linear_regression_forecast(close_series: pd.Series, forecast_days: int) -> List[float]:
    history = [float(v) for v in close_series.values]
    if not history:
        return []

    window_size = min(max(len(history) // 3, 5), 12, len(history))
    volatility = float(close_series.pct_change().dropna().std() or 0.0)
    values = []

    for _ in range(forecast_days):
        window = history[-window_size:]
        x = np.arange(len(window), dtype=float).reshape(-1, 1)
        y = np.array(window, dtype=float)

        if len(window) == 1:
            baseline = window[-1]
        elif LinearRegression is not None:
            model = LinearRegression()
            model.fit(x, y)
            baseline = float(model.predict([[len(window)]])[0])
        else:
            slope, intercept = [float(v) for v in np.polyfit(x.ravel(), y, 1)]
            baseline = (slope * len(window)) + intercept

        momentum = 0.0
        if len(window) >= 3:
            recent_move = window[-1] - window[-2]
            prior_move = window[-2] - window[-3]
            momentum = 0.45 * recent_move + 0.2 * prior_move

        curve_bias = np.sin((len(values) + 1) * 0.8) * volatility * window[-1] * 1.5
        next_value = max((0.7 * baseline) + (0.3 * (window[-1] + momentum + curve_bias)), 0.0)
        history.append(next_value)
        values.append(next_value)

    return values


def _select_arima_order(series_length: int) -> tuple[int, int, int] | None:
    if series_length >= 20:
        return (2, 1, 2)
    if series_length >= 10:
        return (1, 1, 1)
    if series_length >= 5:
        return (1, 1, 0)
    return None


def _build_arima_forecast(close_series: pd.Series, forecast_days: int) -> List[float]:
    if ARIMA is None:
        return []

    order = _select_arima_order(len(close_series))
    if order is None:
        return []

    try:
        history = close_series.astype(float).copy()
        values: List[float] = []
        for _ in range(forecast_days):
            with warnings.catch_warnings():
                warnings.simplefilter("ignore")
                model = ARIMA(history, order=order)
                fitted = model.fit()
                next_value = max(_safe_float(fitted.forecast(steps=1).iloc[0]), 0.0)
            history = pd.concat([history, pd.Series([next_value])], ignore_index=True)
            values.append(next_value)
        return values
    except Exception:
        return []


def get_stock_forecast(symbol: str, lookback_days: int = 30, forecast_days: int = 7) -> Dict:
    normalized_symbol = symbol.upper()
    cache_key = f"{normalized_symbol}|{lookback_days}|{forecast_days}"
    cached_payload = _cache_get(_FORECAST_CACHE, cache_key)
    if cached_payload is not None:
        return cached_payload

    empty_payload = {
        "symbol": normalized_symbol,
        "historical": [],
        "forecast": [],
        "linear_regression_forecast": [],
        "arima_forecast": [],
    }
    profile = _build_profile(normalized_symbol)
    history_df = _fetch_history(normalized_symbol, period=f"{lookback_days}d", interval="1d")

    if history_df.empty:
        historical = _build_synthetic_history(normalized_symbol, profile["price"], lookback_days)
        close_frame = _history_to_frame(historical)
        close_series = close_frame["price"] if not close_frame.empty else pd.Series(dtype="float64")
    else:
        close_series = history_df["Close"].dropna().tail(lookback_days)
        if close_series.empty:
            historical = _build_synthetic_history(normalized_symbol, profile["price"], lookback_days)
            close_frame = _history_to_frame(historical)
            close_series = close_frame["price"] if not close_frame.empty else pd.Series(dtype="float64")
        else:
            historical = [
                {"date": idx.strftime("%Y-%m-%d"), "price": round(_safe_float(val), 2)}
                for idx, val in close_series.items()
            ]

    if close_series.empty:
        return empty_payload

    linear_values = _build_linear_regression_forecast(close_series, forecast_days)
    arima_values = _build_arima_forecast(close_series, forecast_days)
    if not arima_values:
        arima_values = linear_values[:]
    if not linear_values:
        linear_values = [historical[-1]["price"]] * forecast_days
    if not arima_values:
        arima_values = [historical[-1]["price"]] * forecast_days

    last_date = pd.to_datetime(historical[-1]["date"], errors="coerce")
    if pd.isna(last_date):
        last_date = pd.Timestamp.utcnow().normalize()
    forecast = []
    linear_regression_forecast = []
    arima_forecast = []
    for step in range(1, forecast_days + 1):
        linear_price = linear_values[step - 1]
        arima_price = arima_values[step - 1]
        blended_price = max((0.4 * linear_price) + (0.6 * arima_price), 0.0)
        future_date = (last_date + timedelta(days=step)).strftime("%Y-%m-%d")

        linear_regression_forecast.append(
            {
                "date": future_date,
                "price": round(linear_price, 2),
            }
        )
        arima_forecast.append(
            {
                "date": future_date,
                "price": round(arima_price, 2),
            }
        )
        forecast.append(
            {
                "date": future_date,
                "price": round(blended_price, 2),
            }
        )

    payload = {
        "symbol": normalized_symbol,
        "historical": historical,
        "forecast": forecast,
        "linear_regression_forecast": linear_regression_forecast,
        "arima_forecast": arima_forecast,
    }
    _cache_set(_FORECAST_CACHE, cache_key, payload)
    return payload


def _calculate_percent_change(current_value: float, base_value: float) -> float:
    current = _safe_float(current_value)
    base = _safe_float(base_value)
    if base == 0:
        return 0.0
    return round(((current - base) / base) * 100, 2)


def _calculate_historical_return(historical: List[Dict]) -> float:
    if len(historical) < 2:
        return 0.0
    return _calculate_percent_change(historical[-1]["price"], historical[0]["price"])


def _calculate_volatility(historical: List[Dict]) -> float:
    if len(historical) < 3:
        return 0.0

    prices = pd.Series([_safe_float(item["price"]) for item in historical], dtype="float64")
    returns = prices.pct_change().dropna()
    if returns.empty:
        return 0.0
    return round(float(returns.std(ddof=0) * 100), 2)


def _calculate_forecast_return(current_price: float, forecast_series: List[Dict]) -> float:
    if not forecast_series:
        return 0.0
    return _calculate_percent_change(forecast_series[-1]["price"], current_price)


def _build_asset_label(
    symbol: str,
    default_label: str | None = None,
    market_data: Dict | None = None,
) -> str:
    if default_label:
        return default_label
    market = market_data or get_stock_data(symbol)
    return market.get("company_name") or symbol.upper()


def get_asset_analysis(
    symbol: str,
    label: str | None = None,
    asset_type: str = "stock",
    lookback_days: int = 45,
    forecast_days: int = 10,
) -> Dict:
    profile = _build_profile(symbol, fallback_sector=asset_type.upper(), default_label=label)
    forecast_payload = get_stock_forecast(
        symbol=symbol,
        lookback_days=lookback_days,
        forecast_days=forecast_days,
    )
    historical = forecast_payload.get("historical", [])
    current_price = _safe_float(
        historical[-1]["price"] if historical else profile["price"],
        default=profile["price"],
    )
    previous_close = _safe_float(
        historical[-2]["price"] if len(historical) > 1 else profile["previous_close"],
        default=profile["previous_close"],
    )
    blended_forecast = forecast_payload.get("forecast", [])
    linear_forecast = forecast_payload.get("linear_regression_forecast", [])
    arima_forecast = forecast_payload.get("arima_forecast", [])

    recent_return = _calculate_historical_return(historical)
    volatility = _calculate_volatility(historical)
    daily_change = _calculate_percent_change(current_price, previous_close)
    linear_return = _calculate_forecast_return(current_price, linear_forecast)
    arima_return = _calculate_forecast_return(current_price, arima_forecast)
    blended_return = _calculate_forecast_return(current_price, blended_forecast)
    benefit_score = round(
        (0.2 * daily_change)
        + (0.2 * recent_return)
        + (0.25 * linear_return)
        + (0.35 * arima_return)
        - (0.15 * volatility),
        2,
    )

    return {
        "symbol": symbol.upper(),
        "label": profile["label"],
        "asset_type": asset_type,
        "sector": profile["sector"] or asset_type.upper(),
        "current_price": round(current_price, 2),
        "previous_close": round(previous_close, 2),
        "pe_ratio": round(profile["pe_ratio"], 2),
        "daily_change_percent": daily_change,
        "recent_return_percent": recent_return,
        "volatility_percent": volatility,
        "predicted_linear_return_percent": linear_return,
        "predicted_arima_return_percent": arima_return,
        "predicted_blended_return_percent": blended_return,
        "benefit_score": benefit_score,
        "historical": historical,
        "forecast": blended_forecast,
        "linear_regression_forecast": linear_forecast,
        "arima_forecast": arima_forecast,
    }


def get_metals_analysis() -> Dict:
    assets = [
        get_asset_analysis(
            SPECIAL_ASSETS["gold"]["symbol"],
            label=SPECIAL_ASSETS["gold"]["label"],
            asset_type=SPECIAL_ASSETS["gold"]["asset_type"],
        ),
        get_asset_analysis(
            SPECIAL_ASSETS["silver"]["symbol"],
            label=SPECIAL_ASSETS["silver"]["label"],
            asset_type=SPECIAL_ASSETS["silver"]["asset_type"],
        ),
    ]
    ranked_assets = sorted(assets, key=lambda item: item["benefit_score"], reverse=True)
    return {
        "category": "metals",
        "assets": ranked_assets,
        "most_beneficial": ranked_assets[0]["label"] if ranked_assets else None,
    }


def get_bitcoin_analysis() -> Dict:
    asset = get_asset_analysis(
        SPECIAL_ASSETS["bitcoin"]["symbol"],
        label=SPECIAL_ASSETS["bitcoin"]["label"],
        asset_type=SPECIAL_ASSETS["bitcoin"]["asset_type"],
    )
    return {
        "category": "crypto",
        "asset": asset,
    }


def get_assets_comparison(symbols: List[str] | None = None) -> Dict:
    symbols = symbols or []
    comparison_items: List[Dict] = []
    seen_symbols = set()

    for symbol in symbols:
        normalized_symbol = str(symbol).strip().upper()
        if not normalized_symbol or normalized_symbol in seen_symbols:
            continue
        seen_symbols.add(normalized_symbol)
        comparison_items.append(get_asset_analysis(normalized_symbol, asset_type="stock"))

    for asset in SPECIAL_ASSETS.values():
        normalized_symbol = asset["symbol"].upper()
        if normalized_symbol in seen_symbols:
            continue
        seen_symbols.add(normalized_symbol)
        comparison_items.append(
            get_asset_analysis(
                normalized_symbol,
                label=asset["label"],
                asset_type=asset["asset_type"],
            )
        )

    comparison_items = sorted(
        comparison_items,
        key=lambda item: (item["benefit_score"], item["predicted_arima_return_percent"]),
        reverse=True,
    )

    return {
        "items": comparison_items,
        "most_beneficial": comparison_items[0] if comparison_items else None,
    }
