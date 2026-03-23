from datetime import timedelta
from pathlib import Path

import numpy as np
import pandas as pd
from django.conf import settings
from django.utils import timezone

from portfolio.models import Portfolio, Stock

try:
    from portfolio.models import PortfolioStock
except Exception:
    PortfolioStock = None

from .cluster import run_kmeans_clustering
from .prediction import (
    generate_prediction_graph,
    predict_stock_value,
    run_linear_regression,
    run_logistic_regression,
)


EXPECTED_COLUMNS = ["id", "name", "symbol", "price", "quantity", "sector_id", "total_value"]


def _empty_stock_frame():
    return pd.DataFrame(columns=EXPECTED_COLUMNS)


def _serialize_record(record):
    serialized = {}
    for key, value in record.items():
        if pd.isna(value):
            serialized[key] = None
        elif isinstance(value, np.integer):
            serialized[key] = int(value)
        elif isinstance(value, np.floating):
            serialized[key] = round(float(value), 2)
        else:
            serialized[key] = value
    return serialized


def _resolve_stock_name(name, company_name, symbol):
    label = str(name or "").strip()
    if not label or label.lower() == "unknown stock":
        label = str(company_name or "").strip()
    return label or str(symbol or "").strip().upper()


def fetch_portfolio_stocks(portfolio_id):
    portfolio_qs = Portfolio.objects.filter(id=portfolio_id)
    if not portfolio_qs.exists():
        print("Portfolio not found")
        return _empty_stock_frame()

    stocks_qs = Stock.objects.filter(portfolio_id=portfolio_id)
    records_by_id = {
        stock["id"]: stock
        for stock in stocks_qs.values("id", "name", "symbol", "price", "quantity", "sector_id")
    }

    if PortfolioStock is not None:
        holdings = PortfolioStock.objects.select_related("stock").filter(portfolio_id=portfolio_id)
        for holding in holdings:
            stock = getattr(holding, "stock", None)
            if stock is None:
                continue
            records_by_id[stock.id] = {
                "id": stock.id,
                "name": _resolve_stock_name(stock.name, stock.company_name, stock.symbol),
                "symbol": stock.symbol,
                "price": stock.price,
                "quantity": holding.quantity,
                "sector_id": stock.sector_id,
            }

    stock_ids = list(records_by_id.keys())
    verified_ids = set(Stock.objects.filter(id__in=stock_ids).values_list("id", flat=True))
    invalid_ids = [stock_id for stock_id in stock_ids if stock_id not in verified_ids]
    if invalid_ids:
        print(f"Invalid stock IDs skipped: {invalid_ids}")

    rows = [record for stock_id, record in records_by_id.items() if stock_id in verified_ids]
    df = pd.DataFrame(rows, columns=["id", "name", "symbol", "price", "quantity", "sector_id"])

    if df.empty:
        print("Empty stock list")
        df = _empty_stock_frame()
    else:
        df["price"] = pd.to_numeric(df["price"], errors="coerce").fillna(0.0).clip(lower=0.0)
        df["quantity"] = pd.to_numeric(df["quantity"], errors="coerce").fillna(0.0).clip(lower=0.0)
        df["total_value"] = df["price"] * df["quantity"]
        df = df[EXPECTED_COLUMNS].copy()

    csv_path = Path(settings.BASE_DIR) / f"portfolio_{portfolio_id}_stocks.csv"
    df.to_csv(csv_path, index=False)
    print(df.to_json(orient="records", indent=4))
    return df


def generate_value_matrix(df):
    working_df = df.copy() if df is not None else _empty_stock_frame()
    if working_df.empty:
        return {
            "columns": ["symbol", "price", "quantity", "total_value"],
            "rows": [],
            "totals": {"price": 0.0, "quantity": 0.0, "total_value": 0.0},
        }

    rows = []
    for record in working_df[["symbol", "price", "quantity", "total_value"]].to_dict(orient="records"):
        rows.append(_serialize_record(record))

    return {
        "columns": ["symbol", "price", "quantity", "total_value"],
        "rows": rows,
        "totals": {
            "price": round(float(working_df["price"].sum()), 2),
            "quantity": round(float(working_df["quantity"].sum()), 2),
            "total_value": round(float(working_df["total_value"].sum()), 2),
        },
    }


