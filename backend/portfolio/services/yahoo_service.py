from __future__ import annotations

from typing import Dict, List

import pandas as pd
import yfinance as yf


SECTOR_MAP = {
    "IT": ["AAPL", "MSFT", "NVDA", "ORCL"],
    "ECOMMERCE": ["AMZN", "BABA", "SHOP"],
    "HEALTHCARE": ["JNJ", "PFE", "UNH"],
}


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


def get_available_sectors() -> List[str]:
    return list(SECTOR_MAP.keys())


def get_symbols_by_sector(sector_name: str) -> List[str]:
    return SECTOR_MAP.get(sector_name.upper(), [])


def get_stock_data(symbol: str, fallback_sector: str | None = None) -> Dict:
    ticker = yf.Ticker(symbol.upper())
    try:
        info = ticker.info or {}
    except Exception:
        info = {}

    current_price = _safe_float(
        info.get("currentPrice") or info.get("regularMarketPrice") or info.get("previousClose")
    )
    previous_close = _safe_float(info.get("previousClose"), default=current_price)
    pe_ratio = _safe_float(info.get("trailingPE"), default=0.0)
    market_cap = _safe_int(info.get("marketCap"), default=0)
    company_name = info.get("shortName") or info.get("longName") or symbol.upper()
    sector = info.get("sector") or fallback_sector or "UNKNOWN"

    try:
        history_df = ticker.history(period="7d", interval="1d")
    except Exception:
        history_df = pd.DataFrame()
    history = []
    if not history_df.empty:
        for idx, row in history_df.tail(7).iterrows():
            history.append(
                {
                    "date": idx.strftime("%Y-%m-%d"),
                    "price": round(_safe_float(row.get("Close"), default=current_price), 2),
                }
            )

    discount_percent = 0.0
    if previous_close:
        discount_percent = ((previous_close - current_price) / previous_close) * 100

    return {
        "symbol": symbol.upper(),
        "company_name": company_name,
        "sector": sector,
        "current_price": round(current_price, 2),
        "pe_ratio": round(pe_ratio, 2),
        "previous_close": round(previous_close, 2),
        "market_cap": market_cap,
        "historical_7d": history,
        "discount_percent": round(discount_percent, 2),
    }


def get_sector_stocks(sector_name: str) -> List[Dict]:
    symbols = get_symbols_by_sector(sector_name)
    return [get_stock_data(symbol, fallback_sector=sector_name.upper()) for symbol in symbols]
