import { useState } from "react";

function AddStockForm({ stocks, onAdd }) {
  const [stockId, setStockId] = useState("");
  const [quantity, setQuantity] = useState(1);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!stockId || Number(quantity) <= 0) return;
    onAdd(Number(stockId), Number(quantity));
    setQuantity(1);
  };

  return (
    <form className="form" onSubmit={handleSubmit}>
      <select value={stockId} onChange={(e) => setStockId(e.target.value)} required>
        <option value="">Select stock</option>
        {stocks.map((stock) => (
          <option key={stock.id} value={stock.id}>
            {stock.symbol} - {stock.company_name} (${stock.price})
          </option>
        ))}
      </select>
      <input
        type="number"
        min="1"
        value={quantity}
        onChange={(e) => setQuantity(e.target.value)}
        required
      />
      <button type="submit">Add Stock</button>
    </form>
  );
}

export default AddStockForm;
