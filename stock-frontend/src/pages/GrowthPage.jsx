import { useEffect, useMemo, useState } from "react";
import { Doughnut, Line } from "react-chartjs-2";
import api from "../api/axios";
import AppShell from "../components/AppShell";
import MetricCard from "../components/MetricCard";
import { useCurrencyPreference } from "../context/CurrencyContext";
import { createChartOptions } from "../lib/chartSetup";
import { formatMoney } from "../lib/currency";

function GrowthPage() {
  const [portfolios, setPortfolios] = useState([]);
  const [selectedPortfolioId, setSelectedPortfolioId] = useState("");
  const [analytics, setAnalytics] = useState(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const { currency } = useCurrencyPreference();

  useEffect(() => {
    const init = async () => {
      setError("");
      setIsLoading(true);
      try {
        const portfolioResponse = await api.get("/portfolios/");
        const list = portfolioResponse.data.portfolios || [];
        setPortfolios(list);
        const firstId = list[0]?.id ? String(list[0].id) : "";
        setSelectedPortfolioId(firstId);

        if (firstId) {
          const analyticsResponse = await api.get("/portfolio/analytics/", {
            params: { portfolio_id: firstId }
          });
          setAnalytics(analyticsResponse.data);
        }
      } catch (err) {
        setError(err?.response?.data?.detail || "Failed to load growth page.");
      } finally {
        setIsLoading(false);
      }
    };
    init();
  }, []);

  useEffect(() => {
    if (!selectedPortfolioId) {
      return;
    }

    const load = async () => {
      setError("");
      setIsLoading(true);
      try {
        const response = await api.get("/portfolio/analytics/", {
          params: { portfolio_id: selectedPortfolioId }
        });
        setAnalytics(response.data);
      } catch (err) {
        setError(err?.response?.data?.detail || "Failed to load portfolio growth.");
      } finally {
        setIsLoading(false);
      }
    };

    load();
  }, [selectedPortfolioId]);

  const growthSeries = analytics?.portfolio_growth || [];
  const futureSeries = useMemo(() => {
    if (growthSeries.length === 0) {
      return [];
    }

    const values = growthSeries.map((item) => Number(item.value || 0));
    const recentSteps = values.slice(-4);
    const recentMoves = recentSteps.slice(1).map((value, index) => value - recentSteps[index]);
    const averageSlope =
      recentMoves.length > 0
        ? recentMoves.reduce((acc, value) => acc + value, 0) / recentMoves.length
        : 0;
    const lastMove = recentMoves[recentMoves.length - 1] || 0;
    const moveVolatility =
      recentMoves.length > 1
        ? recentMoves.reduce((acc, value) => acc + Math.abs(value - averageSlope), 0) / recentMoves.length
        : Math.abs(averageSlope) * 0.35;
    const lastPoint = growthSeries[growthSeries.length - 1];
    const baseDate = new Date(lastPoint.date);
    const result = [];
    let runningValue = values[values.length - 1];

    for (let index = 1; index <= 5; index += 1) {
      const nextDate = new Date(baseDate);
      nextDate.setDate(baseDate.getDate() + index);
      const curveWeight = 1 + (index * 0.18);
      const momentum = (averageSlope * 0.68) + (lastMove * 0.32);
      const wave = Math.sin(index * 0.9) * Math.max(moveVolatility, Math.abs(averageSlope) * 0.18) * curveWeight;
      const acceleration = averageSlope * 0.12 * (index ** 1.35);
      runningValue = Math.max(runningValue + momentum + wave + acceleration, 0);
      result.push({
        date: nextDate.toISOString().slice(0, 10),
        value: Number(runningValue.toFixed(2))
      });
    }

    return result;
  }, [growthSeries]);

  const combinedLabels = [...growthSeries.map((item) => item.date), ...futureSeries.map((item) => item.date)];
  const lastActualValue = growthSeries[growthSeries.length - 1]?.value || null;
  const growthChart = {
    labels: combinedLabels,
    datasets: [
      {
        label: "Current Portfolio Growth",
        data: [...growthSeries.map((item) => item.value), ...futureSeries.map(() => null)],
        borderColor: "#38bdf8",
        backgroundColor: "rgba(56,189,248,0.22)",
        fill: true,
        tension: 0.42,
        cubicInterpolationMode: "monotone",
        spanGaps: true
      },
      {
        label: "Future Portfolio Value",
        data: [
          ...growthSeries.map((_, index) => (index === growthSeries.length - 1 ? lastActualValue : null)),
          ...futureSeries.map((item) => item.value)
        ],
        borderColor: "#f59e0b",
        backgroundColor: "rgba(245,158,11,0.18)",
        fill: true,
        borderDash: [8, 6],
        tension: 0.62,
        cubicInterpolationMode: "monotone",
        spanGaps: true
      }
    ]
  };

  const allocationChart = {
    labels: Object.keys(analytics?.sector_distribution || {}),
    datasets: [
      {
        data: Object.values(analytics?.sector_distribution || {}),
        backgroundColor: ["#38bdf8", "#22c55e", "#f59e0b", "#8b5cf6", "#fb7185", "#14b8a6"],
        borderWidth: 0
      }
    ]
  };

  const projectedFutureValue = futureSeries[futureSeries.length - 1]?.value || analytics?.max_portfolio_value || 0;

  const actions = (
    <select value={selectedPortfolioId} onChange={(event) => setSelectedPortfolioId(event.target.value)}>
      {portfolios.map((item) => (
        <option key={item.id} value={item.id}>
          {item.name}
        </option>
      ))}
    </select>
  );

  return (
    <AppShell
      title="Growth Intelligence"
      subtitle="Track current performance, projected future value, and sector concentration in one high-signal growth workspace."
      actions={actions}
      error={error}
    >
      <section className="analytics-strip">
        <MetricCard eyebrow="Total Value" value={formatMoney(analytics?.total_value || 0, currency)} tone="blue" />
        <MetricCard eyebrow="Profit / Loss" value={formatMoney(analytics?.total_profit_loss || 0, currency)} tone="emerald" />
        <MetricCard eyebrow="Future Value" value={formatMoney(projectedFutureValue || 0, currency)} tone="amber" />
        <MetricCard eyebrow="Best Stock" value={analytics?.best_performing_stock || "-"} tone="violet" />
      </section>

      <section className="growth-layout">
        <div className="chart-card growth-main">
          <div className="section-head compact">
            <div>
              <p className="panel-kicker">Chart.js</p>
              <h3>Portfolio Growth</h3>
            </div>
          </div>
          <div className="chart-canvas tall">
            {isLoading ? <p className="metric-label">Loading growth chart...</p> : <Line data={growthChart} options={createChartOptions()} />}
          </div>
        </div>

        <div className="glass-card growth-summary">
          <div className="section-head compact">
            <div>
              <p className="panel-kicker">Portfolio Snapshot</p>
              <h3>Performance Summary</h3>
            </div>
          </div>
          <div className="summary-list">
            <div><span>Total value</span><strong>{formatMoney(analytics?.total_value || 0, currency)}</strong></div>
            <div><span>Profit / loss</span><strong>{formatMoney(analytics?.total_profit_loss || 0, currency)}</strong></div>
            <div><span>Future value</span><strong>{formatMoney(projectedFutureValue || 0, currency)}</strong></div>
            <div><span>Min value</span><strong>{formatMoney(analytics?.min_portfolio_value || 0, currency)}</strong></div>
            <div><span>Max value</span><strong>{formatMoney(analytics?.max_portfolio_value || 0, currency)}</strong></div>
            <div><span>Average P/E</span><strong>{Number(analytics?.average_pe_ratio || 0).toFixed(2)}</strong></div>
            <div><span>Best performer</span><strong>{analytics?.best_performing_stock || "-"}</strong></div>
          </div>
        </div>
      </section>

      <section className="chart-card">
        <div className="section-head compact">
          <div>
            <p className="panel-kicker">Chart.js</p>
            <h3>Sector Allocation</h3>
          </div>
        </div>
        <div className="chart-canvas doughnut">
          {isLoading ? (
            <p className="metric-label">Loading allocation graph...</p>
          ) : (
            <Doughnut
              data={allocationChart}
              options={createChartOptions({
                scales: {}
              })}
            />
          )}
        </div>
      </section>
    </AppShell>
  );
}

export default GrowthPage;
