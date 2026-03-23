import { useEffect, useMemo, useState } from "react";
import { Bar } from "react-chartjs-2";
import { useNavigate, useParams } from "react-router-dom";
import api from "../api/axios";
import AppShell from "../components/AppShell";
import MetricCard from "../components/MetricCard";
import PortfolioTable from "../components/PortfolioTable";
import SearchPicker from "../components/SearchPicker";
import { useCurrencyPreference } from "../context/CurrencyContext";
import { ensureArray } from "../lib/api";
import { createChartOptions } from "../lib/chartSetup";
import { formatMoney } from "../lib/currency";

const GROWTH_RANGES = ["1W", "1M", "3M", "6M", "1Y", "3Y"];

function Dashboard() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [portfolios, setPortfolios] = useState([]);
  const [selectedPortfolioId, setSelectedPortfolioId] = useState(id || "");
  const [portfolioName, setPortfolioName] = useState("");
  const [portfolioSector, setPortfolioSector] = useState("");
  const [countries, setCountries] = useState([]);
  const [countryQuery, setCountryQuery] = useState("");
  const [selectedCountryId, setSelectedCountryId] = useState("");
  const [sectors, setSectors] = useState([]);
  const [sectorQuery, setSectorQuery] = useState("");
  const [selectedSectorId, setSelectedSectorId] = useState("");
  const [sectorStocks, setSectorStocks] = useState([]);
  const [portfolio, setPortfolio] = useState(null);
  const [topDiscount, setTopDiscount] = useState(null);
  const [topGrowth, setTopGrowth] = useState(null);
  const [growthRange, setGrowthRange] = useState("1M");
  const [selectedTicker, setSelectedTicker] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const { currency } = useCurrencyPreference();

  const filteredCountries = useMemo(() => {
    const query = countryQuery.trim().toLowerCase();
    return countries.filter((item) => !query || item.name.toLowerCase().includes(query));
  }, [countries, countryQuery]);

  const filteredSectors = useMemo(() => {
    const query = sectorQuery.trim().toLowerCase();
    return sectors.filter((item) => !query || item.name.toLowerCase().includes(query));
  }, [sectors, sectorQuery]);

  const totalValue = useMemo(
    () => (portfolio?.stocks || []).reduce((sum, item) => sum + Number(item.position_value || 0), 0),
    [portfolio]
  );

  const selectedCountry = countries.find((item) => String(item.id) === String(selectedCountryId));
  const selectedSector = sectors.find((item) => String(item.id) === String(selectedSectorId));

  const discountChart = {
    labels: (topDiscount?.items || []).map((item) => item.ticker),
    datasets: [
      {
        label: "Discount Level",
        data: (topDiscount?.items || []).map((item) => item.discount_level),
        borderRadius: 12,
        backgroundColor: ["#22c55e", "#38bdf8", "#f59e0b", "#8b5cf6", "#fb7185"]
      }
    ]
  };

  const growthChart = {
    labels: (topGrowth?.items || []).map((item) => item.ticker),
    datasets: [
      {
        label: `${growthRange} Growth`,
        data: (topGrowth?.items || []).map((item) => item.growth_return),
        borderRadius: 12,
        backgroundColor: ["#38bdf8", "#4ade80", "#f59e0b", "#8b5cf6", "#fb7185"]
      }
    ]
  };

  const loadPortfolios = async () => {
    const response = await api.get("/portfolios/");
    const list = ensureArray(response.data);
    setPortfolios(list);
    return list;
  };

  const loadCountries = async () => {
    const response = await api.get("/countries/");
    const list = ensureArray(response.data);
    setCountries(list);
    return list;
  };

  const loadWorkspace = async (portfolioId, rangeCode = growthRange) => {
    if (!portfolioId) {
      setPortfolio(null);
      setTopDiscount(null);
      setTopGrowth(null);
      return;
    }

    const [portfolioResponse, discountResponse, growthResponse] = await Promise.all([
      api.get(`/portfolios/${portfolioId}/`),
      api.get(`/portfolios/${portfolioId}/top-discount/`),
      api.get(`/portfolios/${portfolioId}/top-growth/`, { params: { range: rangeCode } })
    ]);
    setPortfolio(portfolioResponse.data);
    setTopDiscount(discountResponse.data);
    setTopGrowth(growthResponse.data);
  };

  useEffect(() => {
    const init = async () => {
      setError("");
      setIsLoading(true);
      try {
        const [portfolioList, countryList] = await Promise.all([loadPortfolios(), loadCountries()]);
        const initialId = id || portfolioList[0]?.id ? String(id || portfolioList[0]?.id || "") : "";
        if (initialId) {
          setSelectedPortfolioId(initialId);
          await loadWorkspace(initialId);
        }
        if (countryList[0]?.id) {
          setSelectedCountryId(String(countryList[0].id));
        }
      } catch (err) {
        setError(err?.response?.data?.detail || "Failed to load dashboard.");
      } finally {
        setIsLoading(false);
      }
    };
    init();
  }, [id]);

  useEffect(() => {
    if (!selectedPortfolioId) {
      return;
    }

    const load = async () => {
      setError("");
      try {
        await loadWorkspace(selectedPortfolioId, growthRange);
      } catch (err) {
        setError(err?.response?.data?.detail || "Failed to load portfolio workspace.");
      }
    };

    load();
  }, [selectedPortfolioId, growthRange]);

  useEffect(() => {
    if (!selectedCountryId) {
      setSectors([]);
      setSelectedSectorId("");
      return;
    }

    const loadSectors = async () => {
      try {
        const response = await api.get(`/sectors/${selectedCountryId}/`);
        const list = ensureArray(response.data);
        setSectors(list);
        setSelectedSectorId((current) =>
          list.some((item) => String(item.id) === String(current)) ? current : String(list[0]?.id || "")
        );
      } catch {
        setSectors([]);
        setSelectedSectorId("");
      }
    };

    loadSectors();
  }, [selectedCountryId]);

  useEffect(() => {
    if (!selectedSectorId || !selectedSector?.name) {
      setSectorStocks([]);
      return;
    }

    const loadSectorStocks = async () => {
      try {
        const sectorName = encodeURIComponent(selectedSector.name);
        const response = await api.get(`/stocks/by-sector/${sectorName}/`);
        const list = ensureArray(response.data);
        setSectorStocks(list);
        setSelectedTicker((current) =>
          list.some((item) => (item.symbol || item.ticker) === current) ? current : ""
        );
      } catch {
        setSectorStocks([]);
        setSelectedTicker("");
      }
    };

    loadSectorStocks();
  }, [selectedSectorId, selectedSector?.name]);

  const handleCreatePortfolio = async () => {
    setError("");
    try {
      const response = await api.post("/portfolios/", {
        name: portfolioName.trim(),
        sector: portfolioSector.trim()
      });
      const created = response.data;
      await loadPortfolios();
      setPortfolioName("");
      setPortfolioSector("");
      setSelectedPortfolioId(String(created.id));
      navigate(`/portfolio/${created.id}`);
    } catch (err) {
      setError(err?.response?.data?.detail || "Failed to create portfolio.");
    }
  };

  const handleDeletePortfolio = async () => {
    if (!selectedPortfolioId) {
      return;
    }
    setError("");
    try {
      await api.delete(`/portfolios/${selectedPortfolioId}/`);
      const list = await loadPortfolios();
      const nextId = list[0]?.id ? String(list[0].id) : "";
      setSelectedPortfolioId(nextId);
      if (nextId) {
        navigate(`/portfolio/${nextId}`);
      } else {
        navigate("/dashboard");
        setPortfolio(null);
        setTopDiscount(null);
        setTopGrowth(null);
      }
    } catch (err) {
      setError(err?.response?.data?.detail || "Failed to delete portfolio.");
    }
  };

  const handleAddStock = async () => {
    if (!selectedPortfolioId || !selectedTicker) {
      setError("Select a portfolio and stock first.");
      return;
    }
    setError("");
    try {
      await api.post("/stocks/", {
        portfolio_id: Number(selectedPortfolioId),
        ticker: selectedTicker,
        quantity: Number(quantity)
      });
      setSelectedTicker("");
      await loadWorkspace(selectedPortfolioId, growthRange);
    } catch (err) {
      setError(err?.response?.data?.detail || "Failed to add stock.");
    }
  };

  const handleRemoveStock = async (stockId) => {
    setError("");
    try {
      await api.delete(`/stocks/${stockId}/`, {
        params: { portfolio_id: selectedPortfolioId }
      });
      await loadWorkspace(selectedPortfolioId, growthRange);
    } catch (err) {
      setError(err?.response?.data?.detail || "Failed to remove stock.");
    }
  };

  const actions = (
    <>
      <select
        value={selectedPortfolioId}
        onChange={(event) => {
          const nextId = event.target.value;
          setSelectedPortfolioId(nextId);
          if (nextId) {
            navigate(`/portfolio/${nextId}`);
          }
        }}
      >
        {portfolios.length === 0 ? <option value="">No portfolios</option> : null}
        {portfolios.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </select>
      <button className="secondary-btn" onClick={handleDeletePortfolio} disabled={!selectedPortfolioId}>
        Delete Portfolio
      </button>
    </>
  );

  return (
    <AppShell
      title="Portfolio Dashboard"
      subtitle="Create user-specific portfolios, choose country and sector filters, then add stocks while keeping the current workspace style intact."
      actions={actions}
      error={error}
    >
      <section className="builder-card glass-card">
        <div className="section-head">
          <div>
            <p className="panel-kicker">Portfolio Flow</p>
            <h2>Build and Manage Portfolios</h2>
          </div>
        </div>

        <div className="builder-grid">
          <div className="builder-step compact-step">
            <span className="step-tag">01</span>
            <h3>Create Portfolio</h3>
            <p>Name it and optionally set a sector focus.</p>
            <input
              type="text"
              placeholder="Portfolio name"
              value={portfolioName}
              onChange={(event) => setPortfolioName(event.target.value)}
            />
            <input
              type="text"
              placeholder="Sector"
              value={portfolioSector}
              onChange={(event) => setPortfolioSector(event.target.value)}
            />
            <button onClick={handleCreatePortfolio}>Create Portfolio</button>
          </div>

          <div className="builder-step compact-step">
            <span className="step-tag">02</span>
            <h3>Choose Country and Sector</h3>
            <p>Select the country market and sector first, then move to the stock picker.</p>
            <SearchPicker
              title="Country"
              placeholder="Select country"
              query={countryQuery}
              onQueryChange={setCountryQuery}
              options={filteredCountries}
              selectedId={selectedCountryId}
              selectedOption={selectedCountry}
              onSelect={setSelectedCountryId}
              getLabel={(item) => item.name}
              getMeta={() => "Country stock universe"}
              emptyMessage="No countries available."
            />
            <SearchPicker
              title="Sector"
              placeholder="Select sector"
              query={sectorQuery}
              onQueryChange={setSectorQuery}
              options={filteredSectors}
              selectedId={selectedSectorId}
              selectedOption={selectedSector}
              onSelect={setSelectedSectorId}
              getLabel={(item) => item.name}
              getMeta={() => "Sector filter"}
              disabled={!selectedCountryId}
              emptyMessage="Choose a country to load sectors."
            />
          </div>

          <div className="builder-step compact-step">
            <span className="step-tag">03</span>
            <h3>Select Stock</h3>
            <p>Choose a stock from the selected sector list.</p>
            <select
              value={selectedTicker}
              onChange={(event) => setSelectedTicker(event.target.value)}
              disabled={!selectedSectorId || sectorStocks.length === 0}
            >
              <option value="">
                {!selectedSectorId ? "Select a sector first" : "Select stock"}
              </option>
              {sectorStocks.map((item) => {
                const ticker = item.symbol || item.ticker;
                const name = item.name || item.company_name;
                if (!ticker) {
                  return null;
                }
                return (
                  <option key={ticker} value={ticker}>
                    {ticker} {name ? `- ${name}` : ""}
                  </option>
                );
              })}
            </select>
          </div>

          <div className="builder-step compact-step">
            <span className="step-tag">04</span>
            <h3>Add Quantity</h3>
            <p>The backend stores refreshed price, min/max, PE, EPS, market cap, intrinsic value, discount, and opportunity score.</p>
            <input
              type="number"
              min="1"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
            />
            <div className="summary-list">
              <div><span>Active portfolio</span><strong>{portfolio?.name || "-"}</strong></div>
              <div><span>Country</span><strong>{selectedCountry?.name || "-"}</strong></div>
              <div><span>Sector</span><strong>{selectedSector?.name || "-"}</strong></div>
              <div><span>Selected ticker</span><strong>{selectedTicker || "-"}</strong></div>
            </div>
          </div>

          <div className="builder-step compact-step">
            <span className="step-tag">05</span>
            <h3>Track Analytics</h3>
            <p>Portfolio detail auto-refreshes holdings from yfinance every time the workspace reloads.</p>
            <button onClick={handleAddStock} disabled={!selectedPortfolioId || !selectedTicker}>
              Add Selected Stock
            </button>
            <button
              className="secondary-btn"
              onClick={() => selectedPortfolioId && navigate("/growth")}
              disabled={!selectedPortfolioId}
            >
              Open Growth Analytics
            </button>
          </div>
        </div>
      </section>

      <section className="analytics-strip">
        <MetricCard eyebrow="Holdings Count" value={portfolio?.summary?.holdings_count || 0} tone="blue" />
        <MetricCard eyebrow="Average Discount" value={`${Number(portfolio?.summary?.average_discount || 0).toFixed(2)}%`} tone="emerald" />
        <MetricCard eyebrow="Undervalued Stocks" value={portfolio?.summary?.undervalued_count || 0} tone="amber" />
        <MetricCard
          eyebrow="Top Pick"
          value={portfolio?.summary?.top_pick?.ticker || "-"}
          detail={`Avg score ${Number(portfolio?.summary?.average_opportunity_score || 0).toFixed(2)}`}
          tone="violet"
        />
      </section>

      <section className="chart-card">
        <div className="section-head compact">
          <div>
            <p className="panel-kicker">Live Holdings</p>
            <h2>Portfolio Table</h2>
          </div>
        </div>
        {isLoading ? (
          <p className="metric-label">Loading portfolio data...</p>
        ) : (
          <PortfolioTable
            items={portfolio?.stocks || []}
            totalValue={totalValue}
            onRemove={handleRemoveStock}
            onOpen={(stockId) => navigate(`/stock/${stockId}`)}
            formatMoney={(value) => formatMoney(value, currency)}
          />
        )}
      </section>

      <section className="dashboard-charts-grid">
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

        <div className="chart-card">
          <div className="section-head compact">
            <div>
              <p className="panel-kicker">Chart.js</p>
              <h3>Top Growth Stocks</h3>
            </div>
            <select value={growthRange} onChange={(event) => setGrowthRange(event.target.value)}>
              {GROWTH_RANGES.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
          <div className="chart-canvas">
            <Bar data={growthChart} options={createChartOptions()} />
          </div>
        </div>
      </section>
    </AppShell>
  );
}

export default Dashboard;

