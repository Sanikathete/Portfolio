from __future__ import annotations

import base64
import math
from dataclasses import dataclass
from typing import Dict, Iterable, List

import numpy as np
import pandas as pd
import yfinance as yf

try:
    from sklearn.cluster import KMeans
    from sklearn.decomposition import PCA
except Exception:
    KMeans = None
    PCA = None

from portfolio.models import Portfolio, PortfolioStock, Stock
from portfolio.services.yahoo_service import (
    _build_synthetic_history,
    _fetch_history,
    _history_to_frame,
    _safe_float,
    get_stock_data,
    get_stock_forecast,
)


HISTORY_RANGE_MAP = {
    "1H": ("1d", "5m"),
    "12H": ("1d", "15m"),
    "1D": ("1d", "30m"),
    "1W": ("7d", "1h"),
    "7D": ("7d", "1d"),
    "1M": ("1mo", "1d"),
    "3M": ("3mo", "1d"),
    "6M": ("6mo", "1d"),
    "1Y": ("1y", "1wk"),
    "3Y": ("3y", "1wk"),
}
HISTORY_TRIM_WINDOWS = {
    "1H": pd.Timedelta(hours=1),
    "12H": pd.Timedelta(hours=12),
    "1D": pd.Timedelta(days=1),
    "1W": pd.Timedelta(days=7),
}
HISTORY_FALLBACK_POINTS = {
    "1H": 12,
    "12H": 48,
    "1D": 48,
    "1W": 168,
    "7D": 7,
    "1M": 30,
    "3M": 90,
    "6M": 180,
    "1Y": 52,
    "3Y": 156,
}
GROWTH_RANGE_MAP = {
    "1W": ("7d", "1d"),
    "1M": ("1mo", "1d"),
    "3M": ("3mo", "1d"),
    "6M": ("6mo", "1d"),
    "1Y": ("1y", "1wk"),
    "3Y": ("3y", "1wk"),
}
METALS_SYMBOLS = {
    "gold": "GC=F",
    "silver": "SI=F",
}
RISK_LABELS = ["Low Risk", "Medium Risk", "High Risk"]
RISK_COLORS = {
    "Low Risk": "#22c55e",
    "Medium Risk": "#f59e0b",
    "High Risk": "#ef4444",
}


@dataclass
class HistoryBundle:
    series: List[Dict]
    current_price: float
    previous_close: float
    low_price: float
    high_price: float


def _clamp(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(maximum, value))


def _safe_int(value, default=0):
    try:
        if value is None or pd.isna(value):
            return int(default)
        return int(value)
    except (TypeError, ValueError):
        return int(default)


def _round_series(history_df: pd.DataFrame) -> List[Dict]:
    if history_df.empty:
        return []
    price_column = "Close" if "Close" in history_df.columns else history_df.columns[-1]
    has_time = False
    try:
        for stamp in history_df.index:
            timestamp = pd.Timestamp(stamp)
            if timestamp.hour or timestamp.minute or timestamp.second:
                has_time = True
                break
    except Exception:
        has_time = False
    date_format = "%Y-%m-%d %H:%M" if has_time else "%Y-%m-%d"
    output = []
    for index, row in history_df.iterrows():
        output.append(
            {
                "date": pd.Timestamp(index).strftime(date_format),
                "price": round(_safe_float(row.get(price_column), default=0.0), 2),
            }
        )
    return output


def _history_bundle(symbol: str, range_code: str) -> HistoryBundle:
    range_key = str(range_code or "3M").strip().upper()
    period, interval = HISTORY_RANGE_MAP.get(range_key, HISTORY_RANGE_MAP["3M"])
    history_df = _fetch_history(symbol, period=period, interval=interval)
    if not history_df.empty and range_key in HISTORY_TRIM_WINDOWS:
        last_stamp = history_df.index.max()
        if not pd.isna(last_stamp):
            cutoff = pd.Timestamp(last_stamp) - HISTORY_TRIM_WINDOWS[range_key]
            history_df = history_df.loc[history_df.index >= cutoff]
    history = _round_series(history_df)

    if not history:
        snapshot = get_stock_data(symbol)
        fallback_points = HISTORY_FALLBACK_POINTS.get(range_key, 30)
        history = _build_synthetic_history(
            symbol,
            snapshot.get("current_price", 100.0),
            fallback_points,
            freq=interval,
        )

    prices = [_safe_float(item["price"], 0.0) for item in history] or [0.0]
    return HistoryBundle(
        series=history,
        current_price=round(prices[-1], 2),
        previous_close=round(prices[-2] if len(prices) > 1 else prices[-1], 2),
        low_price=round(min(prices), 2),
        high_price=round(max(prices), 2),
    )


