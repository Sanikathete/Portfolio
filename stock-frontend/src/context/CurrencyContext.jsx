import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { AVAILABLE_CURRENCIES, getCurrencyByCode, getCurrencyByCountry } from "../lib/currency";

const CurrencyContext = createContext(null);
const STORAGE_KEY = "portfolyze_currency_code";

export function CurrencyProvider({ children }) {
  const [selectedCode, setSelectedCode] = useState(() => localStorage.getItem(STORAGE_KEY) || "AUTO");

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, selectedCode);
  }, [selectedCode]);

  const value = useMemo(() => ({ selectedCode, setSelectedCode }), [selectedCode]);
  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

export function useCurrencyPreference(autoCountryName = "") {
  const context = useContext(CurrencyContext);
  if (!context) {
    throw new Error("useCurrencyPreference must be used within CurrencyProvider");
  }

  const resolvedCurrency =
    context.selectedCode === "AUTO"
      ? getCurrencyByCountry(autoCountryName)
      : getCurrencyByCode(context.selectedCode);

  return {
    selectedCode: context.selectedCode,
    setSelectedCode: context.setSelectedCode,
    currency: resolvedCurrency,
    currencyOptions: [{ code: "AUTO" }, ...AVAILABLE_CURRENCIES]
  };
}
