import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
} from "chart.js";
import { Line } from "react-chartjs-2";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

function StockChart({ stock }) {
  const labels = ["Day 1", "Day 2", "Day 3", "Day 4", "Day 5", "Day 6", "Day 7"];
  const prices = [
    stock.price * 0.96,
    stock.price * 0.98,
    stock.price * 0.97,
    stock.price * 1.01,
    stock.price * 1.03,
    stock.price * 1.02,
    stock.price
  ];

  const data = {
    labels,
    datasets: [
      {
        label: `${stock.symbol} Price`,
        data: prices,
        borderColor: "#0f62fe",
        backgroundColor: "rgba(15, 98, 254, 0.2)",
        tension: 0.3,
        fill: true
      }
    ]
  };

  const options = {
    responsive: true,
    plugins: {
      legend: {
        position: "top"
      },
      title: {
        display: true,
        text: `${stock.company_name} - 7 Day Trend`
      }
    }
  };

  return <Line data={data} options={options} />;
}

export default StockChart;
