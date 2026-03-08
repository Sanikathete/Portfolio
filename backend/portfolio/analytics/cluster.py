import pandas as pd

try:
    from sklearn.cluster import KMeans
except Exception:
    KMeans = None


def run_kmeans_clustering(df):
    working_df = df.copy() if df is not None else pd.DataFrame()
    if working_df.empty:
        working_df["cluster_label"] = pd.Series(dtype="int64")
        return working_df

    for column in ["price", "quantity", "total_value"]:
        working_df[column] = pd.to_numeric(working_df.get(column), errors="coerce").fillna(0.0)

    sample_count = len(working_df.index)
    if KMeans is None or sample_count < 3:
        working_df["cluster_label"] = 0
        return working_df

    model = KMeans(n_clusters=3, random_state=42, n_init=10)
    working_df["cluster_label"] = model.fit_predict(
        working_df[["price", "quantity", "total_value"]]
    )
    return working_df
