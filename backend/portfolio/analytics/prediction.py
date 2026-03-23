import pandas as pd

try:
    from sklearn.linear_model import LinearRegression, LogisticRegression
    from sklearn.metrics import accuracy_score
except Exception:
    LinearRegression = None
    LogisticRegression = None
    accuracy_score = None


_LINEAR_MODEL = None


def _prepare_numeric_dataframe(df, required_columns):
    working_df = df.copy() if df is not None else pd.DataFrame()
    if working_df.empty:
        return working_df

    for column in required_columns:
        working_df[column] = pd.to_numeric(working_df.get(column), errors="coerce")

    return working_df.dropna(subset=required_columns)


def run_linear_regression(df):
    global _LINEAR_MODEL

    clean_df = _prepare_numeric_dataframe(df, ["price", "quantity", "total_value"])
    if LinearRegression is None or clean_df.empty:
        _LINEAR_MODEL = None
        return None

    model = LinearRegression()
    model.fit(clean_df[["price", "quantity"]], clean_df["total_value"])
    _LINEAR_MODEL = model

    print(f"coefficients: {model.coef_.tolist()}")
    print(f"intercept: {float(model.intercept_)}")
    return model


def run_logistic_regression(df):
    clean_df = _prepare_numeric_dataframe(df, ["price", "quantity"])
    if LogisticRegression is None or accuracy_score is None or clean_df.empty:
        return 0.0

    clean_df = clean_df.copy()
    mean_price = float(clean_df["price"].mean())
    clean_df["price_label"] = (clean_df["price"] > mean_price).astype(int)

    if clean_df["price_label"].nunique() < 2:
        return 0.0

    model = LogisticRegression(max_iter=1000)
    features = clean_df[["price", "quantity"]]
    target = clean_df["price_label"]
    model.fit(features, target)
    predicted = model.predict(features)
    return float(accuracy_score(target, predicted))


def predict_stock_value(price, quantity):
    if _LINEAR_MODEL is None:
        print("Linear regression model is not trained.")
        return None

    try:
        feature_frame = pd.DataFrame(
            [{"price": float(price), "quantity": float(quantity)}],
            columns=["price", "quantity"],
        )
    except (TypeError, ValueError):
        return None

    predicted_total_value = float(_LINEAR_MODEL.predict(feature_frame)[0])
    return predicted_total_value


def generate_prediction_graph(df):
    clean_df = _prepare_numeric_dataframe(df, ["price", "quantity", "total_value"])
    if clean_df.empty:
        return []

    model = _LINEAR_MODEL or run_linear_regression(clean_df)
    if model is None:
        return []

    predicted_values = model.predict(clean_df[["price", "quantity"]])
    graph = []
    for symbol, predicted_value in zip(clean_df["symbol"], predicted_values):
        graph.append(
            {
                "symbol": symbol,
                "predicted_value": round(float(predicted_value), 2),
            }
        )
    return graph
