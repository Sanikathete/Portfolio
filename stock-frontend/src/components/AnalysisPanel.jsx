function AnalysisPanel({ analysis, selectedSymbol, onSelectStock }) {
  const records = analysis?.records || [];
  const predictions = analysis?.predictions || [];
  const linear = analysis?.linear_regression;
  const logistic = analysis?.logistic_regression;

  return (
    <div className="card">
      <h2>ML Stock Analysis</h2>

      <div className="analysis-summary">
        <div>
          <p className="metric-label">Linear Coefficients</p>
          <p>{linear ? linear.coefficients.map((v) => Number(v).toFixed(4)).join(", ") : "-"}</p>
        </div>
        <div>
          <p className="metric-label">Linear Intercept</p>
          <p>{linear ? Number(linear.intercept).toFixed(4) : "-"}</p>
        </div>
        <div>
          <p className="metric-label">Logistic Accuracy</p>
          <p>{logistic ? `${(Number(logistic.accuracy) * 100).toFixed(2)}%` : "-"}</p>
        </div>
        <div>
          <p className="metric-label">Sample Prediction</p>
          <p>
            {analysis?.sample_prediction !== null && analysis?.sample_prediction !== undefined
              ? `$${Number(analysis.sample_prediction).toFixed(2)}`
              : "-"}
          </p>
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Cluster</th>
              <th>Actual Total</th>
              <th>Actual Future Total</th>
              <th>Predicted Future Total</th>
            </tr>
          </thead>
          <tbody>
            {records.length === 0 ? (
              <tr>
                <td colSpan="5" className="center-text">
                  No analysis data available.
                </td>
              </tr>
            ) : (
              records.map((record) => {
                const predicted = predictions.find((item) => item.symbol === record.symbol);
                return (
                  <tr
                    key={`${record.id}-${record.symbol}`}
                    className={selectedSymbol === record.symbol ? "row-selected" : ""}
                    onClick={() => onSelectStock && onSelectStock(record.symbol)}
                    style={{ cursor: "pointer" }}
                  >
                    <td>{record.symbol}</td>
                    <td>{record.cluster}</td>
                    <td>${Number(record.total_value || 0).toFixed(2)}</td>
                    <td>${Number(predicted?.actual_future_total_value || 0).toFixed(2)}</td>
                    <td>${Number(predicted?.predicted_total_value || 0).toFixed(2)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default AnalysisPanel;
