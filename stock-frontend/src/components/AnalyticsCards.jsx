import { FaChartLine, FaDollarSign, FaPercent, FaTrophy } from "react-icons/fa";

function AnalyticsCards({ analytics }) {
  const totalValue = analytics?.total_value ?? 0;
  const totalProfitLoss = analytics?.total_profit_loss ?? 0;
  const averagePeRatio = analytics?.average_pe_ratio ?? 0;
  const bestStock = analytics?.best_performing_stock || "-";

  return (
    <div className="analytics-grid">
      <div className="metric-card">
        <div className="metric-icon blue">
          <FaDollarSign />
        </div>
        <div>
          <p className="metric-label">Total Portfolio Value</p>
          <h3>${Number(totalValue).toFixed(2)}</h3>
        </div>
      </div>

      <div className="metric-card">
        <div className={`metric-icon ${totalProfitLoss >= 0 ? "green" : "red"}`}>
          <FaChartLine />
        </div>
        <div>
          <p className="metric-label">Total Profit/Loss</p>
          <h3 className={totalProfitLoss >= 0 ? "profit-text" : "loss-text"}>
            ${Number(totalProfitLoss).toFixed(2)}
          </h3>
        </div>
      </div>

      <div className="metric-card">
        <div className="metric-icon purple">
          <FaPercent />
        </div>
        <div>
          <p className="metric-label">Average P/E Ratio</p>
          <h3>{Number(averagePeRatio).toFixed(2)}</h3>
        </div>
      </div>

      <div className="metric-card">
        <div className="metric-icon gold">
          <FaTrophy />
        </div>
        <div>
          <p className="metric-label">Best Performing Stock</p>
          <h3>{bestStock}</h3>
        </div>
      </div>
    </div>
  );
}

export default AnalyticsCards;
