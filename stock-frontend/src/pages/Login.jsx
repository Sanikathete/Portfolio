import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/axios";

function Login() {
  const [mode, setMode] = useState("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    api.post("/logout/").catch(() => null);
  }, []);

  const resetAlerts = () => {
    setError("");
    setMessage("");
  };

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setPassword("");
    setConfirmPassword("");
    resetAlerts();
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    resetAlerts();
    const cleanUsername = username.trim();
    const cleanPassword = password;

    if (!cleanUsername || !cleanPassword) {
      setError("Username and password are required.");
      return;
    }

    try {
      await api.post("/login/", {
        username: cleanUsername,
        password: cleanPassword,
      });
      navigate("/home");
    } catch (err) {
      if (!err?.response) {
        setError("Cannot reach server. Start backend and try again.");
        return;
      }
      setError(err?.response?.data?.detail || "Login failed.");
    }
  };

  const handleSignup = async (e) => {
    e.preventDefault();
    resetAlerts();
    const cleanUsername = username.trim();

    if (!cleanUsername || !password) {
      setError("Username and password are required.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    try {
      await api.post("/signup/", { username: cleanUsername, password });
      setMessage("Account created. Please log in.");
      setPassword("");
      setConfirmPassword("");
      setMode("login");
    } catch (err) {
      setError(err?.response?.data?.detail || "Unable to create account.");
    }
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    resetAlerts();
    const cleanUsername = username.trim();

    if (!cleanUsername || !password || !confirmPassword) {
      setError("Username, new password and confirmation are required.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    try {
      await api.post("/forgot-password/", {
        username: cleanUsername,
        password,
        confirm_password: confirmPassword
      });
      setMessage("Password reset complete. Please log in.");
      setPassword("");
      setConfirmPassword("");
      setMode("login");
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
          onSubmit={
            mode === "login" ? handleLogin : mode === "signup" ? handleSignup : handleForgotPassword
          }
          className="form"
        >
          <input
            type="text"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder={mode === "forgot" ? "New Password" : "Password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {(mode === "signup" || mode === "forgot") && (
            <input
              type="password"
              placeholder="Confirm Password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          )}
          <button type="submit">
            {mode === "login" ? "Login" : mode === "signup" ? "Create Account" : "Reset Password"}
          </button>
          {mode !== "forgot" ? (
            <button
              type="button"
              className="secondary-btn"
              onClick={() => switchMode("forgot")}
            >
              Forgot Password
            </button>
          ) : (
            <button
              type="button"
              className="secondary-btn"
              onClick={() => switchMode("login")}
            >
              Back To Login
            </button>
          )}
          {message && <p className="profit-text">{message}</p>}
          {error && <p className="error">{error}</p>}
        </form>
      </div>
    </div>
  );
}

export default Login;
