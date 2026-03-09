import { useEffect, useMemo, useState } from "react";
import { Line } from "react-chartjs-2";
import AppShell from "../components/AppShell";
import MetricCard from "../components/MetricCard";
import api from "../api/axios";
import { createChartOptions } from "../lib/chartSetup";
import { useCurrencyPreference } from "../context/CurrencyContext";
import { formatMoney } from "../lib/currency";

const MODEL_OPTIONS = ["linear", "arima", "rnn"];
const HORIZON_OPTIONS = [14, 30, 60, 90];

function BitcoinAnalysis() {
  const [model, setModel] = useState("linear");
  const [horizon, setHorizon] = useState(30);
  const [payload, setPayload] = useState(null);
  const [error, setError] = useState("");
  const { currency } = useCurrencyPreference();

  useEffect(() => {
    const load = async () => {
      setError("");
      try {
        const response = await api.get("/crypto/btc/forecast/", {
          params: { model, horizon }
        });
        setPayload(response.data);
      } catch (err) {
        setError(err?.response?.data?.detail || "Failed to load BTC forecast.");
      }
    };
    load();
  }, [model, horizon]);

  const chartData = useMemo(() => {
    const historical = payload?.historical || [];
    const forecast = payload?.forecast || [];
    return {
      labels: [...historical.map((item) => item.date), ...forecast.map((item) => item.date)],
      datasets: [
        {
          label: "Historical",
          data: [...historical.map((item) => item.price), ...forecast.map(() => null)],
          borderColor: "#38bdf8",
          backgroundColor: "rgba(56,189,248,0.2)",
          fill: true,
          tension: 0.28
        },
        {
          label: `Forecast (${model.toUpperCase()})`,
          data: [
            ...historical.map((item, index) => (index === historical.length - 1 ? item.price : null)),
            ...forecast.map((item) => item.price)
          ],
          borderColor: "#f59e0b",
          borderDash: [8, 6],
          fill: false,
          tension: 0.3
        }
      ]
    };
  }, [model, payload]);

  const actions = (
    <>
      <select value={model} onChange={(event) => setModel(event.target.value)}>
        {MODEL_OPTIONS.map((item) => (
          <option key={item} value={item}>
            {item.toUpperCase()}
          </option>
        ))}
      </select>
      <select value={horizon} onChange={(event) => setHorizon(Number(event.target.value))}>
        {HORIZON_OPTIONS.map((item) => (
          <option key={item} value={item}>
            {item} Days
          </option>
        ))}
      </select>
    </>
  );

  return (
    <AppShell
      title="BTC Forecast Explorer"
      subtitle="Run BTC-USD projections with linear, ARIMA, or lightweight NumPy RNN logic and choose 14, 30, 60, or 90 day horizons."
      actions={actions}
      error={error}
    >
      <section className="analytics-strip">
        <MetricCard eyebrow="Current Price" value={formatMoney(payload?.summary?.current_price || 0, currency)} tone="blue" />
        <MetricCard eyebrow="Projected Price" value={formatMoney(payload?.summary?.projected_price || 0, currency)} tone="amber" />
        <MetricCard eyebrow="Projected Change" value={`${Number(payload?.summary?.projected_change_percent || 0).toFixed(2)}%`} tone="emerald" />
        <MetricCard eyebrow="Model" value={(payload?.model || model).toUpperCase()} detail={`${payload?.horizon || horizon} day horizon`} tone="violet" />
      </section>

      <section className="growth-layout">
        <div className="chart-card growth-main">
          <div className="section-head compact">
            <div>
              <p className="panel-kicker">Historical + Forecast</p>
              <h3>BTC-USD Projection</h3>
            </div>
          </div>
          <div className="chart-canvas tall">
            <Line data={chartData} options={createChartOptions()} />
          </div>
        </div>

        <div className="glass-card growth-summary">
          <div className="section-head compact">
            <div>
              <p className="panel-kicker">Projection Summary</p>
              <h3>Forecast Notes</h3>
            </div>
          </div>
          <div className="summary-list">
            <div><span>Symbol</span><strong>{payload?.symbol || "BTC-USD"}</strong></div>
            <div><span>Model</span><strong>{(payload?.model || model).toUpperCase()}</strong></div>
            <div><span>Horizon</span><strong>{payload?.horizon || horizon} days</strong></div>
            <div><span>Latest price</span><strong>{formatMoney(payload?.summary?.current_price || 0, currency)}</strong></div>
            <div><span>Projection</span><strong>{formatMoney(payload?.summary?.projected_price || 0, currency)}</strong></div>
            <div><span>Change</span><strong>{Number(payload?.summary?.projected_change_percent || 0).toFixed(2)}%</strong></div>
          </div>
        </div>
      </section>
    </AppShell>
  );
}

export default BitcoinAnalysis;
