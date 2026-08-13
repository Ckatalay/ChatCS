import logging
import re
from fastmcp import Client
from ollama import AsyncClient

log = logging.getLogger("chatcs.cve")

MCP_URL = "http://localhost:8001/mcp"
MAX_ROUNDS = 2
MAX_CONTEXT_CHARS = 12000

TOOL_SYSTEM_PROMPT = """You have read access to a CVE registry covering every
published CVE, not only the ones this company tracks.

Call a tool when the answer depends on a real vulnerability record: its id,
dates, description, exploitation status, or whether this company tracks it.
Always call get_cve when the user names a CVE id — the registry answers for any
id, and it is the only way to tell whether this company is among the affected.
Answer without tools when the question is about general security concepts,
definitions, or practices — the registry holds vulnerability records, not
explanations.

Do not write a reply. Only decide which tools to call, if any."""


def _to_ollama_tools(mcp_tools) -> list[dict]:
    return [
        {
            "type": "function",
            "function": {
                "name": tool.name,
                "description": tool.description or "",
                "parameters": tool.inputSchema,
            },
        }
        for tool in mcp_tools
    ]


def _date(value) -> str | None:
    if value is None:
        return None
    text = str(value)
    return text[:10] if len(text) >= 10 else text


def _render_row(row: dict, membership: str = "mark") -> str:
    heading = row.get("cve_id") or "(unidentified)"
    if row.get("title"):
        heading = f"{heading} — {row['title']}"

    facts = []
    # The tools return a membership flag and never a company identifier, so
    # this phrase is the whole of what the model can learn about tenancy. Said
    # first because "are we affected?" is the question behind most lookups.
    # "mark" calls out only the hits, which is what a list wants; "state" says
    # it either way, which is what a single named CVE wants; "skip" is for
    # results whose heading already says every row is a hit.
    tracked = row.get("in_company_registry")
    if membership != "skip" and tracked is not None:
        if tracked:
            facts.append("tracked in this company's own registry")
        elif membership == "state":
            facts.append("not in this company's own registry")
    if row.get("is_cisa_kev"):
        facts.append("confirmed exploited in the wild (CISA KEV)")
    if (status := row.get("status")) and status != "PUBLISHED":
        facts.append(f"marked {str(status).lower()}")
    for label, key in (
        ("published", "published_at"),
        ("reserved", "date_reserved"),
        ("last updated", "last_modified_at"),
    ):
        if formatted := _date(row.get(key)):
            facts.append(f"{label} {formatted}")

    lines = [f"**{heading}**"]
    if facts:
        sentence = ", ".join(facts)
        lines.append(sentence[0].upper() + sentence[1:] + ".")
    if description := row.get("description"):
        lines.append(re.sub(r"\n\s*\n+", "\n\n", str(description).strip()))
    return "\n".join(lines)


def _render(call_name: str, arguments: dict, rows) -> str:
    if rows is None or rows == []:
        if call_name == "get_cve" and (target := arguments.get("cve_id")):
            return f"No CVE with the id {target} exists in the registry."
        target = arguments.get("cve_id") or arguments.get("query")
        return f"No registry records{f' for {target}' if target else ''}."

    if isinstance(rows, dict):
        rows = [rows]

    if call_name == "known_exploited":
        rows = [{**row, "is_cisa_kev": True} for row in rows if isinstance(row, dict)]

    headings = {
        "search_cves": f'Registry records mentioning "{arguments.get("query", "")}"',
        "get_cve": "Registry record",
        "recent_cves": "Most recently published registry records",
        "known_exploited": "Registry records confirmed exploited in the wild",
        "company_cves": "Registry records this company tracks",
    }
    heading = headings.get(call_name, "Registry records")
    membership = {"get_cve": "state", "company_cves": "skip"}.get(call_name, "mark")
    body = "\n\n".join(
        _render_row(row, membership) for row in rows if isinstance(row, dict)
    )
    return f"## {heading} ({len(rows)})\n\n{body}"


async def gather_cve_context(
    user_text: str, history: list[dict], access_token: str, model: str
) -> str:
    blocks: list[str] = []

    async with Client(MCP_URL, auth=access_token) as mcp:
        tools = _to_ollama_tools(await mcp.list_tools())

        messages = [
            {"role": "system", "content": TOOL_SYSTEM_PROMPT},
            *history,
            {"role": "user", "content": user_text},
        ]

        ollama = AsyncClient()
        for _ in range(MAX_ROUNDS):
            response = await ollama.chat(
                model=model,
                messages=messages,
                tools=tools,
                stream=False,
                think=False,
                options={"temperature": 0, "num_ctx": 32768},
            )
            calls = response["message"].get("tool_calls") or []
            if not calls:
                break

            messages.append(response["message"])
            for call in calls:
                name = call["function"]["name"]
                arguments = dict(call["function"]["arguments"] or {})
                try:
                    result = await mcp.call_tool(name, arguments)
                    rows = result.data
                    rows = getattr(rows, "result", rows)
                except Exception:
                    log.exception("tool %s failed", name)
                    messages.append(
                        {"role": "tool", "name": name, "content": "tool call failed"}
                    )
                    continue

                log.info(
                    "cve tool: %s(%s) -> %s rows",
                    name,
                    arguments,
                    len(rows) if isinstance(rows, list) else int(rows is not None),
                )
                block = _render(name, arguments, rows)
                blocks.append(block)
                messages.append({"role": "tool", "name": name, "content": block})

    if not blocks:
        return ""

    context = "\n\n".join(blocks)
    if len(context) > MAX_CONTEXT_CHARS:
        context = context[:MAX_CONTEXT_CHARS] + "\n\n[truncated]"
    return context