def _fetch_info(symbol: str) -> Dict:
    ticker = yf.Ticker(symbol.upper())
    try:
        info = ticker.info or {}
    except Exception:
        info = {}
    try:
        fast_info = dict(getattr(ticker, "fast_info", {}) or {})
    except Exception:
        fast_info = {}
    merged = {}
    merged.update(info)
    merged.update({key: value for key, value in fast_info.items() if value not in (None, "")})
    return merged


def _compute_intrinsic_value(current_price: float, eps: float, book_value: float) -> float:
    if eps > 0 and book_value > 0:
        return round(math.sqrt(22.5 * eps * book_value), 2)
    baseline = current_price * 1.08 if current_price > 0 else 0.0
    return round(baseline, 2)


def _compute_discount_level(current_price: float, intrinsic_value: float) -> float:
    if current_price <= 0:
        return 0.0
    return round(((intrinsic_value - current_price) / current_price) * 100, 2)


def _compute_opportunity_score(discount_level: float, recent_return: float, pe_ratio: float) -> float:
    valuation_bonus = max(discount_level, -20.0)
    momentum_bonus = recent_return * 0.6
    pe_penalty = max((pe_ratio - 25.0) * 0.35, 0.0) if pe_ratio > 0 else 0.0
    score = 50.0 + valuation_bonus + momentum_bonus - pe_penalty
    return round(_clamp(score, 0.0, 100.0), 2)


def search_yahoo_symbols(query: str, limit: int = 8) -> List[Dict]:
    clean_query = str(query or "").strip()
    if not clean_query:
        return []

    try:
        search = yf.Search(clean_query, max_results=limit, news_count=0, include_cb=False)
        quotes = getattr(search, "quotes", []) or []
    except Exception:
        quotes = []

    results = []
    seen = set()
    for item in quotes:
        symbol = str(item.get("symbol") or "").strip().upper()
        if not symbol or symbol in seen:
            continue
        seen.add(symbol)
        results.append(
            {
                "ticker": symbol,
                "name": item.get("shortname") or item.get("longname") or symbol,
                "exchange": item.get("exchange") or "",
                "type": item.get("quoteType") or "",
            }
        )
        if len(results) >= limit:
            break

    if results:
        return results

    fallback = []
    for stock in Stock.objects.filter(symbol__icontains=clean_query.upper()).order_by("symbol")[:limit]:
        fallback.append(
            {
                "ticker": stock.symbol,
                "name": stock.company_name or stock.name or stock.symbol,
                "exchange": "",
                "type": "EQUITY",
            }
        )
    return fallback


def build_stock_snapshot(symbol: str, fallback_sector: str | None = None) -> Dict:
    info = _fetch_info(symbol)
    history = _history_bundle(symbol, "3M")
    base = get_stock_data(symbol, fallback_sector=fallback_sector)

    current_price = history.current_price or _safe_float(info.get("currentPrice"), base.get("current_price", 0.0))
    previous_close = history.previous_close or _safe_float(info.get("previousClose"), base.get("previous_close", current_price))
    eps = _safe_float(info.get("trailingEps") or info.get("epsTrailingTwelveMonths"), 0.0)
    pe_ratio = _safe_float(
        info.get("trailingPE") or info.get("forwardPE"),
        base.get("pe_ratio", 0.0),
    )
    market_cap = _safe_int(info.get("marketCap"), base.get("market_cap", 0))
    min_price = _safe_float(
        info.get("fiftyTwoWeekLow") or info.get("dayLow"),
        history.low_price,
    )
    max_price = _safe_float(
        info.get("fiftyTwoWeekHigh") or info.get("dayHigh"),
        history.high_price,
    )
    book_value = _safe_float(info.get("bookValue"), 0.0)
    intrinsic_value = _compute_intrinsic_value(current_price, eps, book_value)
    recent_return = 0.0
    if history.series and _safe_float(history.series[0]["price"], 0.0) > 0:
        recent_return = (
            (current_price - _safe_float(history.series[0]["price"], 0.0))
            / _safe_float(history.series[0]["price"], 1.0)
        ) * 100
    discount_level = _compute_discount_level(current_price, intrinsic_value)
    opportunity_score = _compute_opportunity_score(discount_level, recent_return, pe_ratio)

    return {
        "ticker": symbol.upper(),
        "company_name": info.get("shortName") or info.get("longName") or base.get("company_name") or symbol.upper(),
        "sector": info.get("sector") or fallback_sector or base.get("sector") or "Unknown",
        "current_price": round(current_price, 2),
        "previous_close": round(previous_close, 2),
        "pe_ratio": round(pe_ratio, 2),
        "eps": round(eps, 2),
        "market_cap": market_cap,
        "min_price": round(min_price or history.low_price, 2),
        "max_price": round(max_price or history.high_price, 2),
        "intrinsic_value": round(intrinsic_value, 2),
        "discount_level": round(discount_level, 2),
        "opportunity_score": round(opportunity_score, 2),
    }


