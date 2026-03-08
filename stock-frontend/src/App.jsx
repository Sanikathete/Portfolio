import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import api from "./api/axios";
import "./lib/chartSetup";
import Login from "./pages/Login";
import HomePage from "./pages/HomePage";
import Dashboard from "./pages/Dashboard";
import GrowthPage from "./pages/GrowthPage";
import MLAnalysisPage from "./pages/MLAnalysisPage";
import MetalsAnalysis from "./pages/MetalsAnalysis";
import BitcoinAnalysis from "./pages/BitcoinAnalysis";
import ComparePage from "./pages/ComparePage";

function PrivateRoute({ children }) {
  const [isChecking, setIsChecking] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const checkAuth = async () => {
      try {
        await api.get("/me/");
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
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<Login />} />
      <Route
        path="/home"
        element={
          <PrivateRoute>
            <HomePage />
          </PrivateRoute>
        }
      />
      <Route
        path="/dashboard"
        element={
          <PrivateRoute>
            <Dashboard />
          </PrivateRoute>
        }
      />
      <Route
        path="/growth"
        element={
          <PrivateRoute>
            <GrowthPage />
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
        path="/metals"
        element={
          <PrivateRoute>
            <MetalsAnalysis />
          </PrivateRoute>
        }
      />
      <Route
        path="/bitcoin"
        element={
          <PrivateRoute>
            <BitcoinAnalysis />
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
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

export default App;
