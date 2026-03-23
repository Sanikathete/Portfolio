import { useEffect, useMemo, useState } from "react";

const BASE_TICKERS = [
  { symbol: "AAPL", company: "Apple", price: 257.46 },
  { symbol: "MSFT", company: "Microsoft", price: 412.88 },
  { symbol: "NVDA", company: "NVIDIA", price: 912.12 },
  { symbol: "GOOGL", company: "Alphabet", price: 173.15 },
  { symbol: "AMZN", company: "Amazon", price: 186.71 },
  { symbol: "META", company: "Meta", price: 492.24 },
  { symbol: "TSLA", company: "Tesla", price: 218.44 },
  { symbol: "JPM", company: "JPMorgan", price: 196.21 },
  { symbol: "NFLX", company: "Netflix", price: 618.58 },
  { symbol: "CRM", company: "Salesforce", price: 202.11 }
];

function buildInitialTickers() {
  return BASE_TICKERS.map((item, index) => ({
    ...item,
    spark: Array.from({ length: 8 }, (_, pointIndex) =>
      Number((item.price * (1 + ((pointIndex - 4) * (0.002 + index * 0.0003)))).toFixed(2))
    ),
    change: Number((((index % 2 === 0 ? 1 : -1) * (0.3 + index * 0.08))).toFixed(2))
  }));
}

function TrendingPanel() {
  const [tickers, setTickers] = useState(buildInitialTickers);
  const [lastUpdate, setLastUpdate] = useState(() => new Date());

  useEffect(() => {
    const updateTickerTape = () => {
      setTickers((previous) =>
        previous.map((item, index) => {
          const direction = index % 3 === 0 ? 1 : -1;
          const move = direction * (0.002 + ((index + 1) * 0.0007));
          const nextPrice = Number((item.price * (1 + move)).toFixed(2));
          const spark = [...item.spark.slice(1), nextPrice];
          return {
            ...item,
            price: nextPrice,
            spark,
            change: Number((((nextPrice - BASE_TICKERS[index].price) / BASE_TICKERS[index].price) * 100).toFixed(2))
          };
        })
      );
      setLastUpdate(new Date());
    };

    const timerId = window.setInterval(updateTickerTape, 60000);
    return () => window.clearInterval(timerId);
  }, []);

  const lastUpdatedLabel = useMemo(
    () =>
      new Intl.DateTimeFormat("en-US", {
        hour: "numeric",
        minute: "2-digit"
      }).format(lastUpdate),
    [lastUpdate]
  );

  return (
    <aside className="trending-panel glass-card">
      <div className="panel-header">
        <div>
          <p className="panel-kicker">Live tape</p>
          <h3>Trending Top 10 Stocks</h3>
        </div>
        <span className="status-pill">JS updates every minute</span>
      </div>

      <div className="ticker-stack">
        {tickers.map((ticker) => (
          <div key={ticker.symbol} className="ticker-row">
            <div>
              <strong>{ticker.symbol}</strong>
              <p>{ticker.company}</p>
            </div>
            <div className="ticker-spark">
              {ticker.spark.map((point, index) => (
                <span
                  key={`${ticker.symbol}-${index}`}
                  style={{ height: `${Math.max(10, (point / ticker.price) * 28)}px` }}
                />
              ))}
            </div>
            <div className="ticker-price">
              <strong>${Number(ticker.price).toFixed(2)}</strong>
              <p className={ticker.change >= 0 ? "profit-text" : "loss-text"}>
                {ticker.change >= 0 ? "+" : ""}
                {ticker.change.toFixed(2)}%
              </p>
            </div>
          </div>
        ))}
      </div>

      <p className="panel-footnote">Last refresh {lastUpdatedLabel}</p>
    </aside>
  );
}

export default TrendingPanel;
