import { useEffect, useState } from "react";
import AppShell from "../components/AppShell";
import AssetForecastCard from "../components/AssetForecastCard";
import MetricCard from "../components/MetricCard";
import api from "../api/axios";

function BitcoinAnalysis() {
  const [payload, setPayload] = useState(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setError("");
      setIsLoading(true);
      try {
        const response = await api.get("/analysis/bitcoin/");
        setPayload(response.data);
      } catch (err) {
        setError(err?.response?.data?.detail || "Failed to load Bitcoin analysis.");
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  return (
    <AppShell
      title="Bitcoin Analysis"
      subtitle="Review Bitcoin historical movement and compare ARIMA against linear-regression forecasts."
      error={error}
    >
      <section className="analytics-strip">
        <MetricCard eyebrow="Market Trend" value={Number(payload?.asset?.predicted_arima_return_percent || 0) >= 0 ? "Bullish" : "Cautious"} tone="amber" />
        <MetricCard eyebrow="Price Analytics" value={`${Number(payload?.asset?.recent_return_percent || 0).toFixed(2)}%`} tone="blue" />
        <MetricCard eyebrow="Benefit Score" value={Number(payload?.asset?.benefit_score || 0).toFixed(2)} tone="emerald" />
      </section>
      {isLoading ? (
        <div className="card">
          <p className="metric-label">Loading Bitcoin analysis...</p>
        </div>
      ) : payload?.asset ? (
        <AssetForecastCard asset={payload.asset} />
      ) : null}
    </AppShell>
  );
}

export default BitcoinAnalysis;