def refresh_stock_record(stock: Stock) -> Stock:
    snapshot = build_stock_snapshot(stock.symbol, fallback_sector=getattr(getattr(stock, "sector", None), "name", None))
    stock.name = snapshot["company_name"]
    stock.company_name = snapshot["company_name"]
    stock.price = snapshot["current_price"]
    stock.pe_ratio = snapshot["pe_ratio"]
    stock.eps = snapshot["eps"]
    stock.previous_close = snapshot["previous_close"]
    stock.market_cap = snapshot["market_cap"]
    stock.min_price = snapshot["min_price"]
    stock.max_price = snapshot["max_price"]
    stock.intrinsic_value = snapshot["intrinsic_value"]
    stock.discount_level = snapshot["discount_level"]
    stock.opportunity_score = snapshot["opportunity_score"]
    stock.save(
        update_fields=[
            "name",
            "company_name",
            "price",
            "pe_ratio",
            "eps",
            "previous_close",
            "market_cap",
            "min_price",
            "max_price",
            "intrinsic_value",
            "discount_level",
            "opportunity_score",
        ]
    )
    return stock


def refresh_portfolio(portfolio: Portfolio) -> Portfolio:
    for holding in portfolio.holdings.select_related("stock", "stock__sector"):
        refresh_stock_record(holding.stock)
    return portfolio


def serialize_holding(holding: PortfolioStock) -> Dict:
    stock = holding.stock
    current_price = _safe_float(stock.price, 0.0)
    profit_loss = round((current_price - _safe_float(holding.buy_price, current_price)) * holding.quantity, 2)
    position_value = round(current_price * holding.quantity, 2)
    return {
        "id": holding.id,
        "ticker": stock.symbol,
        "name": stock.company_name or stock.name or stock.symbol,
        "quantity": holding.quantity,
        "buy_price": round(_safe_float(holding.buy_price, 0.0), 2),
        "current_price": round(current_price, 2),
        "min_price": round(_safe_float(stock.min_price, current_price), 2),
        "max_price": round(_safe_float(stock.max_price, current_price), 2),
        "pe_ratio": round(_safe_float(stock.pe_ratio, 0.0), 2),
        "eps": round(_safe_float(stock.eps, 0.0), 2),
        "market_cap": _safe_int(stock.market_cap, 0),
        "intrinsic_value": round(_safe_float(stock.intrinsic_value, current_price), 2),
        "discount_level": round(_safe_float(stock.discount_level, 0.0), 2),
        "opportunity_score": round(_safe_float(stock.opportunity_score, 0.0), 2),
        "profit_loss": profit_loss,
        "position_value": position_value,
        "stock_id": stock.id,
    }


def portfolio_summary(portfolio: Portfolio) -> Dict:
    holdings = [serialize_holding(holding) for holding in portfolio.holdings.select_related("stock")]
    discounts = [item["discount_level"] for item in holdings]
    opportunity_scores = [item["opportunity_score"] for item in holdings]
    undervalued = [item for item in holdings if item["discount_level"] > 0]
    top_pick = max(holdings, key=lambda item: item["opportunity_score"], default=None)
    return {
        "holdings_count": len(holdings),
        "average_discount": round(float(np.mean(discounts)) if discounts else 0.0, 2),
        "undervalued_count": len(undervalued),
        "average_opportunity_score": round(float(np.mean(opportunity_scores)) if opportunity_scores else 0.0, 2),
        "top_pick": top_pick,
    }


