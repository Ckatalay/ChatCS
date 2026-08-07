import { useState } from "react";
import { API, type User } from "./api";

function Signup({
  onSignup,
  onSwitchToLogin,
}: {
  onSignup: (user: User) => void;
  onSwitchToLogin: () => void;
}) {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const passwordsMatch = confirm === "" || password === confirm;
  const canSubmit =
    email.trim() !== "" && password !== "" && password === confirm && !isBusy;

  async function handleSubmit() {
    setError(null);
    setIsBusy(true);
    try {
      const response = await fetch(`${API}/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          email: email.trim(),
          password,
          full_name: fullName.trim() || null,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.detail ?? "Sign up failed");
        return;
      }
      onSignup(data.user);
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
          <h1>Create your account</h1>
          <p>Join ChatCS, your cybersecurity assistant</p>
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
          <span>Full name (optional)</span>
          <input
            type="text"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            placeholder="Jane Doe"
            autoComplete="name"
          />
        </label>

        <label className="field">
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="••••••••"
            autoComplete="new-password"
          />
        </label>

        <label className="field">
          <span>Confirm password</span>
          <input
            type="password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            placeholder="••••••••"
            autoComplete="new-password"
            aria-invalid={!passwordsMatch}
          />
          {!passwordsMatch && (
            <span className="field-error">Passwords do not match</span>
          )}
        </label>

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="primary-button" disabled={!canSubmit}>
          {isBusy ? "Creating account…" : "Create account"}
        </button>

        <p className="auth-switch">
          Already have an account?{" "}
          <button
            type="button"
            className="link-button"
            onClick={onSwitchToLogin}
          >
            Sign in
          </button>
        </p>
      </form>
    </div>
  );
}

export default Signup;
