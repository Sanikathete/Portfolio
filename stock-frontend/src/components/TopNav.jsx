import { NavLink } from "react-router-dom";

const NAV_ITEMS = [
  { to: "/home", label: "Home" },
  { to: "/dashboard", label: "My Dashboard" },
  { to: "/growth", label: "Growth" },
  { to: "/ml-analysis", label: "ML Analysis" },
  { to: "/metals", label: "Gold Silver" },
  { to: "/bitcoin", label: "Bitcoin" },
  { to: "/compare", label: "Compare" }
];

function TopNav() {
  return (
    <nav className="top-nav">
      <div className="brand-lockup">
        <p className="brand-kicker">Fintech Intelligence</p>
        <h2>Portfolyze</h2>
      </div>
      <div className="top-nav-links">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => `nav-chip${isActive ? " active" : ""}`}
          >
            {item.label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

export default TopNav;
