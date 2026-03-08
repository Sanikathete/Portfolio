function PortfolioTable({ items, totalValue, onRemove, formatMoney = (value) => `$${Number(value || 0).toFixed(2)}` }) {
  return (
    <div className="table-wrap premium-table">
      <table>
        <thead>
          <tr>
            <th>Symbol</th>
            <th>Company</th>
            <th>Quantity</th>
            <th>Buy Price</th>
            <th>Current Price</th>
            <th>P/E Ratio</th>
            <th>Discount %</th>
            <th>Profit/Loss</th>
            <th>Position Value</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td colSpan="10" className="center-text">
                No holdings yet. Start building your first allocation.
              </td>
            </tr>
          ) : (
            items.map((item) => (
              <tr key={item.id}>
                <td>{item.stock.symbol}</td>
                <td>{item.stock.company_name}</td>
                <td>{item.quantity}</td>
                <td>{formatMoney(item.buy_price)}</td>
                <td>{formatMoney(item.current_price)}</td>
                <td>{Number(item.pe_ratio).toFixed(2)}</td>
                <td className={Number(item.discount_percent) >= 0 ? "profit-text" : "loss-text"}>
                  {Number(item.discount_percent).toFixed(2)}%
                </td>
                <td className={Number(item.profit_loss) >= 0 ? "profit-text" : "loss-text"}>
                  {formatMoney(item.profit_loss)}
                </td>
                <td>{formatMoney(item.position_value)}</td>
                <td>
                  <button className="ghost-danger-btn" onClick={() => onRemove(item.stock.id)}>
                    Remove
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      <p className="total">Total Portfolio Value: {formatMoney(totalValue || 0)}</p>
    </div>
  );
}

export default PortfolioTable;
