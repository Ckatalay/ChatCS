import logging
import secrets
from datetime import datetime, timedelta, timezone
from pathlib import Path
from fastapi import Cookie, FastAPI, HTTPException, Response, Depends
from fastapi.middleware.cors import CORSMiddleware
from nemoguardrails import LLMRails, RailsConfig
from pydantic import BaseModel
import psycopg
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

app = FastAPI()
ph = PasswordHasher()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SESSION_TTL = timedelta(days=7)
SESSION_COOKIE = "session_token"


def create_session(user_id: int) -> str:
    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + SESSION_TTL
    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO sessions (token, user_id, expires_at) VALUES (%s, %s, %s)",
            (token, user_id, expires_at),
        )
    conn.commit()
    return token


def set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=SESSION_COOKIE,
        value=token,
        httponly=True,
        samesite="lax",
        max_age=int(SESSION_TTL.total_seconds()),
    )


class MessageIn(BaseModel):
    text: str
    conversation_id: int | None = None


class SignupIn(BaseModel):
    email: str
    password: str
    full_name: str | None = None
    company: str | None = None


class LoginIn(BaseModel):
    email: str
    password: str


@app.post("/auth/signup")
def signup(data: SignupIn, response: Response):
    email = data.email.strip()
    if not email or not data.password:
        raise HTTPException(status_code=422, detail="Email and password are required")
    if "@" not in email:
        raise HTTPException(status_code=422, detail="Invalid email address")

    password_hash = ph.hash(data.password)
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT 1 FROM users WHERE email = %s", (email,))
            if cur.fetchone() is not None:
                raise HTTPException(
                    status_code=409, detail="Email is already registered"
                )
            company_id = find_or_create_companies(email, data.company)
            cur.execute(
                "INSERT INTO users (email, password_hash, full_name, company_id) "
                "VALUES (%s, %s, %s, %s) RETURNING id",
                (email, password_hash, data.full_name, company_id),
            )
            user_id = cur.fetchone()[0]
        conn.commit()
    except Exception:
        conn.rollback()
        raise

    set_session_cookie(response, create_session(user_id))
    return {
        "ok": True,
        "user": {"id": user_id, "email": email, "full_name": data.full_name},
    }

@app.post("/auth/login")
def login(data: LoginIn, response: Response):
    with conn.cursor() as cur:
        cur.execute(
            "SELECT id, email, password_hash, full_name FROM users WHERE email = %s",
            (data.email.strip(),),
        )
        row = cur.fetchone()
    conn.commit()

    if row is None:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    user_id, email, password_hash, full_name = row

    try:
        ph.verify(password_hash, data.password)
    except VerifyMismatchError:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if ph.check_needs_rehash(password_hash):
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE users SET password_hash = %s WHERE id = %s",
                    (ph.hash(data.password), user_id),
                )
            conn.commit()
        except Exception:
            conn.rollback()

    set_session_cookie(response, create_session(user_id))
    return {"ok": True, "user": {"id": user_id, "email": email, "full_name": full_name}}

@app.post("/auth/logout")
def logout(response: Response, session_token: str | None = Cookie(None)):
    if session_token is None:
        raise HTTPException(status_code=401, detail="Not authenticated")

    with conn.cursor() as cur:
        cur.execute(
            "DELETE FROM sessions WHERE token = %s",
            (session_token,),
        )
        conn.commit()

    response.delete_cookie(SESSION_COOKIE)
    return {"ok": True}

conn = psycopg.connect(
    host="localhost",
    port=5433,
    dbname="postgres",
    user="postgres",
    password="postgres",
)

def get_conversation(conversation_id: int, user_id: int) -> int | None:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT id FROM conversations WHERE id = %s AND user_id = %s",
            (conversation_id, user_id),
        )
        row = cur.fetchone()
    conn.commit()
    return row[0] if row is not None else None

def create_conversation(user_id: int) -> int:
    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO conversations (user_id) VALUES (%s) RETURNING id",
            (user_id,),
        )
        row = cur.fetchone()
    conn.commit()
    return row[0]

