import { useState, useEffect } from "react";
import Login from "./Login";
import Signup from "./Signup";

type Message = {
  id: number;
  text: string;
  isOwn: boolean;
};

export type User = {
  id: number;
  email: string;
  full_name: string | null;
};

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [authView, setAuthView] = useState<"login" | "signup">("login");
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [isWaiting, setIsWaiting] = useState(false);

  useEffect(() => {
    async function checkSession() {
      try {
        const response = await fetch("http://localhost:8000/auth/me", {
          credentials: "include",
        });
        if (response.ok) {
          const data = await response.json();
          setUser(data.user);
        }
      } catch {
        // Backend unreachable
      } finally {
        setCheckingSession(false);
      }
    }
    checkSession();
  }, []);

  useEffect(() => {
    if (!user) return;
    async function loadMessages() {
      const response = await fetch("http://localhost:8000/messages", {
        credentials: "include",
      });
      if (!response.ok) return;

      const data = await response.json();
      setMessages(
        data.messages.map((m: { role: string; content: string }, i: number) => ({
          id: i,
          text: m.content,
          isOwn: m.role === "user",
        }))
      )
    }
    loadMessages();
  }, [user])

  if (checkingSession) {
    return <div>Loading</div>;
  }

  if (!user) {
    return authView === "login" ? (
      <Login onLogin={setUser} onSwitchToSignup={() => setAuthView("signup")} />
    ) : (
      <Signup onSignup={setUser} onSwitchToLogin={() => setAuthView("login")} />
    );
  }

  async function handleLogout() {
    try {
      await fetch("http://localhost:8000/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // Even if the request fails, clear the client so the user can re-auth.
    } finally {
      setUser(null);
      setMessages([]);
      setText("");
    }
  }

  async function handleSend() {
    const trimmed = text.trim();

    if (!trimmed || isWaiting) {
      return;
    }

    setMessages((current) => [
      ...current,
      { id: Date.now(), text: trimmed, isOwn: true },
    ]);
    setText("");
    setIsWaiting(true);

    try {
      const response = await fetch("http://localhost:8000/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ text: trimmed }),
      });

      if (response.status === 401) {
        setUser(null);
        return;
      }

      const data = await response.json();

      setMessages((current) => [
        ...current,
        { id: Date.now(), text: data.reply, isOwn: false },
      ]);
    } finally {
      setIsWaiting(false);
    }
  }

  if (!user) {
    return authView === "login" ? (
      <Login
        onLogin={setUser}
        onSwitchToSignup={() => setAuthView("signup")}
      />
    ) : (
      <Signup
        onSignup={setUser}
        onSwitchToLogin={() => setAuthView("login")}
      />
    );
  }

  return (
    <div
      style={{
        minHeight: "100svh",
        display: "flex",
        flexDirection: "column",
        background: "linear-gradient(180deg, #f7f7fb 0%, #eef2f7 100%)",
      }}
    >
      <Header user={user} onLogout={handleLogout} />
      <Messages messages={messages} isWaiting={isWaiting} />
      <TextBox
        text={text}
        onTextChange={setText}
        onSend={handleSend}
        isWaiting={isWaiting}
      />
    </div>
  );
}

function Header({ user, onLogout }: { user: User; onLogout: () => void }) {
  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "12px 16px",
        background: "rgba(255, 255, 255, 0.9)",
        borderBottom: "1px solid #d8dbe2",
        backdropFilter: "blur(8px)",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
        <strong style={{ color: "#08060d", fontSize: 15 }}>ChatCS</strong>
        <span
          style={{
            fontSize: 13,
            color: "#6b7280",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {user.full_name ?? user.email}
        </span>
      </div>

      <button
        type="button"
        onClick={onLogout}
        style={{
          border: "1px solid #cfd5df",
          borderRadius: 999,
          padding: "8px 16px",
          background: "#fff",
          color: "#374151",
          font: "inherit",
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Sign out
      </button>
    </header>
  );
}

function Bubble({ text, isOwn }: { text: string; isOwn: boolean }) {
  return (
    <div
      style={{
        display: "inline-block",
        maxWidth: "70%",
        padding: "8px 12px",
        borderRadius: 16,
        wordBreak: "break-word",
        overflowWrap: "break-word",
        alignSelf: isOwn ? "flex-end" : "flex-start",
        background: isOwn ? "#0b93f6" : "#e5e5ea",
        color: isOwn ? "#fff" : "#000",
      }}
    >
      {text}
    </div>
  );
}

function Messages({
  messages,
  isWaiting,
}: {
  messages: Message[];
  isWaiting: boolean;
}) {
  return (
    <div
      style={{
        flex: 1,
        padding: "16px",
        display: "flex",
        flexDirection: "column",
        gap: "8px",
      }}
    >
      {messages.map((message) => (
        <Bubble
          key={message.id}
          text={message.text}
          isOwn={message.isOwn}
        />
      ))}
      {isWaiting && <Bubble text="…" isOwn={false} />}
    </div>
  );
}

function TextBox({
  text,
  onTextChange,
  onSend,
  isWaiting,
}: {
  text: string;
  onTextChange: (value: string) => void;
  onSend: () => void;
  isWaiting: boolean;
}) {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSend();
      }}
      style={{
        display: "flex",
        gap: "8px",
        padding: "12px",
        background: "rgba(255, 255, 255, 0.9)",
        borderTop: "1px solid #d8dbe2",
        backdropFilter: "blur(8px)",
      }}
    >
      <input
        type="text"
        value={text}
        onChange={(event) => onTextChange(event.target.value)}
        placeholder="Enter text"
        style={{
          flex: 1,
          border: "1px solid #cfd5df",
          borderRadius: 999,
          padding: "12px 16px",
          font: "inherit",
          outline: "none",
          background: "#fff",
        }}
      />

      <button
        type="submit"
        disabled={isWaiting}
        style={{
          border: "none",
          borderRadius: 999,
          padding: "12px 18px",
          background: isWaiting ? "#9fc9ef" : "#0b93f6",
          color: "#fff",
          font: "inherit",
          fontWeight: 600,
          cursor: isWaiting ? "default" : "pointer",
        }}
      >
        Send
      </button>
    </form>
  );
}

export default App