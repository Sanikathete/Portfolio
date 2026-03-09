import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/axios";
import { setAuthToken } from "../lib/auth";

function Login({ initialMode = "login" }) {
  const [mode, setMode] = useState(initialMode);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    setMode(initialMode);
    setPassword("");
    setConfirmPassword("");
    setError("");
    setMessage("");
  }, [initialMode]);

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setPassword("");
    setConfirmPassword("");
    setError("");
    setMessage("");
    navigate(nextMode === "signup" ? "/signup" : "/login");
  };

  const handleAuthSuccess = (payload) => {
    setAuthToken(payload?.token || "");
    navigate("/dashboard");
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      const response = await api.post("/auth/login/", {
        username: username.trim(),
        password
      });
      handleAuthSuccess(response.data);
    } catch (err) {
      setError(err?.response?.data?.detail || "Login failed.");
    }
  };

  const handleSignup = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    try {
      const response = await api.post("/auth/signup/", {
        username: username.trim(),
        password
      });
      handleAuthSuccess(response.data);
    } catch (err) {
      setError(err?.response?.data?.detail || "Unable to create account.");
    }
  };

  const handleForgotPassword = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    try {
      await api.post("/forgot-password/", {
        username: username.trim(),
        password,
        confirm_password: confirmPassword
      });
      setMessage("Password reset complete. Please log in.");
      setMode("login");
      navigate("/login");
    } catch (err) {
      setError(err?.response?.data?.detail || "Unable to reset password.");
    }
  };

  return (
    <div className="container">
      <div className="card auth-card">
        <h1>{mode === "login" ? "Login" : mode === "signup" ? "Sign Up" : "Forgot Password"}</h1>
        <div className="auth-switch">
          <button
            type="button"
            onClick={() => switchMode("login")}
            className={mode === "login" ? "auth-tab active" : "auth-tab"}
          >
            Login
          </button>
          <button
            type="button"
            onClick={() => switchMode("signup")}
            className={mode === "signup" ? "auth-tab active" : "auth-tab"}
          >
            Sign Up
          </button>
        </div>

        <form
          className="form"
          onSubmit={mode === "login" ? handleLogin : mode === "signup" ? handleSignup : handleForgotPassword}
        >
          <input
            type="text"
            placeholder="Username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            required
          />
          <input
            type="password"
            placeholder={mode === "forgot" ? "New Password" : "Password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
          {(mode === "signup" || mode === "forgot") ? (
            <input
              type="password"
              placeholder="Confirm Password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
            />
          ) : null}

          <button type="submit">
            {mode === "login" ? "Login" : mode === "signup" ? "Create Account" : "Reset Password"}
          </button>

          {mode !== "forgot" ? (
            <button type="button" className="secondary-btn" onClick={() => setMode("forgot")}>
              Forgot Password
            </button>
          ) : (
            <button type="button" className="secondary-btn" onClick={() => switchMode("login")}>
              Back To Login
            </button>
          )}

          {message ? <p className="profit-text">{message}</p> : null}
          {error ? <p className="error">{error}</p> : null}
        </form>
      </div>
    </div>
  );
}

export default Login;
