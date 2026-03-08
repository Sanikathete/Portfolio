export const AVAILABLE_CURRENCIES = [
  { code: "USD", rate: 1.0 },
  { code: "EUR", rate: 0.92 },
  { code: "GBP", rate: 0.79 },
  { code: "INR", rate: 83.0 },
  { code: "JPY", rate: 149.0 },
  { code: "AUD", rate: 1.52 },
  { code: "CAD", rate: 1.35 },
  { code: "SGD", rate: 1.34 },
  { code: "CNY", rate: 7.2 }
];

const COUNTRY_TO_CURRENCY = {
  australia: "AUD",
  canada: "CAD",
  china: "CNY",
  france: "EUR",
  germany: "EUR",
  india: "INR",
  japan: "JPY",
  singapore: "SGD",
  "united kingdom": "GBP",
  "united states": "USD",
  usa: "USD"
};

const DEFAULT_CURRENCY = AVAILABLE_CURRENCIES[0];

export function getCurrencyByCode(code) {
  return AVAILABLE_CURRENCIES.find((item) => item.code === code) || DEFAULT_CURRENCY;
}

export function getCurrencyByCountry(countryName) {
  const normalized = String(countryName || "").trim().toLowerCase();
  return getCurrencyByCode(COUNTRY_TO_CURRENCY[normalized] || DEFAULT_CURRENCY.code);
}

export function convertFromUsd(value, currency) {
  const numericValue = Number(value || 0);
  const rate = Number(currency?.rate || 1);
  return numericValue * rate;
}

export function formatMoney(value, currency) {
  const amount = convertFromUsd(value, currency);
  const code = currency?.code || DEFAULT_CURRENCY.code;

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: code,
    maximumFractionDigits: 2
  }).format(amount);
}
