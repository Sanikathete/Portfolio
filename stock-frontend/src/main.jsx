import ReactDOM from "react-dom/client";
import { BrowserRouter, useLocation } from "react-router-dom";
import App from "./App";
import ErrorBoundary from "./components/ErrorBoundary";
import { CurrencyProvider } from "./context/CurrencyContext";
import "./index.css";

function RoutedErrorBoundary({ children }) {
  const location = useLocation();
  return <ErrorBoundary resetKey={location.pathname}>{children}</ErrorBoundary>;
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <CurrencyProvider>
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <RoutedErrorBoundary>
        <App />
      </RoutedErrorBoundary>
    </BrowserRouter>
  </CurrencyProvider>
);
