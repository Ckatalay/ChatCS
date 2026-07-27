import { useState } from "react";
import type { User } from "./App";

const inputStyle = {
  border: "1px solid #cfd5df",
  borderRadius: 12,
  padding: "12px 16px",
  font: "inherit",
  outline: "none",
  background: "#fff",
  color: "#08060d",
} as const;

const labelStyle = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
} as const;

const labelTextStyle = {
  fontSize: 14,
  fontWeight: 600,
  color: "#374151",
} as const;

function Signup({
  onSignup,
  onSwitchToLogin,
}: {
  onSignup: (user: User) => void;
  onSwitchToLogin: () => void;
}) {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [company, setCompany] = useState("");
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
      const response = await fetch("http://localhost:8000/auth/signup", {
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
    <div
      style={{
        minHeight: "100svh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        background: "linear-gradient(180deg, #f7f7fb 0%, #eef2f7 100%)",
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (canSubmit) {
            handleSubmit();
          }
        }}
        style={{
          width: "100%",
          maxWidth: 380,
          display: "flex",
          flexDirection: "column",
          gap: 16,
          padding: "32px 28px",
          borderRadius: 20,
          background: "rgba(255, 255, 255, 0.9)",
          border: "1px solid #d8dbe2",
          boxShadow:
            "rgba(0, 0, 0, 0.1) 0 10px 15px -3px, rgba(0, 0, 0, 0.05) 0 4px 6px -2px",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: 8 }}>
          <h2 style={{ margin: 0, color: "#08060d" }}>Create your account</h2>
          <p style={{ fontSize: 15, color: "#6b7280" }}>
            Join ChatCS, your cybersecurity assistant
          </p>
        </div>

        <label style={labelStyle}>
          <span style={labelTextStyle}>Email</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@turkcell.com"
            autoComplete="email"
            autoFocus
            style={inputStyle}
          />
        </label>

        <label style={labelStyle}>
          <span style={labelTextStyle}>Full name (optional)</span>
          <input
            type="text"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            placeholder="Jane Doe"
            autoComplete="name"
            style={inputStyle}
          />
        </label>

        <label style={labelStyle}>
          <span style={labelTextStyle}>Password</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="••••••••"
            autoComplete="new-password"
            style={inputStyle}
          />
        </label>

        <label style={labelStyle}>
          <span style={labelTextStyle}>Confirm password</span>
          <input
            type="password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            placeholder="••••••••"
            autoComplete="new-password"
            style={{
              ...inputStyle,
              borderColor: passwordsMatch ? "#cfd5df" : "#ef4444",
            }}
          />
          {!passwordsMatch && (
            <span style={{ fontSize: 13, color: "#ef4444" }}>
              Passwords do not match
            </span>
          )}
        </label>

        {error && (
          <p style={{ fontSize: 14, textAlign: "center", color: "#ef4444" }}>
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={!canSubmit}
          style={{
            border: "none",
            borderRadius: 12,
            padding: "12px 18px",
            marginTop: 8,
            background: canSubmit ? "#0b93f6" : "#9fc9ef",
            color: "#fff",
            font: "inherit",
            fontWeight: 600,
            cursor: canSubmit ? "pointer" : "default",
          }}
        >
          {isBusy ? "Creating account…" : "Create account"}
        </button>

        <p style={{ fontSize: 14, textAlign: "center", color: "#6b7280" }}>
          Already have an account?{" "}
          <button
            type="button"
            onClick={onSwitchToLogin}
            style={{
              border: "none",
              padding: 0,
              background: "none",
              font: "inherit",
              fontWeight: 600,
              color: "#0b93f6",
              cursor: "pointer",
            }}
          >
            Sign in
          </button>
        </p>
      </form>
    </div>
  );
}

export default Signup;
