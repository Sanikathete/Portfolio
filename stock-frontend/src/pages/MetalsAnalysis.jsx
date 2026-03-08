import { useEffect, useState } from "react";
import AppShell from "../components/AppShell";
import AssetForecastCard from "../components/AssetForecastCard";
import MetricCard from "../components/MetricCard";
import api from "../api/axios";

function MetalsAnalysis() {
  const [payload, setPayload] = useState(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setError("");
      setIsLoading(true);
      try {
        const response = await api.get("/analysis/metals/");
        setPayload(response.data);
      } catch (err) {
        setError(err?.response?.data?.detail || "Failed to load metals analysis.");
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  return (
    <AppShell
      title="Gold and Silver Analysis"
      subtitle="Track precious metals with historical performance plus ARIMA and linear-regression forecasts."
      error={error}
    >
      <section className="analytics-strip">
        <MetricCard eyebrow="Most Beneficial Metal" value={payload?.most_beneficial || "-"} tone="amber" />
        <MetricCard
          eyebrow="Gold Trend"
          value={`${Number(payload?.assets?.[0]?.predicted_arima_return_percent || 0).toFixed(2)}%`}
          tone="blue"
        />
        <MetricCard
          eyebrow="Silver Trend"
          value={`${Number(payload?.assets?.[1]?.predicted_arima_return_percent || 0).toFixed(2)}%`}
          tone="violet"
        />
      </section>

      {isLoading ? (
        <div className="card">
          <p className="metric-label">Loading metals analysis...</p>
        </div>
      ) : (
        (payload?.assets || []).map((asset) => <AssetForecastCard key={asset.symbol} asset={asset} />)
      )}
    </AppShell>
  );
}

export default MetalsAnalysis;
