import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/axios";
import PortfolioTable from "../components/PortfolioTable";
import StockCard from "../components/StockCard";
import AnalyticsCards from "../components/AnalyticsCards";
import ChartsPanel from "../components/ChartsPanel";

function Dashboard() {
  const [sectors, setSectors] = useState([]);
  const [selectedSector, setSelectedSector] = useState("IT");
  const [sectorStocks, setSectorStocks] = useState([]);
  const [portfolio, setPortfolio] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const loadSectors = async () => {
    const response = await api.get("/sectors/");
    const sectorList = response.data.sectors || [];
    setSectors(sectorList);
    if (!selectedSector && sectorList.length > 0) {
      setSelectedSector(sectorList[0]);
    }
  };

  const loadPortfolio = async () => {
    const response = await api.get("/portfolio/");
    setPortfolio(response.data);
  };

  const loadAnalytics = async () => {
    const response = await api.get("/portfolio/analytics/");
    setAnalytics(response.data);
  };

  const loadStocksBySector = async (sectorName) => {
    if (!sectorName) return;
    const response = await api.get(`/stocks/by-sector/${sectorName}/`);
    setSectorStocks(response.data);
  };

  useEffect(() => {
    const init = async () => {
      setError("");
      try {
        await Promise.all([loadSectors(), loadPortfolio(), loadAnalytics()]);
      } catch {
        setError("Failed to load dashboard data.");
      }
    };
    init();
  }, []);

  useEffect(() => {
    const fetchSector = async () => {
      setError("");
      try {
        await loadStocksBySector(selectedSector);
      } catch {
        setError("Failed to load stocks for selected sector.");
      }
    };
    fetchSector();
  }, [selectedSector]);

  const refreshPortfolioData = async () => {
    await Promise.all([loadPortfolio(), loadAnalytics()]);
  };

  const handleAddStock = async (symbol, quantity) => {
    try {
      const response = await api.post("/portfolio/add/", {
        symbol,
        quantity
      });
      setPortfolio(response.data);
      await loadAnalytics();
    } catch (error) {
      setError(error?.response?.data?.detail || "Failed to add stock.");
    }
  };

  const handleRemoveStock = async (stockId) => {
    try {
      const response = await api.delete("/portfolio/remove/", {
        data: { stock_id: stockId }
      });
      setPortfolio(response.data);
      await loadAnalytics();
    } catch (error) {
      setError(error?.response?.data?.detail || "Failed to remove stock.");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    navigate("/login");
  };

  return (
    <div className="container">
      <div className="dashboard-header premium-header">
        <div>
          <h1>Smart Portfolio Dashboard</h1>
          <p>Sector-driven market intelligence with live Yahoo Finance data</p>
        </div>
        <div className="header-actions">
          <button onClick={refreshPortfolioData}>Refresh</button>
          <button onClick={handleLogout} className="danger-btn">
            Logout
          </button>
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      <AnalyticsCards analytics={analytics} />

      <div className="grid">
        <div className="card">
          <h2>Choose Sector</h2>
          <select
            value={selectedSector}
            onChange={(e) => setSelectedSector(e.target.value)}
          >
            {sectors.map((sector) => (
              <option key={sector} value={sector}>
                {sector}
              </option>
            ))}
          </select>
          <div className="stock-grid">
            {sectorStocks.map((stock) => (
              <StockCard key={stock.symbol} stock={stock} onAdd={handleAddStock} />
            ))}
          </div>
        </div>
      </div>

      <div className="card">
        <h2>My Portfolio</h2>
        <PortfolioTable
          items={portfolio?.stocks || []}
          totalValue={portfolio?.total_value || 0}
          onRemove={handleRemoveStock}
        />
      </div>

      <ChartsPanel analytics={analytics} portfolioStocks={portfolio?.stocks || []} />
    </div>
  );
}

export default Dashboard;
