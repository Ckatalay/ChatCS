from contextlib import asynccontextmanager
from pathlib import Path

import jwt
from mcp.server import MCPServer
from mcp.server.auth.provider import AccessToken, TokenVerifier
from mcp.server.auth.settings import AuthSettings
from mcp.server.request_state import get_access_token
from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=Path(__file__).parent / ".env",
        extra="ignore",
    )

    jwt_secret: str
    db_dsn: str = (
        "host=localhost port=5433 dbname=postgres user=cve_mcp password=cve_mcp"
    )

    host: str = "127.0.0.1"
    port: int = 8001


settings = Settings()

JWT_ALG = "HS256"
MAX_ROWS = 25

pool: AsyncConnectionPool


@asynccontextmanager
async def lifespan(_server: MCPServer):
    global pool
    async with AsyncConnectionPool(settings.db_dsn, min_size=1, max_size=4) as p:
        pool = p
        yield


class ChatCSTokenVerifier(TokenVerifier):
    async def verify_token(self, token: str) -> AccessToken | None:
        try:
            payload = jwt.decode(token, settings.jwt_secret, algorithms=[JWT_ALG])
            user_id = int(payload["sub"])
        except (jwt.InvalidTokenError, KeyError, TypeError, ValueError):
            return None

        async with pool.connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    "SELECT company_id FROM users WHERE id = %s", (user_id,)
                )
                row = await cur.fetchone()

        if row is None or row[0] is None:
            return None

        return AccessToken(
            token=token,
            client_id=str(user_id),
            scopes=[],
            subject=str(user_id),
            claims={"company_id": row[0]},
        )


server = MCPServer(
    name="cve-registry",
    instructions=(
        "Look up CVEs for the signed-in user's company. Prefer search_cves for "
        "topic questions ('Chrome sandbox escapes'), get_cve when the user "
        "names an id, and known_exploited when they ask what is actively being "
        "exploited. There is no way to query another company; do not try."
    ),
    lifespan=lifespan,
    token_verifier=ChatCSTokenVerifier(),
    auth=AuthSettings(
        issuer_url="http://localhost:8000",
        resource_server_url=f"http://{settings.host}:{settings.port}",
    ),
)


def current_company_id() -> int:
    token = get_access_token()
    if token is None or not token.claims or token.claims.get("company_id") is None:
        raise ValueError("Not authenticated.")
    return int(token.claims["company_id"])


async def fetch(sql: str, params: tuple) -> list[dict]:
    company_id = current_company_id()
    async with pool.connection() as conn:
        async with conn.transaction():
            await conn.execute(
                "SELECT set_config('app.company_id', %s, true)", (str(company_id),)
            )
            async with conn.cursor(row_factory=dict_row) as cur:
                await cur.execute(sql, params)
                return await cur.fetchall()


@server.tool()
async def search_cves(query: str, limit: int = 20) -> list[dict]:
    """Search published CVEs by substring, matched against title and description.

    Use for topic questions ("Chrome sandbox escapes", "OpenSSL"). The match is
    literal, not semantic, so pass a product or technology name rather than a
    sentence. Returns newest first.
    """
    return await fetch(
        "SELECT cve_id, title, description, "
        "       status, is_cisa_kev, published_at "
        "FROM cve_registry "
        "WHERE company_id = %s AND status = 'PUBLISHED' "
        "  AND (description ILIKE %s OR title ILIKE %s) "
        "ORDER BY published_at DESC NULLS LAST "
        "LIMIT %s",
        (
            current_company_id(),
            f"%{query}%",
            f"%{query}%",
            min(limit, MAX_ROWS),
        ),
    )


@server.tool()
async def get_cve(cve_id: str) -> dict | None:
    """Fetch one CVE by its id, e.g. "CVE-2026-20316".

    Use whenever the user names an id. Returns the full record including the
    reserved/published/modified dates, or null when the id is not in this
    company's registry.
    """
    rows = await fetch(
        "SELECT cve_id, title, description, status, is_cisa_kev, "
        "       date_reserved, published_at, last_modified_at "
        "FROM cve_registry WHERE cve_id = %s AND company_id = %s",
        (cve_id.strip().upper(), current_company_id()),
    )
    return rows[0] if rows else None


@server.tool()
async def recent_cves(limit: int = 20) -> list[dict]:
    """List the most recently published CVEs, newest first.

    Use for "what's new" questions with no product or topic attached. When the
    user names a technology, prefer search_cves.
    """
    return await fetch(
        "SELECT cve_id, title, description, "
        "       is_cisa_kev, published_at "
        "FROM cve_registry "
        "WHERE company_id = %s AND status = 'PUBLISHED' "
        "ORDER BY published_at DESC NULLS LAST "
        "LIMIT %s",
        (current_company_id(), min(limit, MAX_ROWS)),
    )


@server.tool()
async def known_exploited(limit: int = 20) -> list[dict]:
    """List CVEs on the CISA Known Exploited Vulnerabilities catalog, newest first.

    These are confirmed to be exploited in the wild, so use this for "what is
    actively being exploited" and patch-priority questions.
    """
    return await fetch(
        "SELECT cve_id, title, description, "
        "       published_at "
        "FROM cve_registry "
        "WHERE company_id = %s AND is_cisa_kev "
        "ORDER BY published_at DESC NULLS LAST "
        "LIMIT %s",
        (current_company_id(), min(limit, MAX_ROWS)),
    )


if __name__ == "__main__":
    server.run(transport="streamable-http", host=settings.host, port=settings.port)