def portfolio_detail_payload(portfolio: Portfolio) -> Dict:
    refresh_portfolio(portfolio)
    holdings = [serialize_holding(holding) for holding in portfolio.holdings.select_related("stock")]
    return {
        "id": portfolio.id,
        "name": portfolio.name,
        "sector": portfolio.sector_name or getattr(getattr(portfolio, "sector", None), "name", ""),
        "owner": portfolio.user.username,
        "stocks": holdings,
        "summary": portfolio_summary(portfolio),
    }


def stock_detail_payload(stock: Stock, range_code: str = "3M") -> Dict:
    refresh_stock_record(stock)
    history = _history_bundle(stock.symbol, range_code)
    return {
        "id": stock.id,
        "ticker": stock.symbol,
        "name": stock.company_name or stock.name or stock.symbol,
        "range": range_code.upper(),
        "history": history.series,
        "fundamentals": {
            "pe_ratio": round(_safe_float(stock.pe_ratio, 0.0), 2),
            "eps": round(_safe_float(stock.eps, 0.0), 2),
            "market_cap": _safe_int(stock.market_cap, 0),
            "intrinsic_value": round(_safe_float(stock.intrinsic_value, stock.price), 2),
        },
        "snapshot": {
            "current_price": round(_safe_float(stock.price, 0.0), 2),
            "min_price": round(_safe_float(stock.min_price, stock.price), 2),
            "max_price": round(_safe_float(stock.max_price, stock.price), 2),
            "discount_level": round(_safe_float(stock.discount_level, 0.0), 2),
            "opportunity_score": round(_safe_float(stock.opportunity_score, 0.0), 2),
        },
    }


def top_discount_payload(portfolio: Portfolio, limit: int = 5) -> Dict:
    refresh_portfolio(portfolio)
    holdings = [serialize_holding(holding) for holding in portfolio.holdings.select_related("stock")]
    ranked = sorted(holdings, key=lambda item: item["discount_level"], reverse=True)
    return {
        "portfolio_id": portfolio.id,
        "items": ranked[:limit],
        "summary": portfolio_summary(portfolio),
    }


def _growth_return(symbol: str, range_code: str) -> float:
    period, interval = GROWTH_RANGE_MAP.get(range_code.upper(), GROWTH_RANGE_MAP["1M"])
    history_df = _fetch_history(symbol, period=period, interval=interval)
    history = _round_series(history_df)
    if len(history) < 2:
        return 0.0
    start = _safe_float(history[0]["price"], 0.0)
    end = _safe_float(history[-1]["price"], 0.0)
    if start <= 0:
        return 0.0
    return round(((end - start) / start) * 100, 2)


def top_growth_payload(portfolio: Portfolio, range_code: str = "1M", limit: int = 5) -> Dict:
    refresh_portfolio(portfolio)
    items = []
    for holding in portfolio.holdings.select_related("stock"):
        items.append(
            {
                **serialize_holding(holding),
                "growth_return": _growth_return(holding.stock.symbol, range_code),
            }
        )
    ranked = sorted(items, key=lambda item: item["growth_return"], reverse=True)
    return {
        "portfolio_id": portfolio.id,
        "range": range_code.upper(),
        "items": ranked[:limit],
    }


def _daily_returns(history_frame: pd.DataFrame) -> pd.Series:
    if history_frame.empty:
        return pd.Series(dtype="float64")
    return history_frame["price"].pct_change().dropna()


def _max_drawdown(prices: pd.Series) -> float:
    if prices.empty:
        return 0.0
    rolling_peak = prices.cummax()
    drawdown = (prices / rolling_peak) - 1.0
    return round(abs(float(drawdown.min() or 0.0)), 4)


def _cagr(prices: pd.Series, periods_per_year: float = 252.0) -> float:
    if len(prices) < 2 or prices.iloc[0] <= 0:
        return 0.0
    years = max(len(prices) / periods_per_year, 1 / periods_per_year)
    return round(float((prices.iloc[-1] / prices.iloc[0]) ** (1 / years) - 1), 4)


