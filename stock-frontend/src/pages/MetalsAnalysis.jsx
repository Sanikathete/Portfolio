import { useEffect, useMemo, useState } from "react";
import { Bar, Line } from "react-chartjs-2";
import AppShell from "../components/AppShell";
import MetricCard from "../components/MetricCard";
import api from "../api/axios";
import { createChartOptions } from "../lib/chartSetup";
import { useCurrencyPreference } from "../context/CurrencyContext";
import { formatMoney } from "../lib/currency";

const RANGE_OPTIONS = [
  { value: "1H", label: "1 hr" },
  { value: "12H", label: "12 hrs" },
  { value: "1D", label: "1 day" },
  { value: "1W", label: "1 week" },
  { value: "1M", label: "1 month" },
  { value: "3M", label: "3 months" },
  { value: "6M", label: "6 months" },
  { value: "1Y", label: "1 year" },
  { value: "3Y", label: "3 year" },
];

function MetalsAnalysis() {
  const [rangeCode, setRangeCode] = useState("3Y");
  const [payload, setPayload] = useState(null);
  const [analysisPayload, setAnalysisPayload] = useState(null);
  const [error, setError] = useState("");
  const [forecastError, setForecastError] = useState("");
  const { currency } = useCurrencyPreference();

  useEffect(() => {
    const load = async () => {
      setError("");
      try {
        const response = await api.get("/metals/history/", {
          params: { range: rangeCode }
        });
        setPayload(response.data);
      } catch (err) {
        setError(err?.response?.data?.detail || "Failed to load metals explorer.");
      }
    };
    load();
  }, [rangeCode]);

  useEffect(() => {
    const loadForecast = async () => {
      setForecastError("");
      try {
        const response = await api.get("/analysis/metals/");
        setAnalysisPayload(response.data);
      } catch (err) {
        setForecastError(err?.response?.data?.detail || "Failed to load metals forecast.");
      }
    };
    loadForecast();
  }, []);

  const comparisonChart = useMemo(() => ({
    labels: (payload?.comparison || []).map((item) => item.date),
    datasets: [
      {
        label: "Gold",
        data: (payload?.comparison || []).map((item) => item.gold_price),
        borderColor: "#f59e0b",
        backgroundColor: "rgba(245,158,11,0.18)",
        fill: true,
        tension: 0.24
      },
      {
        label: "Silver",
        data: (payload?.comparison || []).map((item) => item.silver_price),
        borderColor: "#38bdf8",
        backgroundColor: "rgba(56,189,248,0.18)",
        fill: true,
        tension: 0.24
      }
    ]
  }), [payload]);

  const goldAsset = useMemo(() => {
    const assets = analysisPayload?.assets || [];
    return assets.find((item) => String(item?.label || "").toLowerCase() === "gold") || assets[0] || null;
  }, [analysisPayload]);

  const silverAsset = useMemo(() => {
    const assets = analysisPayload?.assets || [];
    return assets.find((item) => String(item?.label || "").toLowerCase() === "silver") || assets[1] || null;
  }, [analysisPayload]);

  const buildForecastChart = (asset, colors) => {
    const historical = asset?.historical || [];
    const forecast = asset?.forecast || [];
    return {
      labels: [...historical.map((item) => item.date), ...forecast.map((item) => item.date)],
      datasets: [
        {
          label: "Actual",
          data: [...historical.map((item) => item.price), ...forecast.map(() => null)],
          borderColor: colors.actual,
          backgroundColor: colors.fill,
          fill: true,
          tension: 0.28
        },
        {
          label: "Predicted",
          data: [
            ...historical.map((item, index) => (index === historical.length - 1 ? item.price : null)),
            ...forecast.map((item) => item.price)
          ],
          borderColor: colors.predicted,
          borderDash: [8, 6],
          fill: false,
          tension: 0.3
        }
      ]
    };
  };

  const goldForecastChart = useMemo(
    () => buildForecastChart(goldAsset, {
      actual: "#f59e0b",
      predicted: "#fbbf24",
      fill: "rgba(245,158,11,0.2)"
    }),
    [goldAsset]
  );

  const silverForecastChart = useMemo(
    () => buildForecastChart(silverAsset, {
      actual: "#38bdf8",
      predicted: "#60a5fa",
      fill: "rgba(56,189,248,0.2)"
    }),
    [silverAsset]
  );

  const gapChart = useMemo(() => ({
    labels: (payload?.comparison || []).map((item) => item.date),
    datasets: [
      {
        label: "Silver minus Gold Return Gap",
        data: (payload?.comparison || []).map((item) => item.return_gap),
        borderRadius: 10,
        backgroundColor: "#8b5cf6"
      }
    ]
  }), [payload]);

  const regressionImage = payload?.regression_plot_base64
    ? `data:image/svg+xml;base64,${payload.regression_plot_base64}`
    : "";

  const actions = (
    <select value={rangeCode} onChange={(event) => setRangeCode(event.target.value)}>
      {RANGE_OPTIONS.map((item) => (
        <option key={item.value} value={item.value}>
          {item.label}
        </option>
      ))}
    </select>
  );

  const latestGold = payload?.gold?.[payload.gold.length - 1]?.price || 0;
  const latestSilver = payload?.silver?.[payload.silver.length - 1]?.price || 0;
  const pageError = [error, forecastError].filter(Boolean).join(" ");

  return (
    <AppShell
      title="Gold and Silver"
      subtitle="Compare 3-year gold and silver history with a range switcher, return-gap view, 3-month insights, and a correlation regression plot."
      actions={actions}
      error={pageError}
    >
      <section className="analytics-strip">
        <MetricCard eyebrow="Gold" value={formatMoney(latestGold, currency)} tone="amber" />
        <MetricCard eyebrow="Silver" value={formatMoney(latestSilver, currency)} tone="blue" />
        <MetricCard eyebrow="Leading Metal" value={payload?.insights?.leading_metal || "-"} tone="emerald" />
        <MetricCard eyebrow="Correlation" value={Number(payload?.insights?.correlation || 0).toFixed(4)} tone="violet" />
      </section>

      <section className="dashboard-charts-grid">
        <div className="chart-card">
          <div className="section-head compact">
            <div>
              <p className="panel-kicker">Trend Comparison</p>
              <h3>Gold vs Silver</h3>
            </div>
          </div>
          <div className="chart-canvas tall">
            <Line data={comparisonChart} options={createChartOptions()} />
          </div>
        </div>

        <div className="chart-card">
          <div className="section-head compact">
            <div>
              <p className="panel-kicker">Return Gap</p>
              <h3>Silver Minus Gold</h3>
            </div>
          </div>
          <div className="chart-canvas tall">
            <Bar data={gapChart} options={createChartOptions()} />
          </div>
        </div>
      </section>

      <section className="dashboard-charts-grid">
        <div className="chart-card">
          <div className="section-head compact">
            <div>
              <p className="panel-kicker">Actual vs Predicted</p>
              <h3>Gold Forecast</h3>
            </div>
          </div>
          <div className="chart-canvas tall">
            {goldAsset?.historical?.length ? (
              <Line data={goldForecastChart} options={createChartOptions()} />
            ) : (
              <p className="metric-label">No gold forecast available.</p>
            )}
          </div>
        </div>

        <div className="chart-card">
          <div className="section-head compact">
            <div>
              <p className="panel-kicker">Actual vs Predicted</p>
              <h3>Silver Forecast</h3>
            </div>
          </div>
          <div className="chart-canvas tall">
            {silverAsset?.historical?.length ? (
              <Line data={silverForecastChart} options={createChartOptions()} />
            ) : (
              <p className="metric-label">No silver forecast available.</p>
            )}
          </div>
        </div>
      </section>

      <section className="growth-layout">
        <div className="glass-card growth-summary">
          <div className="section-head compact">
            <div>
              <p className="panel-kicker">3-Month Insights</p>
              <h3>Market Snapshot</h3>
            </div>
          </div>
          <div className="summary-list">
            <div><span>Gold 3M Return</span><strong>{Number(payload?.insights?.gold_3m_return_percent || 0).toFixed(2)}%</strong></div>
            <div><span>Silver 3M Return</span><strong>{Number(payload?.insights?.silver_3m_return_percent || 0).toFixed(2)}%</strong></div>
            <div><span>Correlation</span><strong>{Number(payload?.insights?.correlation || 0).toFixed(4)}</strong></div>
            <div><span>Leader</span><strong>{payload?.insights?.leading_metal || "-"}</strong></div>
          </div>
        </div>

        <div className="chart-card growth-main">
          <div className="section-head compact">
            <div>
              <p className="panel-kicker">Regression Plot</p>
              <h3>Correlation and Regression</h3>
            </div>
          </div>
          {regressionImage ? <img src={regressionImage} alt="Gold silver regression" className="risk-plot" /> : <p className="metric-label">No regression plot available.</p>}
        </div>
      </section>
    </AppShell>
  );
}

export default MetalsAnalysis;