def log_exchange(conversation_id: int, user_text: str, reply: str) -> None:
    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO messages (conversation_id, role, content) "
            "VALUES (%s, 'user', %s), (%s, 'assistant', %s)",
            (conversation_id, user_text, conversation_id, reply),
        )
        cur.execute(
            "UPDATE conversations SET updated_at = now() WHERE id = %s",
            (conversation_id,),
        )
    conn.commit()

def get_current_user(session_token: str | None = Cookie(None)) -> int:
    if session_token is None:
        raise HTTPException(status_code=401, detail="Not authenticated")

    with conn.cursor() as cur:
        cur.execute(
            "SELECT user_id FROM sessions WHERE token = %s AND expires_at > now()",
            (session_token,),
        )
        row = cur.fetchone()
    conn.commit()

    if row is None:
        raise HTTPException(401, detail="Session invalid or expired")
    return row[0]

guardrails_log = logging.getLogger("chatcs.guardrails")
guardrails_log.setLevel(logging.INFO)
guardrails_log.addHandler(logging.StreamHandler())

config = RailsConfig.from_path(str(Path(__file__).parent / "guardrails_config"))
rails = LLMRails(config)
@app.get("/conversations")
async def list_conversations(user_id: int = Depends(get_current_user)):
    with conn.cursor() as cur:
        cur.execute(
            "SELECT c.id, c.updated_at, first_message.content "
            "FROM conversations c "
            "LEFT JOIN LATERAL ("
            "SELECT content FROM messages "
            "WHERE conversation_id = c.id AND role = 'user' "
            "ORDER BY id LIMIT 1"
            ") AS first_message ON true "
            "WHERE c.user_id = %s "
            "ORDER BY COALESCE(c.updated_at, c.started_at) DESC, c.id DESC",
            (user_id,),
        )
        rows = cur.fetchall()
    conn.commit()

    return {
        "ok": True,
        "conversations": [
            {
                "id": conversation_id,
                "title": title or "New conversation",
                "updated_at": updated_at.isoformat() if updated_at else None,
            }
            for conversation_id, updated_at, title in rows
        ],
    }

@app.post("/messages")
async def create_message(message: MessageIn, user_id: int = Depends(get_current_user)):
    if message.conversation_id is None:
        conversation_id = create_conversation(user_id)
    else:
        conversation_id = get_conversation(message.conversation_id, user_id)
        if conversation_id is None:
            raise HTTPException(status_code=404, detail="Conversation not found")

    result = await rails.generate_async(
        messages=[{"role": "user", "content": message.text}]
    )
    reply = result["content"]

    log_exchange(conversation_id, message.text, reply)

    return {"ok": True, "reply": reply, "conversation_id": conversation_id}

@app.get("/messages")
async def get_messages(
    conversation_id: int | None = None, user_id: int = Depends(get_current_user)
):
    if conversation_id is None:
        return {"ok": True, "messages": []}

    conv_id = get_conversation(conversation_id, user_id)
    if conv_id is None:
        raise HTTPException(status_code=404, detail="Conversation not found")

    with conn.cursor() as cur:
        cur.execute(
            "SELECT role, content FROM messages WHERE conversation_id = %s ORDER BY id",
            (conv_id,),
        )
        rows = cur.fetchall()
    conn.commit()

    return {
        "ok": True, 
        "messages": [{"role": role, "content": content} for role, content in rows]
    }

@app.get("/auth/me")
async def get_user(user_id: int = Depends(get_current_user)):
    with conn.cursor() as cur:
        cur.execute(
            "SELECT id, email, full_name FROM users WHERE id = %s",
            (user_id,),
        )
        row = cur.fetchone()
    conn.commit()

    if row is None:
        raise HTTPException(401, detail="User not signed in.")

    id, email, name = row
    return {"ok": True, "user": {"id": id, "email": email, "full_name": name}}

def find_or_create_companies(email: str, name: str | None = None) -> int:
    domain = email.rsplit("@", 1)[-1].lower()
    with conn.cursor() as cur:
        cur.execute(
            "SELECT id FROM companies WHERE domain = %s",
            (domain,),
        )
        row = cur.fetchone()
        if row is None:
            cur.execute(
                "INSERT INTO companies (name, domain) VALUES (%s, %s) RETURNING id",
                (name or domain, domain),
            )
            row = cur.fetchone()
    conn.commit()
    return row[0]