def _risk_feature_table(portfolio: Portfolio) -> pd.DataFrame:
    rows = []
    for holding in portfolio.holdings.select_related("stock"):
        history_df = _history_to_frame(_history_bundle(holding.stock.symbol, "3Y").series)
        if history_df.empty:
            continue
        returns = _daily_returns(history_df)
        volatility = float(returns.std(ddof=0) * math.sqrt(252)) if not returns.empty else 0.0
        annual_return = float(returns.mean() * 252) if not returns.empty else 0.0
        sharpe = 0.0
        if volatility > 0:
            sharpe = (annual_return - 0.06) / volatility
        prices = history_df["price"].astype(float)
        max_drawdown = _max_drawdown(prices)
        cagr_value = _cagr(prices)
        rows.append(
            {
                "stock_id": holding.stock.id,
                "ticker": holding.stock.symbol,
                "name": holding.stock.company_name or holding.stock.name or holding.stock.symbol,
                "volatility": round(volatility, 4),
                "sharpe_ratio": round(sharpe, 4),
                "max_drawdown": round(max_drawdown, 4),
                "cagr": round(cagr_value, 4),
            }
        )
    return pd.DataFrame(rows)


def _cluster_labels_from_centers(features: pd.DataFrame, labels: np.ndarray) -> Dict[int, str]:
    grouped = []
    for cluster_id in sorted(set(int(item) for item in labels)):
        cluster_frame = features.loc[labels == cluster_id]
        risk_rank = (
            cluster_frame["volatility"].mean()
            + (cluster_frame["max_drawdown"].mean() * 2.0)
            - cluster_frame["sharpe_ratio"].mean()
            - cluster_frame["cagr"].mean()
        )
        grouped.append((cluster_id, risk_rank))
    grouped.sort(key=lambda item: item[1])
    return {
        grouped[0][0]: "Low Risk",
        grouped[1][0]: "Medium Risk" if len(grouped) > 1 else "Medium Risk",
        grouped[-1][0]: "High Risk",
    }


def _svg_scatter(points: List[Dict], title: str) -> str:
    width = 680
    height = 420
    padding = 44
    if not points:
        svg = f"<svg xmlns='http://www.w3.org/2000/svg' width='{width}' height='{height}'><rect width='100%' height='100%' fill='#07111f'/><text x='50%' y='50%' text-anchor='middle' fill='#dbeafe' font-size='18'>{title}</text></svg>"
        return base64.b64encode(svg.encode("utf-8")).decode("ascii")

    xs = [point["x"] for point in points]
    ys = [point["y"] for point in points]
    x_min, x_max = min(xs), max(xs)
    y_min, y_max = min(ys), max(ys)
    x_span = (x_max - x_min) or 1.0
    y_span = (y_max - y_min) or 1.0
    circles = []
    labels = []
    for point in points:
        x_pos = padding + ((point["x"] - x_min) / x_span) * (width - (padding * 2))
        y_pos = height - padding - ((point["y"] - y_min) / y_span) * (height - (padding * 2))
        color = RISK_COLORS.get(point["label"], "#38bdf8")
        circles.append(f"<circle cx='{x_pos:.2f}' cy='{y_pos:.2f}' r='7' fill='{color}' fill-opacity='0.85' />")
        labels.append(f"<text x='{x_pos + 10:.2f}' y='{y_pos - 10:.2f}' fill='#e2e8f0' font-size='12'>{point['ticker']}</text>")
    svg = (
        f"<svg xmlns='http://www.w3.org/2000/svg' width='{width}' height='{height}'>"
        f"<rect width='100%' height='100%' fill='#07111f' rx='18' />"
        f"<text x='24' y='28' fill='#dbeafe' font-size='18'>{title}</text>"
        f"<line x1='{padding}' y1='{height - padding}' x2='{width - padding}' y2='{height - padding}' stroke='#475569' />"
        f"<line x1='{padding}' y1='{padding}' x2='{padding}' y2='{height - padding}' stroke='#475569' />"
        + "".join(circles)
        + "".join(labels)
        + "</svg>"
    )
    return base64.b64encode(svg.encode("utf-8")).decode("ascii")


