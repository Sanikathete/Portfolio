import { useEffect, useState } from "react";
import AppShell from "../components/AppShell";
import CompareBoard from "../components/CompareBoard";
import MetricCard from "../components/MetricCard";
import { useCurrencyPreference } from "../context/CurrencyContext";
import { ensureArray } from "../lib/api";
import api from "../api/axios";

function ComparePage() {
  const [portfolios, setPortfolios] = useState([]);
  const [selectedPortfolioId, setSelectedPortfolioId] = useState("");
  const [comparison, setComparison] = useState(null);
  const [leftSymbol, setLeftSymbol] = useState("");
  const [rightSymbol, setRightSymbol] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const { currency } = useCurrencyPreference();

  useEffect(() => {
    const loadInitialData = async () => {
      setError("");
        setIsLoading(true);
        try {
          const portfolioResponse = await api.get("/portfolios/");
          const list = ensureArray(portfolioResponse.data);
          setPortfolios(list);
          const portfolioId = list[0]?.id ? String(list[0].id) : "";
          setSelectedPortfolioId(portfolioId);

        const comparisonResponse = await api.get("/analysis/compare/", {
          params: portfolioId ? { portfolio_id: portfolioId } : {}
        });
        setComparison(comparisonResponse.data);
        setLeftSymbol(comparisonResponse.data?.items?.[0]?.symbol || "");
        setRightSymbol(comparisonResponse.data?.items?.[1]?.symbol || comparisonResponse.data?.items?.[0]?.symbol || "");
      } catch (err) {
        setError(err?.response?.data?.detail || "Failed to load portfolios.");
      } finally {
        setIsLoading(false);
      }
    };
    loadInitialData();
  }, []);

  useEffect(() => {
    if (!selectedPortfolioId) {
      return;
    }

    const loadComparison = async () => {
      setError("");
      setIsLoading(true);
      try {
        const response = await api.get("/analysis/compare/", {
          params: { portfolio_id: selectedPortfolioId }
        });
        setComparison(response.data);
        setLeftSymbol(response.data?.items?.[0]?.symbol || "");
        setRightSymbol(response.data?.items?.[1]?.symbol || response.data?.items?.[0]?.symbol || "");
      } catch (err) {
        setError(err?.response?.data?.detail || "Failed to load comparison data.");
      } finally {
        setIsLoading(false);
      }
    };
    loadComparison();
  }, [selectedPortfolioId]);

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
      title="Compare Opportunities"
      subtitle="Rank portfolio stocks, gold, silver, and Bitcoin to see which asset currently looks most beneficial."
      actions={actions}
      error={error}
    >
      <section className="analytics-strip">
        <MetricCard eyebrow="Most Beneficial" value={comparison?.most_beneficial?.label || "-"} tone="amber" />
        <MetricCard eyebrow="Best Benefit Score" value={Number(comparison?.most_beneficial?.benefit_score || 0).toFixed(2)} tone="blue" />
        <MetricCard eyebrow="Best ARIMA Return" value={`${Number(comparison?.most_beneficial?.predicted_arima_return_percent || 0).toFixed(2)}%`} tone="emerald" />
      </section>
      {isLoading ? (
        <div className="card">
          <p className="metric-label">Loading comparison data...</p>
        </div>
      ) : (
        <CompareBoard
          items={comparison?.items || []}
          leftSymbol={leftSymbol}
          rightSymbol={rightSymbol}
          onLeftChange={setLeftSymbol}
          onRightChange={setRightSymbol}
          currency={currency}
        />
      )}
    </AppShell>
  );
}

export default ComparePage;
