import { useEffect, useMemo, useState } from "react";
import { Bar, Line, Radar } from "react-chartjs-2";
import api from "../api/axios";
import AppShell from "../components/AppShell";
import MetricCard from "../components/MetricCard";
import PortfolioTable from "../components/PortfolioTable";
import SearchPicker from "../components/SearchPicker";
import { useCurrencyPreference } from "../context/CurrencyContext";
import { createChartOptions } from "../lib/chartSetup";
import { formatMoney } from "../lib/currency";

function Dashboard() {
  const [countries, setCountries] = useState([]);
  const [selectedCountryId, setSelectedCountryId] = useState("");
  const [countryQuery, setCountryQuery] = useState("");
  const [sectors, setSectors] = useState([]);
  const [selectedSectorId, setSelectedSectorId] = useState("");
  const [sectorQuery, setSectorQuery] = useState("");
  const [stocks, setStocks] = useState([]);
  const [selectedStockId, setSelectedStockId] = useState("");
  const [stockQuery, setStockQuery] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [portfolios, setPortfolios] = useState([]);
  const [selectedPortfolioId, setSelectedPortfolioId] = useState("");
  const [portfolioName, setPortfolioName] = useState("");
  const [portfolio, setPortfolio] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const selectedCountry = countries.find((country) => String(country.id) === String(selectedCountryId));
  const selectedSector = sectors.find((sector) => String(sector.id) === String(selectedSectorId));
  const { currency } = useCurrencyPreference(selectedCountry?.name);
  const filteredCountries = useMemo(() => {
    const query = countryQuery.trim().toLowerCase();
    return countries.filter((country) => !query || country.name.toLowerCase().includes(query));
  }, [countries, countryQuery]);
  const filteredSectors = useMemo(() => {
    const query = sectorQuery.trim().toLowerCase();
    return sectors.filter((sector) => !query || sector.name.toLowerCase().includes(query));
  }, [sectors, sectorQuery]);
  const filteredStocks = useMemo(() => {
    const query = stockQuery.trim().toLowerCase();
    const matchingStocks = stocks.filter(
      (stock) =>
        !query ||
        stock.name.toLowerCase().includes(query) ||
        stock.symbol.toLowerCase().includes(query)
    );
    if (!query) {
      return matchingStocks;
    }

    const hasExactSymbol = matchingStocks.some((stock) => stock.symbol.toLowerCase() === query);
    if (hasExactSymbol || !/^[a-z0-9.=/-]{1,15}$/i.test(query)) {
      return matchingStocks;
    }

    return [
      {
        id: `manual-${query.toUpperCase()}`,
        name: "Live symbol lookup",
        symbol: query.toUpperCase()
      },
      ...matchingStocks
    ];
  }, [stocks, stockQuery]);
  const selectedStock =
    filteredStocks.find((stock) => String(stock.id) === String(selectedStockId))
    || stocks.find((stock) => String(stock.id) === String(selectedStockId));

  const portfolioQuery = (portfolioId) => (portfolioId ? { params: { portfolio_id: portfolioId } } : {});
  const money = (value) => formatMoney(value, currency);

  const loadPortfolios = async () => {
    const response = await api.get("/portfolios/");
    const list = response.data.portfolios || [];
    setPortfolios(list);
    if (list.length > 0 && !selectedPortfolioId) {
      setSelectedPortfolioId(String(list[0].id));
    }
    return list;
  };

  const loadCountries = async () => {
    const response = await api.get("/countries/");
    const list = response.data || [];
    setCountries(list);
    if (list.length > 0 && !selectedCountryId) {
      setSelectedCountryId(String(list[0].id));
    }
    return list;
  };

  const loadPortfolioWorkspace = async (portfolioId) => {
    const [portfolioResponse, analyticsResponse] = await Promise.all([
      api.get("/portfolio/", portfolioQuery(portfolioId)),
      api.get("/portfolio/analytics/", portfolioQuery(portfolioId))
    ]);
    setPortfolio(portfolioResponse.data);
    setAnalytics(analyticsResponse.data);
  };

  useEffect(() => {
    const init = async () => {
      setError("");
      setIsLoading(true);
      try {
        const [countryList, portfolioList] = await Promise.all([loadCountries(), loadPortfolios()]);
        const firstPortfolioId = portfolioList[0]?.id;
        if (firstPortfolioId) {
          await loadPortfolioWorkspace(firstPortfolioId);
        }
        const preferredCountry =
          countryList.find((item) => item.name === "United States") ||
          countryList.find((item) => item.name === "USA") ||
          countryList[0];
        if (preferredCountry) {
          setSelectedCountryId(String(preferredCountry.id));
        }
      } catch (err) {
        setError(err?.response?.data?.detail || "Failed to load dashboard workspace.");
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
      try {
        await loadPortfolioWorkspace(selectedPortfolioId);
      } catch (err) {
        setError(err?.response?.data?.detail || "Failed to load portfolio.");
      }
    };

    load();
  }, [selectedPortfolioId]);

  useEffect(() => {
    if (!selectedCountryId) {
      return;
    }

    const loadSectors = async () => {
      setError("");
      setSectorQuery("");
      setStockQuery("");
      try {
        const response = await api.get(`/sectors/${selectedCountryId}/`);
        const list = response.data || [];
        setSectors(list);
        setSelectedSectorId(list[0] ? String(list[0].id) : "");
      } catch (err) {
        setError(err?.response?.data?.detail || "Failed to load sectors.");
        setSectors([]);
        setSelectedSectorId("");
      }
    };

    loadSectors();
  }, [selectedCountryId]);

  useEffect(() => {
    if (!selectedSectorId) {
      setStocks([]);
      setSelectedStockId("");
      return;
    }

    const loadStocks = async () => {
      setError("");
      setStockQuery("");
      try {
        const response = await api.get(`/stocks/${selectedSectorId}/`);
        const list = response.data || [];
        setStocks(list);
        setSelectedStockId(list[0] ? String(list[0].id) : "");
      } catch (err) {
        setError(err?.response?.data?.detail || "Failed to load stocks.");
        setStocks([]);
        setSelectedStockId("");
      }
    };

    loadStocks();
  }, [selectedSectorId]);

  const handleCreatePortfolio = async () => {
    setError("");
    try {
      const response = await api.post("/portfolios/", { name: portfolioName.trim() });
      const created = response.data;
      const updatedPortfolios = await loadPortfolios();
      setPortfolioName("");
      setSelectedPortfolioId(String(created.id || updatedPortfolios[0]?.id || ""));
      await loadPortfolioWorkspace(created.id);
    } catch (err) {
      setError(err?.response?.data?.detail || "Failed to create portfolio.");
    }
  };

  const handleAddStock = async () => {
    if (!selectedPortfolioId) {
      setError("Create a portfolio before adding a stock.");
      return;
    }
    if (!selectedStockId) {
      setError("Select a stock first.");
      return;
    }

    setError("");
    try {
      const stockToAdd =
        filteredStocks.find((item) => String(item.id) === String(selectedStockId))
        || stocks.find((item) => String(item.id) === String(selectedStockId));
      if (!stockToAdd?.symbol) {
        setError("Selected stock is invalid.");
        return;
      }

      await api.post("/portfolio/add/", {
        portfolio_id: Number(selectedPortfolioId),
        symbol: stockToAdd.symbol,
        quantity: Number(quantity)
      });
      await loadPortfolioWorkspace(selectedPortfolioId);
    } catch (err) {
      setError(err?.response?.data?.detail || "Failed to add stock.");
    }
  };

  const handleRemoveStock = async (stockId) => {
    setError("");
    try {
      await api.delete("/portfolio/remove/", {
        data: { portfolio_id: selectedPortfolioId, stock_id: stockId }
      });
      await loadPortfolioWorkspace(selectedPortfolioId);
    } catch (err) {
      setError(err?.response?.data?.detail || "Failed to remove stock.");
    }
  };

  const handleRefresh = async () => {
    if (!selectedPortfolioId) {
      return;
    }
    setError("");
    try {
      await loadPortfolioWorkspace(selectedPortfolioId);
    } catch (err) {
      setError(err?.response?.data?.detail || "Failed to refresh portfolio.");
    }
  };

  const portfolioStocks = portfolio?.stocks || [];
  const profitLossChart = {
    labels: portfolioStocks.map((item) => item.stock.symbol),
    datasets: [
      {
        label: "Profit / Loss",
        data: portfolioStocks.map((item) => Number(item.profit_loss || 0)),
        backgroundColor: portfolioStocks.map((item) =>
          Number(item.profit_loss || 0) >= 0 ? "rgba(34,197,94,0.75)" : "rgba(248,113,113,0.75)"
        ),
        borderRadius: 12
      }
    ]
  };

  const discountChart = {
    labels: portfolioStocks.map((item) => item.stock.symbol),
    datasets: [
      {
        label: "Discount %",
        data: portfolioStocks.map((item) => Number(item.discount_percent || 0)),
        borderColor: "#38bdf8",
        backgroundColor: "rgba(56,189,248,0.18)",
        fill: true,
        tension: 0.35
      }
    ]
  };

  const opportunityChart = {
    labels: (analytics?.opportunity_distribution || []).map((item) => item.symbol),
    datasets: [
      {
        label: "Opportunity Value",
        data: (analytics?.opportunity_distribution || []).map((item) => Number(item.opportunity_value || 0)),
        backgroundColor: "rgba(250,204,21,0.78)",
        borderRadius: 10
      }
    ]
  };

  const peRatioChart = {
    labels: portfolioStocks.map((item) => item.stock.symbol),
    datasets: [
      {
        label: "P/E Ratio",
        data: portfolioStocks.map((item) => Number(item.pe_ratio || 0)),
        backgroundColor: "rgba(167,139,250,0.22)",
        borderColor: "#a78bfa",
        pointBackgroundColor: "#a78bfa",
        pointBorderColor: "#c4b5fd",
        fill: true
      }
    ]
  };

  const actions = (
    <>
      <button className="secondary-btn" onClick={handleCreatePortfolio}>
        Create Portfolio
      </button>
      <button onClick={handleRefresh}>Refresh</button>
    </>
  );

  return (
    <AppShell
      title="My Dashboard"
      subtitle="Build portfolios, choose country and sector exposure, and monitor live holdings with professional-grade analytics."
      actions={actions}
      error={error}
      currencyCountryName={selectedCountry?.name}
    >
      <section className="glass-card builder-card">
        <div className="section-head">
          <div>
            <p className="panel-kicker">Portfolio Flow</p>
            <h2>My Dashboard</h2>
          </div>
        </div>

        <div className="builder-toolbar">
          <select value={selectedPortfolioId} onChange={(event) => setSelectedPortfolioId(event.target.value)}>
            {portfolios.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} ({item.holdings_count})
              </option>
            ))}
          </select>
          <input
            type="text"
            placeholder="New portfolio name"
            value={portfolioName}
            onChange={(event) => setPortfolioName(event.target.value)}
          />
          <button className="secondary-btn" onClick={handleCreatePortfolio}>
            Create Portfolio
          </button>
        </div>

        <div className="builder-grid">
          <div className="builder-step">
            <span className="step-tag">01</span>
            <p>Pick the market you want to buy from. Calculations display in that country currency.</p>
            <SearchPicker
              title="Select Country"
              placeholder="Search country"
              query={countryQuery}
              onQueryChange={setCountryQuery}
              options={filteredCountries}
              selectedId={selectedCountryId}
              selectedOption={selectedCountry}
              onSelect={setSelectedCountryId}
              emptyMessage="No countries match your search."
            />
            <div className="currency-banner">
              <span>{currency.code}</span>
              <p>All displayed calculations use this currency mode.</p>
            </div>
          </div>

          <div className="builder-step">
            <span className="step-tag">02</span>
            <SearchPicker
              title="Choose Sector"
              placeholder="Search sector"
              query={sectorQuery}
              onQueryChange={setSectorQuery}
              options={filteredSectors}
              selectedId={selectedSectorId}
              selectedOption={selectedSector}
              onSelect={setSelectedSectorId}
              disabled={!selectedCountryId}
              emptyMessage="No sectors available for this market."
            />
          </div>

          <div className="builder-step">
            <span className="step-tag">03</span>
            <SearchPicker
              title="Select Stock"
              placeholder="Search stock or symbol"
              query={stockQuery}
              onQueryChange={setStockQuery}
              options={filteredStocks}
              selectedId={selectedStockId}
              selectedOption={selectedStock}
              onSelect={setSelectedStockId}
              getLabel={(stock) => stock.symbol}
              getMeta={(stock) => stock.name}
              disabled={!selectedSectorId}
              emptyMessage="No stocks match this sector search."
            />
          </div>

          <div className="builder-step">
            <span className="step-tag">04</span>
            <h3>Add To Portfolio</h3>
            <p>Choose a stock and quantity, then add it directly into your active portfolio.</p>
            <input
              type="number"
              min="1"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
            />
            <button onClick={handleAddStock}>Add Selected Stock</button>
          </div>
        </div>
      </section>

      <section className="analytics-strip">
        <MetricCard eyebrow="Current Portfolio Value" value={money(portfolio?.total_value || 0)} tone="blue" />
        <MetricCard eyebrow="Total Profit / Loss" value={money(analytics?.total_profit_loss || 0)} tone="emerald" />
        <MetricCard eyebrow="Average P/E Ratio" value={Number(analytics?.average_pe_ratio || 0).toFixed(2)} tone="violet" />
        <MetricCard eyebrow="Country Currency" value={currency.code} tone="amber" />
      </section>

      <section className="glass-card">
        <div className="section-head">
          <div>
            <p className="panel-kicker">Live Holdings</p>
            <h2>Portfolio Analysis Table</h2>
          </div>
        </div>
        {isLoading ? (
          <p className="metric-label">Loading portfolio data...</p>
        ) : (
          <PortfolioTable
            items={portfolioStocks}
            totalValue={portfolio?.total_value || 0}
            onRemove={handleRemoveStock}
            formatMoney={money}
          />
        )}
      </section>

      <section className="dashboard-charts-grid">
        <div className="chart-card">
          <div className="section-head compact">
            <div>
              <p className="panel-kicker">Chart.js</p>
              <h3>Profit and Loss</h3>
            </div>
          </div>
          <div className="chart-canvas">
            <Bar data={profitLossChart} options={createChartOptions()} />
          </div>
        </div>

        <div className="chart-card">
          <div className="section-head compact">
            <div>
              <p className="panel-kicker">Chart.js</p>
              <h3>Discount Trend</h3>
            </div>
          </div>
          <div className="chart-canvas">
            <Line data={discountChart} options={createChartOptions()} />
          </div>
        </div>

        <div className="chart-card">
          <div className="section-head compact">
            <div>
              <p className="panel-kicker">Chart.js</p>
              <h3>Opportunity Value</h3>
            </div>
          </div>
          <div className="chart-canvas">
            <Bar data={opportunityChart} options={createChartOptions()} />
          </div>
        </div>

        <div className="chart-card">
          <div className="section-head compact">
            <div>
              <p className="panel-kicker">Chart.js</p>
              <h3>P/E Ratio</h3>
            </div>
          </div>
          <div className="chart-canvas">
            <Radar
              data={peRatioChart}
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
      </section>
    </AppShell>
  );
}

export default Dashboard;
