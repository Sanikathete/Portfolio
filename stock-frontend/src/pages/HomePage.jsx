import { useNavigate } from "react-router-dom";
import AppShell from "../components/AppShell";
import TrendingPanel from "../components/TrendingPanel";
import { hasAuthToken } from "../lib/auth";

function HomePage() {
  const navigate = useNavigate();
  const authenticated = hasAuthToken();

  const actions = (
    <>
      <button onClick={() => navigate(authenticated ? "/dashboard" : "/login")}>Start Portfolio</button>
      <button className="secondary-btn" onClick={() => navigate(authenticated ? "/growth" : "/signup")}>
        {authenticated ? "Open Growth" : "Create Account"}
      </button>
    </>
  );

  return (
    <AppShell
      title="Portfolyze"
      subtitle="A premium portfolio analytics platform for building conviction, tracking live positions, and comparing opportunities across stocks, metals, and crypto."
      actions={actions}
      requireAuth={false}
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
            <button onClick={() => navigate(authenticated ? "/dashboard" : "/login")}>Start Portfolio</button>
            <button className="secondary-btn" onClick={() => navigate(authenticated ? "/growth" : "/signup")}>
              Explore Growth
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
            <span>Portfolio Detail</span>
            <strong>Deep stock snapshots and charts</strong>
          </div>
          <div className="side-stat">
            <span>Features</span>
            <strong>Discount, growth, and risk clustering</strong>
          </div>
          <div className="side-stat">
            <span>Gold and Silver</span>
            <strong>3-year metals explorer</strong>
          </div>
          <div className="side-stat">
            <span>Crypto</span>
            <strong>BTC forecast with model selection</strong>
          </div>
          <p className="panel-footnote">Use the top navigation to move across each Portfolyze workspace.</p>
        </div>
      </section>
    </AppShell>
  );
}

export default HomePage;
