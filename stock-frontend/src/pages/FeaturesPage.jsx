import { useEffect, useMemo, useState } from "react";
import { Bar, Doughnut, Line } from "react-chartjs-2";
import api from "../api/axios";
import AppShell from "../components/AppShell";
import MetricCard from "../components/MetricCard";
import { ensureArray } from "../lib/api";
import { createChartOptions } from "../lib/chartSetup";

const GROWTH_RANGES = ["1W", "1M", "3M", "6M", "1Y", "3Y"];

function FeaturesPage() {
  const [portfolios, setPortfolios] = useState([]);
  const [selectedPortfolioId, setSelectedPortfolioId] = useState("");
  const [portfolio, setPortfolio] = useState(null);
  const [portfolioAnalytics, setPortfolioAnalytics] = useState(null);
  const [topDiscount, setTopDiscount] = useState(null);
  const [topGrowth, setTopGrowth] = useState(null);
  const [riskClusters, setRiskClusters] = useState(null);
  const [growthRange, setGrowthRange] = useState("1M");
  const [error, setError] = useState("");

  const loadPortfolios = async () => {
    const response = await api.get("/portfolios/");
    const list = ensureArray(response.data);
    setPortfolios(list);
    if (!selectedPortfolioId && list[0]?.id) {
      setSelectedPortfolioId(String(list[0].id));
    }
    return list;
  };

  const loadAnalytics = async (portfolioId, rangeCode = growthRange) => {
    if (!portfolioId) {
      return;
    }
    const [portfolioResponse, analyticsResponse, discountResponse, growthResponse, riskResponse] = await Promise.all([
      api.get(`/portfolios/${portfolioId}/`),
      api.get("/portfolio/analytics/", { params: { portfolio_id: portfolioId, horizon: 5 } }),
      api.get(`/portfolios/${portfolioId}/top-discount/`),
      api.get(`/portfolios/${portfolioId}/top-growth/`, { params: { range: rangeCode } }),
      api.get(`/portfolios/${portfolioId}/risk-clusters/`)
    ]);
    setPortfolio(portfolioResponse.data);
    setPortfolioAnalytics(analyticsResponse.data);
    setTopDiscount(discountResponse.data);
    setTopGrowth(growthResponse.data);
    setRiskClusters(riskResponse.data);
  };

  useEffect(() => {
    const init = async () => {
      setError("");
      try {
        const list = await loadPortfolios();
        const firstId = list[0]?.id ? String(list[0].id) : "";
        if (firstId) {
          await loadAnalytics(firstId);
        }
      } catch (err) {
        setError(err?.response?.data?.detail || "Failed to load growth analytics.");
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
      try {
        await loadAnalytics(selectedPortfolioId, growthRange);
      } catch (err) {
        setError(err?.response?.data?.detail || "Failed to refresh growth analytics.");
      }
    };
    load();
  }, [selectedPortfolioId, growthRange]);

  const summary = portfolio?.summary || {};
  const riskRows = riskClusters?.clusters || [];
  const riskImage = riskClusters?.pca_plot_base64 ? `data:image/svg+xml;base64,${riskClusters.pca_plot_base64}` : "";
  const growthSeries = portfolioAnalytics?.portfolio_growth || [];

  const futureSeries = useMemo(() => {
    const apiForecast = portfolioAnalytics?.portfolio_forecast || [];
    if (Array.isArray(apiForecast) && apiForecast.length > 0) {
      return apiForecast.map((item) => ({ date: item.date, value: Number(item.value || 0) }));
    }

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

  const portfolioGrowthChart = useMemo(() => {
    const labels = [...growthSeries.map((item) => item.date), ...futureSeries.map((item) => item.date)];
    const lastActualValue = growthSeries[growthSeries.length - 1]?.value || null;
    return {
      labels,
      datasets: [
        {
          label: "Actual Portfolio Growth",
          data: [...growthSeries.map((item) => item.value), ...futureSeries.map(() => null)],
          borderColor: "#38bdf8",
          backgroundColor: "rgba(56,189,248,0.22)",
          fill: true,
          tension: 0.4,
          cubicInterpolationMode: "monotone",
          spanGaps: true
        },
        {
          label: "Future Prediction",
          data: [
            ...growthSeries.map((_, index) => (index === growthSeries.length - 1 ? lastActualValue : null)),
            ...futureSeries.map((item) => item.value)
          ],
          borderColor: "#f59e0b",
          backgroundColor: "rgba(245,158,11,0.14)",
          fill: true,
          borderDash: [8, 6],
          tension: 0.55,
          cubicInterpolationMode: "monotone",
          spanGaps: true
        }
      ]
    };
  }, [futureSeries, growthSeries]);

  const sectorDistributionChart = useMemo(() => ({
    labels: Object.keys(portfolioAnalytics?.sector_distribution || {}),
    datasets: [
      {
        data: Object.values(portfolioAnalytics?.sector_distribution || {}),
        backgroundColor: ["#38bdf8", "#22c55e", "#f59e0b", "#8b5cf6", "#fb7185", "#14b8a6"],
        borderWidth: 0
      }
    ]
  }), [portfolioAnalytics]);

  const discountChart = useMemo(() => ({
    labels: (topDiscount?.items || []).map((item) => item.ticker),
    datasets: [
      {
        label: "Discount %",
        data: (topDiscount?.items || []).map((item) => item.discount_level),
        borderRadius: 12,
        backgroundColor: "#22c55e"
      }
    ]
  }), [topDiscount]);

  const growthChart = useMemo(() => ({
    labels: (topGrowth?.items || []).map((item) => item.ticker),
    datasets: [
      {
        label: `${growthRange} Return`,
        data: (topGrowth?.items || []).map((item) => item.growth_return),
        borderRadius: 12,
        backgroundColor: "#38bdf8"
      }
    ]
  }), [growthRange, topGrowth]);

  const actions = (
    <>
      <select value={selectedPortfolioId} onChange={(event) => setSelectedPortfolioId(event.target.value)}>
        {portfolios.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </select>
      <select value={growthRange} onChange={(event) => setGrowthRange(event.target.value)}>
        {GROWTH_RANGES.map((item) => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
      </select>
    </>
  );

  return (
    <AppShell
      title="Growth"
      subtitle="Review portfolio growth with a projected continuation line, sector-wise distribution, top discounts, top growth stocks, and 3-year risk clustering."
      actions={actions}
      error={error}
    >
      <section className="chart-card">
        <div className="section-head compact">
          <div>
            <p className="panel-kicker">Portfolio Growth</p>
            <h3>Growth Graph</h3>
          </div>
        </div>
        <div className="chart-canvas tall">
          <Line data={portfolioGrowthChart} options={createChartOptions()} />
        </div>
      </section>

      <section className="analytics-strip">
        <MetricCard eyebrow="Holdings Count" value={summary.holdings_count || 0} tone="blue" />
        <MetricCard eyebrow="Average Discount" value={`${Number(summary.average_discount || 0).toFixed(2)}%`} tone="emerald" />
        <MetricCard eyebrow="Undervalued Count" value={summary.undervalued_count || 0} tone="amber" />
        <MetricCard eyebrow="Top Pick" value={summary.top_pick?.ticker || "-"} detail={`Avg score ${Number(summary.average_opportunity_score || 0).toFixed(2)}`} tone="violet" />
      </section>

      <section className="dashboard-charts-grid">
        <div className="chart-card">
          <div className="section-head compact">
            <div>
              <p className="panel-kicker">Sector Allocation</p>
              <h3>Sector-Wise Distribution</h3>
            </div>
          </div>
          <div className="chart-canvas doughnut">
            <Doughnut
              data={sectorDistributionChart}
              options={createChartOptions({
                scales: {}
              })}
            />
          </div>
        </div>

        <div className="chart-card">
          <div className="section-head compact">
            <div>
              <p className="panel-kicker">Chart.js</p>
              <h3>Top Discount Opportunities</h3>
            </div>
          </div>
          <div className="chart-canvas">
            <Bar data={discountChart} options={createChartOptions()} />
          </div>
        </div>
      </section>

      <section className="dashboard-charts-grid">
        <div className="chart-card">
          <div className="section-head compact">
            <div>
              <p className="panel-kicker">Chart.js</p>
              <h3>Top Growth Stocks</h3>
            </div>
          </div>
          <div className="chart-canvas">
            <Bar data={growthChart} options={createChartOptions()} />
          </div>
        </div>

        <div className="glass-card growth-summary">
          <div className="section-head compact">
            <div>
              <p className="panel-kicker">3Y Metrics</p>
              <h3>Risk Categories</h3>
            </div>
          </div>
          <div className="summary-list">
            {riskRows.length === 0 ? <p className="metric-label">Add at least one stock to calculate risk clusters.</p> : null}
            {riskRows.map((item) => (
              <div key={item.stock_id}>
                <span>{item.ticker}</span>
                <strong>{item.cluster}</strong>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="growth-layout">
        <div className="chart-card growth-main">
          <div className="section-head compact">
            <div>
              <p className="panel-kicker">Risk Clustering</p>
              <h3>PCA Scatter Plot</h3>
            </div>
          </div>
          {riskImage ? <img src={riskImage} alt="Portfolio risk clusters" className="risk-plot" /> : <p className="metric-label">No risk plot available.</p>}
        </div>

        <div className="chart-card">
          <div className="section-head compact">
            <div>
              <p className="panel-kicker">Risk Table</p>
              <h3>Volatility, Sharpe, Drawdown, CAGR</h3>
            </div>
          </div>
          <div className="table-wrap premium-table">
            <table>
              <thead>
                <tr>
                  <th>Ticker</th>
                  <th>Cluster</th>
                  <th>Volatility</th>
                  <th>Sharpe Ratio</th>
                  <th>Max Drawdown</th>
                  <th>CAGR</th>
                </tr>
              </thead>
              <tbody>
                {riskRows.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="center-text">No holdings available for clustering.</td>
                  </tr>
                ) : (
                  riskRows.map((item) => (
                    <tr key={item.stock_id}>
                      <td>{item.ticker}</td>
                      <td>{item.cluster}</td>
                      <td>{Number(item.volatility || 0).toFixed(4)}</td>
                      <td>{Number(item.sharpe_ratio || 0).toFixed(4)}</td>
                      <td>{Number(item.max_drawdown || 0).toFixed(4)}</td>
                      <td>{Number(item.cagr || 0).toFixed(4)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </AppShell>
  );
}

export default FeaturesPage;
