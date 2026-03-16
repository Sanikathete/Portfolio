import { useEffect, useMemo, useState } from "react";
import { Line } from "react-chartjs-2";
import api from "../api/axios";
import AppShell from "../components/AppShell";
import MetricCard from "../components/MetricCard";
import { useCurrencyPreference } from "../context/CurrencyContext";
import { ensureArray } from "../lib/api";
import { createChartOptions } from "../lib/chartSetup";
import { formatMoney } from "../lib/currency";

function MLAnalysisPage() {
  const [portfolios, setPortfolios] = useState([]);
  const [selectedPortfolioId, setSelectedPortfolioId] = useState("");
  const [analysis, setAnalysis] = useState(null);
  const [selectedSymbol, setSelectedSymbol] = useState("");
  const [forecast, setForecast] = useState(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const { currency } = useCurrencyPreference();

  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
        setError("");
      try {
        const portfolioResponse = await api.get("/portfolios/");
        const list = ensureArray(portfolioResponse.data);
        setPortfolios(list);
        const firstId = list[0]?.id ? String(list[0].id) : "";
        setSelectedPortfolioId(firstId);
        if (firstId) {
          const mlResponse = await api.get("/portfolio/analysis/", {
            params: { portfolio_id: firstId }
          });
          setAnalysis(mlResponse.data);
          const firstSymbol = mlResponse.data?.records?.[0]?.symbol || "";
          setSelectedSymbol(firstSymbol);
        }
      } catch (err) {
        setError(err?.response?.data?.detail || "Failed to load ML analysis.");
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
      setIsLoading(true);
      setError("");
      try {
        const response = await api.get("/portfolio/analysis/", {
          params: { portfolio_id: selectedPortfolioId }
        });
        setAnalysis(response.data);
        const firstSymbol = response.data?.records?.[0]?.symbol || "";
        setSelectedSymbol((current) =>
          response.data?.records?.some((item) => item.symbol === current) ? current : firstSymbol
        );
      } catch (err) {
        setError(err?.response?.data?.detail || "Failed to load ML analysis.");
      } finally {
        setIsLoading(false);
      }
    };

    load();
  }, [selectedPortfolioId]);

  useEffect(() => {
    if (!selectedSymbol) {
      setForecast(null);
      return;
    }

    const loadForecast = async () => {
      try {
        const response = await api.get(`/stocks/forecast/${selectedSymbol}/`);
        setForecast(response.data);
      } catch (err) {
        setError(err?.response?.data?.detail || "Failed to load stock forecast.");
      }
    };

    loadForecast();
  }, [selectedSymbol]);

  const records = analysis?.records || [];
  const predictions = analysis?.predictions || [];
  const uniqueClusters = new Set(records.map((item) => item.cluster)).size;
  const linear = analysis?.linear_regression;
  const logisticAccuracy = analysis?.logistic_regression?.accuracy || 0;

  const chartData = useMemo(() => {
    const historical = forecast?.historical || [];
    const blended = forecast?.forecast || [];
    const linearSeries = forecast?.linear_regression_forecast || [];
    const arimaSeries = forecast?.arima_forecast || [];
    const lastHistorical = historical[historical.length - 1];
    return {
      labels: [...historical.map((item) => item.date), ...blended.map((item) => item.date)],
      datasets: [
        {
          label: "Historical",
          data: [...historical.map((item) => item.price), ...blended.map(() => null)],
          borderColor: "#38bdf8",
          backgroundColor: "rgba(56,189,248,0.22)",
          fill: true,
          tension: 0.35
        },
        {
          label: "Linear Regression",
          data: [
            ...historical.map((item, index) => (index === historical.length - 1 ? item.price : null)),
            ...linearSeries.map((item) => item.price)
          ],
          borderColor: "#22c55e",
          tension: 0.35,
          borderDash: [6, 5]
        },
        {
          label: "ARIMA Prediction",
          data: [
            ...historical.map((item, index) => (index === historical.length - 1 ? item.price : null)),
            ...arimaSeries.map((item) => item.price)
          ],
          borderColor: "#f97316",
          tension: 0.4,
          borderDash: [10, 5]
        },
        {
          label: "Predicted Future Total",
          data: [
            ...historical.map((item, index) => (index === historical.length - 1 ? item.price : null)),
            ...blended.map((item) => item.price)
          ],
          borderColor: "#a78bfa",
          tension: 0.4
        }
      ]
    };
  }, [forecast]);

  const actions = (
    <select value={selectedPortfolioId} onChange={(event) => setSelectedPortfolioId(event.target.value)}>
      {portfolios.length === 0 ? <option value="">No portfolios</option> : null}
      {portfolios.map((item) => (
        <option key={item.id} value={item.id}>
          {item.name}
        </option>
      ))}
    </select>
  );

  return (
    <AppShell
      title="ML Analysis"
      subtitle="Inspect clustering, regression signals, and ARIMA-backed future price curves for each portfolio holding."
      actions={actions}
      error={error}
    >
      <section className="analytics-strip">
        <MetricCard eyebrow="K-Cluster Groups" value={uniqueClusters || 0} tone="violet" />
        <MetricCard eyebrow="Linear Intercept" value={linear ? Number(linear.intercept).toFixed(2) : "-"} tone="blue" />
        <MetricCard eyebrow="Logistic Accuracy" value={`${(Number(logisticAccuracy) * 100).toFixed(2)}%`} tone="emerald" />
        <MetricCard eyebrow="Sample Prediction" value={formatMoney(analysis?.sample_prediction || 0, currency)} tone="amber" />
      </section>

      <section className="glass-card">
        <div className="section-head">
          <div>
            <p className="panel-kicker">Machine Learning Table</p>
            <h2>Analysis Matrix</h2>
          </div>
        </div>
        <div className="table-wrap premium-table">
          <table>
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Cluster</th>
                <th>Actual Total</th>
                <th>Actual Future Total</th>
                <th>Predicted Future Total</th>
              </tr>
            </thead>
            <tbody>
              {records.length === 0 ? (
                <tr>
                  <td colSpan="5" className="center-text">
                    No ML analysis data available.
                  </td>
                </tr>
              ) : (
                records.map((record) => {
                  const matchedPrediction = predictions.find((item) => item.symbol === record.symbol);
                  return (
                    <tr
                      key={`${record.id}-${record.symbol}`}
                      className={record.symbol === selectedSymbol ? "row-selected" : ""}
                      onClick={() => setSelectedSymbol(record.symbol)}
                    >
                      <td>{record.symbol}</td>
                      <td>{record.cluster}</td>
                      <td>{formatMoney(record.total_value || 0, currency)}</td>
                      <td>{formatMoney(matchedPrediction?.actual_future_total_value || record.total_value || 0, currency)}</td>
                      <td>{formatMoney(matchedPrediction?.predicted_total_value || 0, currency)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="chart-card">
        <div className="section-head compact">
          <div>
            <p className="panel-kicker">Future Prediction Graph</p>
            <h3>{selectedSymbol ? `${selectedSymbol} Forecast` : "Select a Stock"}</h3>
          </div>
        </div>
        <div className="chart-canvas tall">
          {isLoading || !selectedSymbol ? (
            <p className="metric-label">Select a stock from the analysis table to inspect its ARIMA and regression forecast.</p>
          ) : (
            <Line data={chartData} options={createChartOptions()} />
          )}
        </div>
      </section>
    </AppShell>
  );
}

export default MLAnalysisPage;
