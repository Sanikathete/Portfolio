import { useEffect, useMemo, useState } from "react";
import { Line } from "react-chartjs-2";
import { useNavigate, useParams } from "react-router-dom";
import api from "../api/axios";
import AppShell from "../components/AppShell";
import MetricCard from "../components/MetricCard";
import { useCurrencyPreference } from "../context/CurrencyContext";
import { createChartOptions } from "../lib/chartSetup";
import { formatMoney } from "../lib/currency";

const RANGE_OPTIONS = ["1D", "7D", "1M", "3M", "6M", "1Y", "3Y"];

function StockDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [rangeCode, setRangeCode] = useState("3M");
  const [payload, setPayload] = useState(null);
  const [error, setError] = useState("");
  const { currency } = useCurrencyPreference();

  useEffect(() => {
    const load = async () => {
      setError("");
      try {
        const response = await api.get(`/stocks/${id}/`, {
          params: { range: rangeCode }
        });
        setPayload(response.data);
      } catch (err) {
        setError(err?.response?.data?.detail || "Failed to load stock detail.");
      }
    };
    load();
  }, [id, rangeCode]);

  const chartData = useMemo(() => ({
    labels: (payload?.history || []).map((item) => item.date),
    datasets: [
      {
        label: payload?.ticker || "Stock",
        data: (payload?.history || []).map((item) => item.price),
        borderColor: "#38bdf8",
        backgroundColor: "rgba(56,189,248,0.22)",
        fill: true,
        tension: 0.32
      }
    ]
  }), [payload]);

  const actions = (
    <>
      <button className="secondary-btn" onClick={() => navigate(-1)}>
        Back
      </button>
      <select value={rangeCode} onChange={(event) => setRangeCode(event.target.value)}>
        {RANGE_OPTIONS.map((item) => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
      </select>
    </>
  );

  return (
    <AppShell
      title={payload?.name || "Stock Detail"}
      subtitle="Inspect prompt-aligned stock analytics with historical ranges, refreshed fundamentals, and valuation cards."
      actions={actions}
      error={error}
    >
      <section className="analytics-strip">
        <MetricCard eyebrow="Current Price" value={formatMoney(payload?.snapshot?.current_price || 0, currency)} tone="blue" />
        <MetricCard eyebrow="P/E Ratio" value={Number(payload?.fundamentals?.pe_ratio || 0).toFixed(2)} tone="emerald" />
        <MetricCard eyebrow="EPS" value={Number(payload?.fundamentals?.eps || 0).toFixed(2)} tone="amber" />
        <MetricCard eyebrow="Intrinsic Value" value={formatMoney(payload?.fundamentals?.intrinsic_value || 0, currency)} tone="violet" />
      </section>

      <section className="growth-layout">
        <div className="chart-card growth-main">
          <div className="section-head compact">
            <div>
              <p className="panel-kicker">Historical Chart</p>
              <h3>{payload?.ticker || "Ticker"} Price History</h3>
            </div>
          </div>
          <div className="chart-canvas tall">
            <Line data={chartData} options={createChartOptions()} />
          </div>
        </div>

        <div className="glass-card growth-summary">
          <div className="section-head compact">
            <div>
              <p className="panel-kicker">Fundamental Cards</p>
              <h3>Snapshot</h3>
            </div>
          </div>
          <div className="summary-list">
            <div><span>Market Cap</span><strong>{Number(payload?.fundamentals?.market_cap || 0).toLocaleString()}</strong></div>
            <div><span>Min Price</span><strong>{formatMoney(payload?.snapshot?.min_price || 0, currency)}</strong></div>
            <div><span>Max Price</span><strong>{formatMoney(payload?.snapshot?.max_price || 0, currency)}</strong></div>
            <div><span>Discount Level</span><strong>{Number(payload?.snapshot?.discount_level || 0).toFixed(2)}%</strong></div>
            <div><span>Opportunity Score</span><strong>{Number(payload?.snapshot?.opportunity_score || 0).toFixed(2)}</strong></div>
          </div>
        </div>
      </section>
    </AppShell>
  );
}

export default StockDetailPage;
