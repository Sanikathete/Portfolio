import axios from "axios";

const api = axios.create({
  baseURL: "http://localhost:8000/api",
  withCredentials: true
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    const path = typeof window !== "undefined" ? window.location.pathname : "";
    const authPath = path === "/login";
    const authRequest = ["/login/", "/signup/", "/forgot-password/", "/logout/"].some((fragment) =>
      String(error?.config?.url || "").includes(fragment)
    );

    if (status === 401 && !authPath && !authRequest && typeof window !== "undefined") {
      window.location.replace("/login");
    }

    return Promise.reject(error);
  }
);

export default api;