def risk_clusters_payload(portfolio: Portfolio) -> Dict:
    refresh_portfolio(portfolio)
    feature_df = _risk_feature_table(portfolio)
    if feature_df.empty:
        return {
            "portfolio_id": portfolio.id,
            "clusters": [],
            "pca_plot_base64": _svg_scatter([], "Portfolio Risk Clusters"),
        }

    features = feature_df[["volatility", "sharpe_ratio", "max_drawdown", "cagr"]].copy()
    labels = np.zeros(len(feature_df), dtype=int)
    if KMeans is not None and len(feature_df.index) >= 3:
        model = KMeans(n_clusters=3, random_state=42, n_init=10)
        labels = model.fit_predict(features)
    elif len(feature_df.index) == 2:
        labels = np.array([0, 2])

    label_map = _cluster_labels_from_centers(features, labels)
    feature_df["cluster"] = [label_map.get(int(item), "Medium Risk") for item in labels]

    if PCA is not None and len(feature_df.index) >= 2:
        transformed = PCA(n_components=2).fit_transform(features)
    else:
        transformed = np.column_stack(
            [
                features["volatility"].to_numpy(dtype=float),
                features["cagr"].to_numpy(dtype=float),
            ]
        )

    scatter_points = []
    for index, row in feature_df.iterrows():
        scatter_points.append(
            {
                "ticker": row["ticker"],
                "label": row["cluster"],
                "x": float(transformed[index][0]),
                "y": float(transformed[index][1]),
            }
        )

    return {
        "portfolio_id": portfolio.id,
        "clusters": feature_df.to_dict(orient="records"),
        "pca_plot_base64": _svg_scatter(scatter_points, "Portfolio Risk Clusters"),
    }


def _normalized_returns(history: List[Dict]) -> List[float]:
    if len(history) < 2:
        return []
    prices = pd.Series([_safe_float(item["price"], 0.0) for item in history], dtype="float64")
    returns = prices.pct_change().dropna()
    return [float(item) for item in returns]


def _linear_forecast_values(history: List[Dict], horizon: int) -> List[float]:
    series = pd.Series([_safe_float(item["price"], 0.0) for item in history], dtype="float64")
    if series.empty:
        return []
    payload = get_stock_forecast("BTC-USD", lookback_days=len(series), forecast_days=horizon)
    return [_safe_float(item["price"], 0.0) for item in payload.get("linear_regression_forecast", [])]


def _arima_forecast_values(history: List[Dict], horizon: int) -> List[float]:
    series = pd.Series([_safe_float(item["price"], 0.0) for item in history], dtype="float64")
    if series.empty:
        return []
    payload = get_stock_forecast("BTC-USD", lookback_days=len(series), forecast_days=horizon)
    return [_safe_float(item["price"], 0.0) for item in payload.get("arima_forecast", [])]


def _rnn_forecast_values(history: List[Dict], horizon: int) -> List[float]:
    prices = [_safe_float(item["price"], 0.0) for item in history]
    if len(prices) < 6:
        return prices[-1:] * horizon

    returns = _normalized_returns(history)
    if not returns:
        return prices[-1:] * horizon

    hidden = 0.0
    recurrent_weight = 0.62
    input_weight = 0.38
    bias = float(np.mean(returns[-10:]) if returns else 0.0)
    state_series = []
    for value in returns[-40:]:
        hidden = math.tanh((hidden * recurrent_weight) + (value * input_weight) + bias)
        state_series.append(hidden)

    recent_prices = prices[:]
    forecasts = []
    for step in range(horizon):
        recent_return = returns[-1] if returns else 0.0
        hidden = math.tanh((hidden * recurrent_weight) + (recent_return * input_weight) + bias)
        projected_return = (hidden * 0.018) + bias
        projected_return += math.sin((step + 1) / 3.0) * (float(np.std(returns[-20:]) or 0.0) * 0.25)
        next_price = max(recent_prices[-1] * (1 + projected_return), 0.0)
        forecasts.append(next_price)
        recent_prices.append(next_price)
        returns.append(projected_return)
    return forecasts


