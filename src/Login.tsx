import { useState } from "react";
import { API, type User } from "./api";

function Login({
  onLogin,
  onSwitchToSignup,
}: {
  onLogin: (user: User) => void;
  onSwitchToSignup: () => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const canSubmit = email.trim() !== "" && password !== "" && !isBusy;

  async function handleSubmit() {
    setError(null);
    setIsBusy(true);
    try {
      const response = await fetch(`${API}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.detail ?? "Login failed");
        return;
      }
      onLogin(data.user);
    } catch {
      setError("Could not reach the server. Is the backend running?");
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <div className="auth">
      <form
        className="auth-card"
        onSubmit={(event) => {
          event.preventDefault();
          if (canSubmit) handleSubmit();
        }}
      >
        <div className="auth-head">
          <span className="brand-mark" aria-hidden="true">
            CS
          </span>
          <h1>Welcome back</h1>
          <p>Sign in to your cybersecurity assistant</p>
        </div>

        <label className="field">
          <span>Email</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@turkcell.com"
            autoComplete="email"
            autoFocus
          />
        </label>

        <label className="field">
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
          />
        </label>

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="primary-button" disabled={!canSubmit}>
          {isBusy ? "Signing in…" : "Sign in"}
        </button>

        <p className="auth-switch">
          Don't have an account?{" "}
          <button
            type="button"
            className="link-button"
            onClick={onSwitchToSignup}
          >
            Sign up
          </button>
        </p>
      </form>
    </div>
  );
}

export default Login;