def build_analytical_table(df):
    working_df = df.copy() if df is not None else _empty_stock_frame()
    if working_df.empty:
        return {
            "mean_price": 0.0,
            "max_price": 0.0,
            "min_price": 0.0,
            "total_portfolio_value": 0.0,
            "average_quantity": 0.0,
        }

    return {
        "mean_price": round(float(working_df["price"].mean()), 2),
        "max_price": round(float(working_df["price"].max()), 2),
        "min_price": round(float(working_df["price"].min()), 2),
        "total_portfolio_value": round(float(working_df["total_value"].sum()), 2),
        "average_quantity": round(float(working_df["quantity"].mean()), 2),
    }


def calculate_portfolio_growth(df):
    working_df = df.copy() if df is not None else _empty_stock_frame()
    if working_df.empty:
        return []

    total_value = float(working_df["total_value"].sum())
    if total_value <= 0:
        return []

    price_mean = float(working_df["price"].mean() or 0.0)
    price_std = float(working_df["price"].std(ddof=0) or 0.0)
    variance_factor = min(price_std / price_mean, 0.15) if price_mean > 0 else 0.0
    growth_curve = np.linspace(-0.05 - variance_factor, 0.03 + variance_factor, 7)

    today = timezone.now().date()
    time_series_data = []
    for index, growth_rate in enumerate(growth_curve):
        point_date = today - timedelta(days=6 - index)
        simulated_value = total_value * (1 + growth_rate)
        time_series_data.append(
            {
                "date": point_date.isoformat(),
                "value": round(max(simulated_value, 0.0), 2),
            }
        )

    return time_series_data


def analyze_portfolio(portfolio_id):
    df = fetch_portfolio_stocks(portfolio_id)

    value_matrix = generate_value_matrix(df)
    analytical_table = build_analytical_table(df)
    portfolio_growth = calculate_portfolio_growth(df)

    clustered_df = run_kmeans_clustering(df)
    linear_model = run_linear_regression(df)
    logistic_accuracy = run_logistic_regression(df)
    prediction_graph = generate_prediction_graph(df)

    sample_prediction = None
    if linear_model is not None and not df.empty:
        first_row = df.iloc[0]
        sample_prediction = predict_stock_value(first_row["price"], first_row["quantity"])
        if sample_prediction is not None:
            sample_prediction = round(float(sample_prediction), 2)

    clusters = []
    records = []
    if clustered_df is not None and not clustered_df.empty:
        for record in clustered_df[
            ["id", "name", "symbol", "price", "quantity", "total_value", "cluster_label"]
        ].to_dict(orient="records"):
            clusters.append(_serialize_record(record))
            records.append(
                {
                    **_serialize_record(record),
                    "cluster": int(record.get("cluster_label", 0) or 0),
                }
            )

    linear_regression = None
    if linear_model is not None:
        linear_regression = {
            "coefficients": [round(float(value), 6) for value in linear_model.coef_],
            "intercept": round(float(linear_model.intercept_), 6),
        }

    legacy_predictions = []
    for item in prediction_graph:
        symbol = item["symbol"]
        source_row = df.loc[df["symbol"] == symbol].head(1)
        actual_total_value = (
            round(float(source_row.iloc[0]["total_value"]), 2) if not source_row.empty else 0.0
        )
        legacy_predictions.append(
            {
                "symbol": symbol,
                "predicted_total_value": round(float(item["predicted_value"]), 2),
                "actual_total_value": actual_total_value,
                "actual_future_total_value": actual_total_value,
            }
        )

    return {
        "portfolio_id": portfolio_id,
        "value_matrix": value_matrix,
        "analytical_table": analytical_table,
        "clusters": clusters,
        "portfolio_growth": portfolio_growth,
        "predictions": legacy_predictions,
        "prediction_graph": prediction_graph,
        "linear_regression": linear_regression,
        "logistic_regression": {"accuracy": round(float(logistic_accuracy), 4)},
        "sample_prediction": sample_prediction,
        "records": records,
    }