def _interval_to_timedelta(interval: str) -> pd.Timedelta:
    clean = str(interval or "1d").strip().lower()
    if clean.endswith("wk"):
        count = int(clean[:-2] or 1)
        return pd.Timedelta(weeks=count)
    if clean.endswith("d"):
        count = int(clean[:-1] or 1)
        return pd.Timedelta(days=count)
    if clean.endswith("h"):
        count = int(clean[:-1] or 1)
        return pd.Timedelta(hours=count)
    if clean.endswith("m"):
        count = int(clean[:-1] or 1)
        return pd.Timedelta(minutes=count)
    return pd.Timedelta(days=1)


def _format_date_for_interval(timestamp: pd.Timestamp, interval: str) -> str:
    clean = str(interval or "1d").strip().lower()
    if clean.endswith("h") or clean.endswith("m"):
        return timestamp.strftime("%Y-%m-%d %H:%M")
    return timestamp.strftime("%Y-%m-%d")


def _with_future_dates(historical: List[Dict], values: Iterable[float], interval: str = "1d") -> List[Dict]:
    if historical:
        last_date = pd.to_datetime(historical[-1]["date"], errors="coerce")
    else:
        last_date = pd.Timestamp.utcnow().normalize()
    if pd.isna(last_date):
        last_date = pd.Timestamp.utcnow().normalize()
    step = _interval_to_timedelta(interval)
    output = []
    for index, value in enumerate(values, start=1):
        output.append(
            {
                "date": _format_date_for_interval(last_date + (step * index), interval),
                "price": round(_safe_float(value, 0.0), 2),
            }
        )
    return output


def btc_forecast_payload(model_name: str = "linear", horizon: int = 30, range_code: str = "6M") -> Dict:
    clean_model = str(model_name or "linear").strip().lower()
    clean_model = clean_model if clean_model in {"linear", "arima", "rnn"} else "linear"
    clean_horizon = int(_clamp(int(horizon or 30), 7, 120))
    clean_range = str(range_code or "6M").strip().upper()
    clean_range = clean_range if clean_range in HISTORY_RANGE_MAP else "6M"
    _, interval = HISTORY_RANGE_MAP.get(clean_range, HISTORY_RANGE_MAP["6M"])
    history = _history_bundle("BTC-USD", clean_range).series
    if not history:
        history = _build_synthetic_history("BTC-USD", 68250.0, 180, freq=interval)

    if clean_model == "arima":
        forecast_values = _arima_forecast_values(history, clean_horizon)
    elif clean_model == "rnn":
        forecast_values = _rnn_forecast_values(history, clean_horizon)
    else:
        forecast_values = _linear_forecast_values(history, clean_horizon)

    if not forecast_values:
        forecast_values = [history[-1]["price"]] * clean_horizon

    forecast = _with_future_dates(history, forecast_values, interval=interval)
    current_price = _safe_float(history[-1]["price"], 0.0)
    projected_price = _safe_float(forecast[-1]["price"], current_price)
    projected_change = 0.0 if current_price <= 0 else ((projected_price - current_price) / current_price) * 100
    return {
        "symbol": "BTC-USD",
        "model": clean_model,
        "horizon": clean_horizon,
        "range": clean_range,
        "available_models": ["linear", "arima", "rnn"],
        "historical": history,
        "forecast": forecast,
        "summary": {
            "current_price": round(current_price, 2),
            "projected_price": round(projected_price, 2),
            "projected_change_percent": round(projected_change, 2),
        },
    }


def _normalized_asset_series(symbol: str, range_code: str) -> List[Dict]:
    history = _history_bundle(symbol, range_code).series
    if not history:
        return []
    base = _safe_float(history[0]["price"], 1.0)
    if base <= 0:
        base = 1.0
    return [
        {
            "date": item["date"],
            "price": round(_safe_float(item["price"], 0.0), 2),
            "return_percent": round(((_safe_float(item["price"], 0.0) - base) / base) * 100, 2),
        }
        for item in history
    ]


