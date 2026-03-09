import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import api from "./api/axios";
import "./lib/chartSetup";
import { hasAuthToken } from "./lib/auth";
import Dashboard from "./pages/Dashboard";
import FeaturesPage from "./pages/FeaturesPage";
import HomePage from "./pages/HomePage";
import Login from "./pages/Login";
import MLAnalysisPage from "./pages/MLAnalysisPage";
import MetalsAnalysis from "./pages/MetalsAnalysis";
import BitcoinAnalysis from "./pages/BitcoinAnalysis";
import ComparePage from "./pages/ComparePage";
import StockDetailPage from "./pages/StockDetailPage";

function PrivateRoute({ children }) {
  const [isChecking, setIsChecking] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const checkAuth = async () => {
      if (!hasAuthToken()) {
        if (isMounted) {
          setIsAuthenticated(false);
          setIsChecking(false);
        }
        return;
      }

      try {
        await api.get("/auth/me/");
        if (isMounted) {
          setIsAuthenticated(true);
        }
      } catch {
        if (isMounted) {
          setIsAuthenticated(false);
        }
      } finally {
        if (isMounted) {
          setIsChecking(false);
        }
      }
    };

    checkAuth();
    return () => {
      isMounted = false;
    };
  }, []);

  if (isChecking) {
    return <div className="auth-loader">Checking session...</div>;
  }

  return isAuthenticated ? children : <Navigate to="/login" replace />;
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/login" element={<Login initialMode="login" />} />
      <Route path="/signup" element={<Login initialMode="signup" />} />
      <Route
        path="/dashboard"
        element={
          <PrivateRoute>
            <Dashboard />
          </PrivateRoute>
        }
      />
      <Route
        path="/portfolio/:id"
        element={
          <PrivateRoute>
            <Dashboard />
          </PrivateRoute>
        }
      />
      <Route
        path="/stock/:id"
        element={
          <PrivateRoute>
            <StockDetailPage />
          </PrivateRoute>
        }
      />
      <Route
        path="/growth"
        element={
          <PrivateRoute>
            <FeaturesPage />
          </PrivateRoute>
        }
      />
      <Route
        path="/ml-analysis"
        element={
          <PrivateRoute>
            <MLAnalysisPage />
          </PrivateRoute>
        }
      />
      <Route
        path="/compare"
        element={
          <PrivateRoute>
            <ComparePage />
          </PrivateRoute>
        }
      />
      <Route
        path="/metals"
        element={
          <PrivateRoute>
            <MetalsAnalysis />
          </PrivateRoute>
        }
      />
      <Route
        path="/crypto"
        element={
          <PrivateRoute>
            <BitcoinAnalysis />
          </PrivateRoute>
        }
      />

      <Route path="/features" element={<Navigate to="/growth" replace />} />
      <Route path="/home" element={<Navigate to="/growth" replace />} />
      <Route path="/bitcoin" element={<Navigate to="/crypto" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
