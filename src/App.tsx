import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import Login from "./Login";
import Signup from "./Signup";
import Markdown from "./Markdown";
import {
  API,
  authFetch,
  fetchConversations,
  type Conversation,
  type User,
} from "./api";
import {
  CheckIcon,
  CopyIcon,
  LogoutIcon,
  PlusIcon,
  SendIcon,
  SidebarIcon,
} from "./icons";

type Message = {
  id: number;
  text: string;
  isOwn: boolean;
};

const MOBILE = "(max-width: 860px)";

const SUGGESTIONS = [
  "Explain CVE-2024-3094 and how to check if we are exposed.",
  "Write a hardening checklist for a public-facing nginx server.",
  "What is the difference between SAST, DAST and SCA?",
  "Draft an incident response plan for a ransomware detection.",
];

let nextMessageId = 1;
const newId = () => nextMessageId++;

function initials(user: User): string {
  const source = user.full_name?.trim() || user.email;
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  return (parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "");
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

  const [isMobile, setIsMobile] = useState(
    () => window.matchMedia(MOBILE).matches
  );
  const [sidebarOpen, setSidebarOpen] = useState(
    () => !window.matchMedia(MOBILE).matches
  );

  useEffect(() => {
    const query = window.matchMedia(MOBILE);
    function sync(event: MediaQueryListEvent) {
      setIsMobile(event.matches);
      setSidebarOpen(!event.matches);
    }
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

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
  }, [user]);

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
        data.messages.map((m: { role: string; content: string }) => ({
          id: newId(),
          text: m.content,
          isOwn: m.role === "user",
        }))
      );
    }
    loadMessages();

    return () => {
      cancelled = true;
    };
  }, [user, conversationId]);

  const selectConversation = useCallback(
    (id: number) => {
      setConversationId(id);
      setText("");
      if (isMobile) setSidebarOpen(false);
    },
    [isMobile]
  );

  const startNewConversation = useCallback(() => {
    setConversationId(null);
    setMessages([]);
    setText("");
    if (isMobile) setSidebarOpen(false);
  }, [isMobile]);

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

  async function send(raw: string) {
    const trimmed = raw.trim();
    if (!trimmed || isWaiting) return;

    setMessages((current) => [
      ...current,
      { id: newId(), text: trimmed, isOwn: true },
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

      if (!response.ok) {
        setMessages((current) => [
          ...current,
          {
            id: newId(),
            text: "⚠️ The assistant could not answer that request. Please try again.",
            isOwn: false,
          },
        ]);
        return;
      }

      const data = await response.json();

      setMessages((current) => [
        ...current,
        { id: newId(), text: data.reply, isOwn: false },
      ]);
      setConversationId(data.conversation_id);
      setConversations(await fetchConversations());
    } catch {
      setMessages((current) => [
        ...current,
        {
          id: newId(),
          text: "⚠️ Could not reach the server. Is the backend running?",
          isOwn: false,
        },
      ]);
    } finally {
      setIsWaiting(false);
    }
  }

  if (checkingSession) {
    return (
      <div className="boot">
        <div className="spinner" role="status" aria-label="Loading" />
      </div>
    );
  }

  if (!user) {
    return authView === "login" ? (
      <Login onLogin={setUser} onSwitchToSignup={() => setAuthView("signup")} />
    ) : (
      <Signup onSignup={setUser} onSwitchToLogin={() => setAuthView("login")} />
    );
  }

  const activeTitle =
    conversations.find((c) => c.id === conversationId)?.title ?? "New chat";

  return (
    <div className="app">
      <Sidebar
        open={sidebarOpen}
        user={user}
        conversations={conversations}
        activeId={conversationId}
        onSelect={selectConversation}
        onNewConversation={startNewConversation}
        onLogout={handleLogout}
      />

      {isMobile && sidebarOpen && (
        <button
          type="button"
          className="scrim"
          aria-label="Close sidebar"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <main className="main">
        <Thread
          title={activeTitle}
          messages={messages}
          isWaiting={isWaiting}
          onToggleSidebar={() => setSidebarOpen((open) => !open)}
          onSuggestion={send}
        />

        <Composer
          text={text}
          onTextChange={setText}
          onSend={() => send(text)}
          isWaiting={isWaiting}
        />
      </main>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Sidebar({
  open,
  user,
  conversations,
  activeId,
  onSelect,
  onNewConversation,
  onLogout,
}: {
  open: boolean;
  user: User;
  conversations: Conversation[];
  activeId: number | null;
  onSelect: (id: number) => void;
  onNewConversation: () => void;
  onLogout: () => void;
}) {
  return (
    <aside className="sidebar" data-collapsed={!open} inert={!open || undefined}>
      <div className="sidebar-head">
        <span className="brand">
          <span className="brand-mark" aria-hidden="true">
            CS
          </span>
          ChatCS
        </span>
      </div>

      <button type="button" className="new-chat" onClick={onNewConversation}>
        <PlusIcon />
        New chat
      </button>

      <nav className="conv-list" aria-label="Conversations">
        <div className="conv-list-label">Recent</div>

        {conversations.length === 0 ? (
          <p className="conv-empty">No conversations yet</p>
        ) : (
          conversations.map((conversation) => (
            <button
              key={conversation.id}
              type="button"
              className="conv"
              onClick={() => onSelect(conversation.id)}
              aria-current={conversation.id === activeId ? "true" : undefined}
            >
              <span className="conv-title">{conversation.title}</span>
              {conversation.updated_at && (
                <span className="conv-date">
                  {new Date(conversation.updated_at).toLocaleDateString()}
                </span>
              )}
            </button>
          ))
        )}
      </nav>

      <div className="sidebar-foot">
        <div className="account">
          <span className="avatar" aria-hidden="true">
            {initials(user)}
          </span>
          <span className="account-name" title={user.email}>
            {user.full_name ?? user.email}
          </span>
          <button
            type="button"
            className="icon-button"
            onClick={onLogout}
            title="Sign out"
            aria-label="Sign out"
          >
            <LogoutIcon />
          </button>
        </div>
      </div>
    </aside>
  );
}

function Thread({
  title,
  messages,
  isWaiting,
  onToggleSidebar,
  onSuggestion,
}: {
  title: string;
  messages: Message[];
  isWaiting: boolean;
  onToggleSidebar: () => void;
  onSuggestion: (text: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, isWaiting]);

  const isEmpty = messages.length === 0 && !isWaiting;

  return (
    <>
      <header className="topbar" data-scrolled={scrolled}>
        <button
          type="button"
          className="icon-button"
          onClick={onToggleSidebar}
          title="Toggle sidebar"
          aria-label="Toggle sidebar"
        >
          <SidebarIcon />
        </button>
        <h1 className="topbar-title">{title}</h1>
      </header>

      <div
        className="thread"
        ref={scrollRef}
        onScroll={(event) => setScrolled(event.currentTarget.scrollTop > 4)}
      >
        {isEmpty ? (
          <div className="empty">
            <span className="brand-mark" aria-hidden="true">
              CS
            </span>
            <h1>How can I help you today?</h1>
            <p>
              Ask about vulnerabilities, hardening, incident response, or paste
              a finding you want explained.
            </p>
            <div className="suggestions">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  className="suggestion"
                  onClick={() => onSuggestion(suggestion)}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="thread-inner">
            {messages.map((message) =>
              message.isOwn ? (
                <div key={message.id} className="turn turn-user">
                  <div className="user-bubble">{message.text}</div>
                </div>
              ) : (
                <Answer key={message.id} text={message.text} />
              )
            )}

            {isWaiting && (
              <div className="turn turn-assistant">
                <div className="assistant-head">
                  <span className="brand-mark" aria-hidden="true">
                    CS
                  </span>
                  ChatCS
                </div>
                <div className="typing" role="status" aria-label="Thinking">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            )}

            <div ref={endRef} />
          </div>
        )}
      </div>
    </>
  );
}

function Answer({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard unavailable — the text stays selectable.
    }
  }

  return (
    <div className="turn turn-assistant">
      <div className="assistant-head">
        <span className="brand-mark" aria-hidden="true">
          CS
        </span>
        ChatCS
      </div>

      <div className="answer">
        <Markdown>{text}</Markdown>
      </div>

      <div className="turn-actions">
        <button type="button" className="ghost-button" onClick={copy}>
          {copied ? <CheckIcon /> : <CopyIcon />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}

function Composer({
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Grow the textarea with its content, up to the CSS max-height.
  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [text]);

  const canSend = text.trim() !== "" && !isWaiting;

  return (
    <div className="composer-wrap">
      <form
        className="composer"
        onSubmit={(event) => {
          event.preventDefault();
          onSend();
        }}
      >
        <textarea
          ref={textareaRef}
          rows={1}
          value={text}
          onChange={(event) => onTextChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              onSend();
            }
          }}
          placeholder="Ask ChatCS anything about security…"
          aria-label="Message"
        />

        <button
          type="submit"
          className="send"
          disabled={!canSend}
          title="Send"
          aria-label="Send message"
        >
          <SendIcon />
        </button>
      </form>

      <p className="composer-hint">
        Enter to send · Shift + Enter for a new line
      </p>
    </div>
  );
}

export default App;