def _regression_svg(points: List[Dict], title: str) -> str:
    width = 680
    height = 420
    padding = 44
    if not points:
        svg = f"<svg xmlns='http://www.w3.org/2000/svg' width='{width}' height='{height}'><rect width='100%' height='100%' fill='#07111f'/><text x='50%' y='50%' text-anchor='middle' fill='#dbeafe' font-size='18'>{title}</text></svg>"
        return base64.b64encode(svg.encode("utf-8")).decode("ascii")

    xs = np.array([point["x"] for point in points], dtype=float)
    ys = np.array([point["y"] for point in points], dtype=float)
    slope, intercept = np.polyfit(xs, ys, 1) if len(points) >= 2 else (0.0, 0.0)
    x_min, x_max = float(xs.min()), float(xs.max())
    y_min, y_max = float(ys.min()), float(ys.max())
    x_span = (x_max - x_min) or 1.0
    y_span = (y_max - y_min) or 1.0

    def scale_x(value: float) -> float:
        return padding + ((value - x_min) / x_span) * (width - (padding * 2))

    def scale_y(value: float) -> float:
        return height - padding - ((value - y_min) / y_span) * (height - (padding * 2))

    circles = []
    for point in points:
        circles.append(
            f"<circle cx='{scale_x(point['x']):.2f}' cy='{scale_y(point['y']):.2f}' r='5' fill='#38bdf8' fill-opacity='0.75' />"
        )
    line_y1 = slope * x_min + intercept
    line_y2 = slope * x_max + intercept
    svg = (
        f"<svg xmlns='http://www.w3.org/2000/svg' width='{width}' height='{height}'>"
        f"<rect width='100%' height='100%' fill='#07111f' rx='18' />"
        f"<text x='24' y='28' fill='#dbeafe' font-size='18'>{title}</text>"
        f"<line x1='{padding}' y1='{height - padding}' x2='{width - padding}' y2='{height - padding}' stroke='#475569' />"
        f"<line x1='{padding}' y1='{padding}' x2='{padding}' y2='{height - padding}' stroke='#475569' />"
        + "".join(circles)
        + f"<line x1='{scale_x(x_min):.2f}' y1='{scale_y(line_y1):.2f}' x2='{scale_x(x_max):.2f}' y2='{scale_y(line_y2):.2f}' stroke='#f59e0b' stroke-width='2' />"
        + "</svg>"
    )
    return base64.b64encode(svg.encode("utf-8")).decode("ascii")


def metals_history_payload(range_code: str = "3Y") -> Dict:
    clean_range = str(range_code or "3Y").strip().upper()
    clean_range = clean_range if clean_range in HISTORY_RANGE_MAP else "3Y"
    gold_series = _normalized_asset_series(METALS_SYMBOLS["gold"], clean_range)
    silver_series = _normalized_asset_series(METALS_SYMBOLS["silver"], clean_range)
    max_length = min(len(gold_series), len(silver_series))
    gold_series = gold_series[-max_length:]
    silver_series = silver_series[-max_length:]
    comparison = []
    regression_points = []
    for gold_point, silver_point in zip(gold_series, silver_series):
        gap = round(silver_point["return_percent"] - gold_point["return_percent"], 2)
        comparison.append(
            {
                "date": gold_point["date"],
                "gold_price": gold_point["price"],
                "silver_price": silver_point["price"],
                "gold_return_percent": gold_point["return_percent"],
                "silver_return_percent": silver_point["return_percent"],
                "return_gap": gap,
            }
        )
        regression_points.append({"x": gold_point["return_percent"], "y": silver_point["return_percent"]})

    correlation = 0.0
    if regression_points:
        correlation = float(np.corrcoef(
            [point["x"] for point in regression_points],
            [point["y"] for point in regression_points],
        )[0][1])

    gold_3m = _normalized_asset_series(METALS_SYMBOLS["gold"], "3M")
    silver_3m = _normalized_asset_series(METALS_SYMBOLS["silver"], "3M")
    insights = {
        "gold_3m_return_percent": gold_3m[-1]["return_percent"] if gold_3m else 0.0,
        "silver_3m_return_percent": silver_3m[-1]["return_percent"] if silver_3m else 0.0,
        "correlation": round(correlation, 4) if not math.isnan(correlation) else 0.0,
        "leading_metal": (
            "Silver"
            if (silver_3m[-1]["return_percent"] if silver_3m else 0.0) > (gold_3m[-1]["return_percent"] if gold_3m else 0.0)
            else "Gold"
        ),
    }
    return {
        "range": clean_range,
        "gold": gold_series,
        "silver": silver_series,
        "comparison": comparison,
        "insights": insights,
        "regression_plot_base64": _regression_svg(regression_points, "Gold vs Silver Returns"),
    }
