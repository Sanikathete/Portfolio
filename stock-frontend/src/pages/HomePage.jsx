import { useNavigate } from "react-router-dom";
import AppShell from "../components/AppShell";
import TrendingPanel from "../components/TrendingPanel";

function HomePage() {
  const navigate = useNavigate();

  const actions = (
    <>
      <button onClick={() => navigate("/dashboard")}>Start Portfolio</button>
      <button className="secondary-btn" onClick={() => navigate("/growth")}>
        View Growth
      </button>
    </>
  );

  return (
    <AppShell
      title="Portfolyze"
      subtitle="A premium portfolio analytics platform for building conviction, tracking live positions, and comparing opportunities across stocks, metals, and crypto."
      actions={actions}
    >
      <section className="hero-grid">
        <TrendingPanel />

        <div className="hero-center glass-card">
          <p className="panel-kicker">Main Page</p>
          <h2>Build Your Own Portfolio</h2>
          <p>
            Design your allocation, move through country and sector selection, and step into a
            polished fintech experience inspired by professional trading dashboards.
          </p>

          <div className="hero-actions">
            <button onClick={() => navigate("/dashboard")}>Start Portfolio</button>
            <button className="secondary-btn" onClick={() => navigate("/ml-analysis")}>
              Explore ML Analysis
            </button>
          </div>
        </div>

        <div className="hero-side glass-card">
          <p className="panel-kicker">Platform Preview</p>
          <h3>What You Can Explore</h3>
          <div className="side-stat">
            <span>My Dashboard</span>
            <strong>Build and manage holdings</strong>
          </div>
          <div className="side-stat">
            <span>Growth</span>
            <strong>Current and projected portfolio value</strong>
          </div>
          <div className="side-stat">
            <span>ML Analysis</span>
            <strong>K-cluster, regression, ARIMA</strong>
          </div>
          <div className="side-stat">
            <span>Gold, Silver, Bitcoin</span>
            <strong>Alternative asset intelligence</strong>
          </div>
          <div className="side-stat">
            <span>Compare</span>
            <strong>Which asset is more beneficial?</strong>
          </div>
          <p className="panel-footnote">Use the top navigation to move across each Portfolyze workspace.</p>
        </div>
      </section>
    </AppShell>
  );
}

export default HomePage;
