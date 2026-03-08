import { useNavigate } from "react-router-dom";
import api from "../api/axios";
import TopNav from "./TopNav";
import { useCurrencyPreference } from "../context/CurrencyContext";

function AppShell({ title, subtitle, actions = null, error = "", children, currencyCountryName = "" }) {
  const navigate = useNavigate();
  const { selectedCode, setSelectedCode, currency } = useCurrencyPreference(currencyCountryName);

  const handleLogout = () => {
    api.post("/logout/").catch(() => null);
    navigate("/login");
  };

  return (
    <div className="app-shell">
      <div className="ambient ambient-a" />
      <div className="ambient ambient-b" />
      <div className="ambient ambient-c" />

      <div className="container">
      <TopNav />

      <div className="dashboard-header premium-header page-header">
        <div className="page-copy">
          <p className="page-kicker">Portfolyze Workspace</p>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
        <div className="header-actions">
          <select value={selectedCode} onChange={(event) => setSelectedCode(event.target.value)}>
            <option value="AUTO">Auto ({currency.code})</option>
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
            <option value="GBP">GBP</option>
            <option value="INR">INR</option>
            <option value="JPY">JPY</option>
            <option value="AUD">AUD</option>
            <option value="CAD">CAD</option>
            <option value="SGD">SGD</option>
            <option value="CNY">CNY</option>
          </select>
          {actions}
          <button onClick={handleLogout} className="danger-btn">
            Logout
          </button>
        </div>
      </div>

      {error && <p className="error">{error}</p>}
      {children}
      </div>
    </div>
  );
}

export default AppShell;
