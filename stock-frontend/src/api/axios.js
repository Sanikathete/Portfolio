import axios from "axios";
import { clearAuthToken, getAuthToken } from "../lib/auth";

const api = axios.create({
  baseURL: "http://localhost:8000/api"
});

api.interceptors.request.use((config) => {
  const token = getAuthToken();
  if (token) {
    config.headers.Authorization = `Token ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    const path = typeof window !== "undefined" ? window.location.pathname : "";
    const authPath = path === "/login" || path === "/signup";
    const authRequest = ["/auth/login/", "/auth/signup/", "/forgot-password/", "/auth/logout/"].some((fragment) =>
      String(error?.config?.url || "").includes(fragment)
    );

    if (status === 401 && !authPath && !authRequest && typeof window !== "undefined") {
      clearAuthToken();
      window.location.replace("/login");
    }

    return Promise.reject(error);
  }
);

export default api;
