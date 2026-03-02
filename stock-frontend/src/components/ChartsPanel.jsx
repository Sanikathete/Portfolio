import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  Legend
} from "recharts";

const PIE_COLORS = ["#1D4ED8", "#16A34A", "#9333EA", "#F59E0B", "#DC2626", "#0891B2"];

function ChartsPanel({ analytics, portfolioStocks }) {
  const growthData = analytics?.portfolio_growth || [];
  const sectorDist = Object.entries(analytics?.sector_distribution || {}).map(([name, value]) => ({
    name,
    value
  }));
  const peData = (portfolioStocks || []).map((item) => ({
    symbol: item.stock.symbol,
    pe: Number(item.pe_ratio || 0)
  }));
  const plData = (portfolioStocks || []).map((item) => ({
    symbol: item.stock.symbol,
    profit_loss: Number(item.profit_loss || 0)
  }));

  return (
    <div className="charts-grid">
      <div className="chart-card">
        <h3>Portfolio Growth</h3>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={growthData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" />
            <YAxis />
            <Tooltip />
            <Line type="monotone" dataKey="value" stroke="#1D4ED8" strokeWidth={3} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="chart-card">
        <h3>Sector Allocation</h3>
        <ResponsiveContainer width="100%" height={260}>
          <PieChart>
            <Pie data={sectorDist} dataKey="value" nameKey="name" outerRadius={90} label>
              {sectorDist.map((entry, index) => (
                <Cell key={entry.name} fill={PIE_COLORS[index % PIE_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div className="chart-card">
        <h3>P/E Ratio Comparison</h3>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={peData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="symbol" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Bar dataKey="pe" fill="#9333EA" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="chart-card">
        <h3>Profit/Loss by Stock</h3>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={plData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="symbol" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Bar dataKey="profit_loss" fill="#16A34A" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default ChartsPanel;
