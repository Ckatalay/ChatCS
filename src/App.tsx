import { useState, useEffect } from "react";
import Login from "./Login";
import Signup from "./Signup";

type Message = {
  id: number;
  text: string;
  isOwn: boolean;
};

type Conversation = {
  id: number;
  title: string;
  updated_at: string | null;
};

export type User = {
  id: number;
  email: string;
  full_name: string | null;
};

const API = "http://localhost:8000";

let refreshInFlight: Promise<boolean> | null = null;

function refreshSession(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = fetch(`${API}/auth/refresh`, {
      method: "POST",
      credentials: "include",
    })
      .then((response) => response.ok)
      .catch(() => false)
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

async function authFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const send = () => fetch(`${API}${path}`, { ...init, credentials: "include" });

  const response = await send();
  if (response.status !== 401) return response;

  return (await refreshSession()) ? send() : response;
}

async function fetchConversations(): Promise<Conversation[]> {
  const response = await authFetch("/conversations");
  if (!response.ok) return [];

  const data = await response.json();
  return data.conversations;
}

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [authView, setAuthView] = useState<"login" | "signup">("login");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [isWaiting, setIsWaiting] = useState(false);

  useEffect(() => {
    async function checkSession() {
      try {
        const response = await authFetch("/auth/me");
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
    let cancelled = false;

    async function loadConversations() {
      const list = await fetchConversations();
      if (cancelled) return;

      setConversations(list);
      setConversationId(list[0]?.id ?? null);
    }
    loadConversations();

    return () => {
      cancelled = true;
    };
  }, [user])

  useEffect(() => {
    if (!user || conversationId === null) return;
    let cancelled = false;

    async function loadMessages() {
      const response = await authFetch(
        `/messages?conversation_id=${conversationId}`
      );
      if (!response.ok) return;

      const data = await response.json();
      if (cancelled) return;

      setMessages(
        data.messages.map((m: { role: string; content: string }, i: number) => ({
          id: i,
          text: m.content,
          isOwn: m.role === "user",
        }))
      )
    }
    loadMessages();

    return () => {
      cancelled = true;
    };
  }, [user, conversationId])

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
      await fetch(`${API}/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // Even if the request fails, clear the client so the user can re-auth.
    } finally {
      setUser(null);
      setConversations([]);
      setConversationId(null);
      setMessages([]);
      setText("");
    }
  }

  function handleNewConversation() {
    setConversationId(null);
    setMessages([]);
    setText("");
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
      const response = await authFetch("/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: trimmed, conversation_id: conversationId }),
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
      setConversationId(data.conversation_id);
      setConversations(await fetchConversations());
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
        height: "100svh",
        display: "flex",
        background: "linear-gradient(180deg, #f7f7fb 0%, #eef2f7 100%)",
      }}
    >
      <Sidebar
        conversations={conversations}
        activeId={conversationId}
        onSelect={setConversationId}
        onNewConversation={handleNewConversation}
      />

      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
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
    </div>
  );
}

function Sidebar({
  conversations,
  activeId,
  onSelect,
  onNewConversation,
}: {
  conversations: Conversation[];
  activeId: number | null;
  onSelect: (id: number) => void;
  onNewConversation: () => void;
}) {
  return (
    <aside
      style={{
        width: 260,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        background: "rgba(255, 255, 255, 0.9)",
        borderRight: "1px solid #d8dbe2",
        backdropFilter: "blur(8px)",
      }}
    >
      <div style={{ padding: 12, borderBottom: "1px solid #d8dbe2" }}>
        <button
          type="button"
          onClick={onNewConversation}
          style={{
            width: "100%",
            border: "1px solid #cfd5df",
            borderRadius: 999,
            padding: "10px 16px",
            background: activeId === null ? "#e8f1fd" : "#fff",
            color: "#374151",
            font: "inherit",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          New chat
        </button>
      </div>

      <nav
        aria-label="Conversations"
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          padding: 8,
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}
      >
        {conversations.length === 0 ? (
          <p style={{ padding: "8px 10px", fontSize: 14, color: "#6b7280" }}>
            No conversations yet
          </p>
        ) : (
          conversations.map((conversation) => (
            <button
              key={conversation.id}
              type="button"
              onClick={() => onSelect(conversation.id)}
              aria-current={conversation.id === activeId ? "true" : undefined}
              style={{
                border: "none",
                borderRadius: 10,
                padding: "10px",
                textAlign: "left",
                background:
                  conversation.id === activeId ? "#e8f1fd" : "transparent",
                color: "#374151",
                font: "inherit",
                fontSize: 15,
                cursor: "pointer",
              }}
            >
              <span
                style={{
                  display: "block",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  fontWeight: conversation.id === activeId ? 600 : 400,
                }}
              >
                {conversation.title}
              </span>
              {conversation.updated_at && (
                <span style={{ fontSize: 12, color: "#6b7280" }}>
                  {new Date(conversation.updated_at).toLocaleDateString()}
                </span>
              )}
            </button>
          ))
        )}
      </nav>
    </aside>
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
        minHeight: 0,
        overflowY: "auto",
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