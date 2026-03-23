import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend
} from "recharts";

function ForecastPanel({ symbol, forecast }) {
  const historical = forecast?.historical || [];
  const future = forecast?.forecast || [];
  const linearForecast = forecast?.linear_regression_forecast || [];
  const arimaForecast = forecast?.arima_forecast || [];
  const lastHistorical = historical.length > 0 ? historical[historical.length - 1] : null;
  const data = [
    ...historical.map((item) => ({
      date: item.date,
      historical_price: item.price,
      forecast_price: item.date === lastHistorical?.date ? item.price : null,
      linear_regression_price: item.date === lastHistorical?.date ? item.price : null,
      arima_price: item.date === lastHistorical?.date ? item.price : null
    })),
    ...future.map((item, index) => ({
      date: item.date,
      historical_price: null,
      forecast_price: item.price,
      linear_regression_price: linearForecast[index]?.price ?? null,
      arima_price: arimaForecast[index]?.price ?? null
    }))
  ];

  return (
    <div className="card">
      <h2>Future Prediction Graph {symbol ? `- ${symbol}` : ""}</h2>
      {symbol ? (
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Line
              type="monotone"
              dataKey="historical_price"
              stroke="#0f62fe"
              strokeWidth={3}
              dot={false}
              connectNulls
              name="Historical"
            />
            <Line
              type="natural"
              dataKey="forecast_price"
              stroke="#f59e0b"
              strokeWidth={3}
              dot={false}
              strokeDasharray="6 4"
              connectNulls
              name="Blended Forecast"
            />
            <Line
              type="natural"
              dataKey="linear_regression_price"
              stroke="#16a34a"
              strokeWidth={2}
              dot={false}
              strokeDasharray="4 4"
              connectNulls
              name="Linear Regression"
            />
            <Line
              type="natural"
              dataKey="arima_price"
              stroke="#dc2626"
              strokeWidth={2}
              dot={false}
              strokeDasharray="10 4"
              connectNulls
              name="ARIMA"
            />
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <p className="metric-label">Select a stock from ML analysis to view forecast.</p>
      )}
    </div>
  );
}

export default ForecastPanel;
