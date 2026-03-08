import { Line } from "react-chartjs-2";
import { useCurrencyPreference } from "../context/CurrencyContext";
import { createChartOptions } from "../lib/chartSetup";
import { formatMoney } from "../lib/currency";

function AssetForecastCard({ asset }) {
  const { currency } = useCurrencyPreference();
  const historical = asset?.historical || [];
  const blended = asset?.forecast || [];
  const linear = asset?.linear_regression_forecast || [];
  const arima = asset?.arima_forecast || [];

  const chartData = {
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
          ...linear.map((item) => item.price)
        ],
        borderColor: "#22c55e",
        tension: 0.35,
        borderDash: [6, 5]
      },
      {
        label: "ARIMA",
        data: [
          ...historical.map((item, index) => (index === historical.length - 1 ? item.price : null)),
          ...arima.map((item) => item.price)
        ],
        borderColor: "#f59e0b",
        tension: 0.38,
        borderDash: [10, 6]
      }
    ]
  };

  const trendLabel =
    Number(asset?.predicted_arima_return_percent || 0) > 0
      ? "Bullish momentum"
      : Number(asset?.predicted_arima_return_percent || 0) < 0
        ? "Defensive trend"
        : "Neutral trend";

  return (
    <div className="chart-card asset-focus-card">
      <div className="section-head compact">
        <div>
          <p className="panel-kicker">{asset?.asset_type}</p>
          <h3>{asset?.label}</h3>
        </div>
        <div className="asset-spot">
          <strong>{formatMoney(asset?.current_price || 0, currency)}</strong>
          <span className={Number(asset?.daily_change_percent || 0) >= 0 ? "profit-text" : "loss-text"}>
            {Number(asset?.daily_change_percent || 0).toFixed(2)}%
          </span>
        </div>
      </div>

      <div className="asset-trend-grid">
        <div><span>Trend</span><strong>{trendLabel}</strong></div>
        <div><span>Recent Return</span><strong>{Number(asset?.recent_return_percent || 0).toFixed(2)}%</strong></div>
        <div><span>Linear Regression</span><strong>{Number(asset?.predicted_linear_return_percent || 0).toFixed(2)}%</strong></div>
        <div><span>ARIMA</span><strong>{Number(asset?.predicted_arima_return_percent || 0).toFixed(2)}%</strong></div>
      </div>

      <div className="chart-canvas tall">
        <Line data={chartData} options={createChartOptions()} />
      </div>
    </div>
  );
}

export default AssetForecastCard;
