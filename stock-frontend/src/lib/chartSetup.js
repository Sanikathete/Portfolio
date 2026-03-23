import {
  ArcElement,
  BarElement,
  CategoryScale,
  Filler,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  RadialLinearScale,
  Tooltip
} from "chart.js";
import { Chart as ChartJS } from "chart.js";

ChartJS.register(
  ArcElement,
  BarElement,
  CategoryScale,
  Filler,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  RadialLinearScale,
  Tooltip
);

export const chartTextColor = "#d3e4ff";
export const chartGridColor = "rgba(148, 163, 184, 0.12)";

export const createChartOptions = (overrides = {}) => ({
  maintainAspectRatio: false,
  responsive: true,
  interaction: {
    intersect: false,
    mode: "index"
  },
  plugins: {
    legend: {
      labels: {
        color: chartTextColor,
        usePointStyle: true,
        boxWidth: 10
      }
    },
    tooltip: {
      backgroundColor: "rgba(7, 12, 30, 0.92)",
      titleColor: "#ffffff",
      bodyColor: "#cbd5e1",
      borderColor: "rgba(96, 165, 250, 0.25)",
      borderWidth: 1,
      padding: 12
    }
  },
  scales: {
    x: {
      ticks: {
        color: chartTextColor
      },
      grid: {
        color: chartGridColor
      }
    },
    y: {
      ticks: {
        color: chartTextColor
      },
      grid: {
        color: chartGridColor
      }
    }
  },
  ...overrides
});
