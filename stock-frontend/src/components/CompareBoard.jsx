import { Bar, Radar } from "react-chartjs-2";
import { createChartOptions } from "../lib/chartSetup";
import { formatMoney } from "../lib/currency";

function CompareBoard({ items, leftSymbol, rightSymbol, onLeftChange, onRightChange, currency }) {
  const left = items.find((item) => item.symbol === leftSymbol) || items[0];
  const right = items.find((item) => item.symbol === rightSymbol) || items[1] || items[0];

  const priceChart = {
    labels: [left?.label || "Asset A", right?.label || "Asset B"],
    datasets: [
      {
        label: "Current Price",
        data: [left?.current_price || 0, right?.current_price || 0],
        backgroundColor: ["rgba(56,189,248,0.72)", "rgba(167,139,250,0.72)"],
        borderRadius: 12
      }
    ]
  };

  const performanceChart = {
    labels: ["Recent Return", "Linear Return", "ARIMA Return", "Benefit Score"],
    datasets: [
      {
        label: left?.label || "Asset A",
        data: [
          left?.recent_return_percent || 0,
          left?.predicted_linear_return_percent || 0,
          left?.predicted_arima_return_percent || 0,
          left?.benefit_score || 0
        ],
        borderColor: "#38bdf8",
        backgroundColor: "rgba(56,189,248,0.18)"
      },
      {
        label: right?.label || "Asset B",
        data: [
          right?.recent_return_percent || 0,
          right?.predicted_linear_return_percent || 0,
          right?.predicted_arima_return_percent || 0,
          right?.benefit_score || 0
        ],
        borderColor: "#f59e0b",
        backgroundColor: "rgba(245,158,11,0.18)"
      }
    ]
  };

  const peChart = {
    labels: [left?.label || "Asset A", right?.label || "Asset B"],
    datasets: [
      {
        label: "P/E Ratio",
        data: [left?.pe_ratio || 0, right?.pe_ratio || 0],
        backgroundColor: ["rgba(34,197,94,0.72)", "rgba(244,114,182,0.72)"],
        borderRadius: 12
      }
    ]
  };

  return (
    <>
      <div className="glass-card compare-selectors">
        <div className="builder-step compact-step">
          <span className="step-tag">A</span>
          <h3>Select First Stock</h3>
          <select value={leftSymbol} onChange={(event) => onLeftChange(event.target.value)}>
            {items.map((item) => (
              <option key={`left-${item.symbol}`} value={item.symbol}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
        <div className="builder-step compact-step">
          <span className="step-tag">B</span>
          <h3>Select Second Stock</h3>
          <select value={rightSymbol} onChange={(event) => onRightChange(event.target.value)}>
            {items.map((item) => (
              <option key={`right-${item.symbol}`} value={item.symbol}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="dashboard-charts-grid compare-dashboard">
        <div className="chart-card">
          <div className="section-head compact">
            <div>
              <p className="panel-kicker">Compare</p>
              <h3>Price Comparison</h3>
            </div>
          </div>
          <div className="chart-canvas">
            <Bar data={priceChart} options={createChartOptions()} />
          </div>
        </div>

        <div className="chart-card">
          <div className="section-head compact">
            <div>
              <p className="panel-kicker">Compare</p>
              <h3>Performance Comparison</h3>
            </div>
          </div>
          <div className="chart-canvas">
            <Radar
              data={performanceChart}
              options={createChartOptions({
                scales: {
                  r: {
                    angleLines: { color: "rgba(148, 163, 184, 0.12)" },
                    grid: { color: "rgba(148, 163, 184, 0.12)" },
                    pointLabels: { color: "#d3e4ff" },
                    ticks: { color: "#d3e4ff", backdropColor: "transparent" }
                  }
                }
              })}
            />
          </div>
        </div>

        <div className="chart-card">
          <div className="section-head compact">
            <div>
              <p className="panel-kicker">Compare</p>
              <h3>P/E Ratio Comparison</h3>
            </div>
          </div>
          <div className="chart-canvas">
            <Bar data={peChart} options={createChartOptions()} />
          </div>
        </div>
      </div>

      <section className="glass-card">
        <div className="section-head">
          <div>
            <p className="panel-kicker">Ranking Table</p>
            <h2>Which Asset Is More Beneficial?</h2>
          </div>
        </div>
        <div className="table-wrap premium-table">
          <table>
            <thead>
              <tr>
                <th>Asset</th>
                <th>Type</th>
                <th>Current Price</th>
                <th>Performance</th>
                <th>P/E Ratio</th>
                <th>Benefit Score</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.symbol}>
                  <td>{item.label}</td>
                  <td>{item.asset_type}</td>
                  <td>{formatMoney(item.current_price || 0, currency)}</td>
                  <td>{Number(item.predicted_arima_return_percent || 0).toFixed(2)}%</td>
                  <td>{Number(item.pe_ratio || 0).toFixed(2)}</td>
                  <td>{Number(item.benefit_score || 0).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

export default CompareBoard;
