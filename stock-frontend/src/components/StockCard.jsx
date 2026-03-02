import { useState } from "react";

function StockCard({ stock, onAdd }) {
  const [quantity, setQuantity] = useState(1);
  const parsedQty = Number(quantity);
  const isQtyValid = Number.isInteger(parsedQty) && parsedQty > 0;

  return (
    <div className="stock-card">
      <div className="stock-top">
        <h4>{stock.symbol}</h4>
        <span className="sector-pill">{stock.sector}</span>
      </div>
      <p className="company-name">{stock.company_name}</p>
      <div className="stock-stats">
        <p>Price: ${Number(stock.current_price).toFixed(2)}</p>
        <p>P/E: {Number(stock.pe_ratio).toFixed(2)}</p>
        <p className={Number(stock.discount_percent) >= 0 ? "profit-text" : "loss-text"}>
          Discount: {Number(stock.discount_percent).toFixed(2)}%
        </p>
      </div>

      <div className="stock-actions">
        <input
          type="number"
          min="1"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
        />
        <button disabled={!isQtyValid} onClick={() => onAdd(stock.symbol, parsedQty)}>
          Add to Portfolio
        </button>
      </div>
    </div>
  );
}

export default StockCard;
