import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { CurrencyProvider } from "./context/CurrencyContext";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <CurrencyProvider>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </CurrencyProvider>
);
