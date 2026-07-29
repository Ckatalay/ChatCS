-- ChatCS schema.
--
-- Applied by the postgres image on first boot only (empty data volume).
-- To re-run: docker compose down -v && docker compose up -d
--
-- Reconstructed from the live database; keep in sync when tables change.

-- users.email is citext so lookups are case-insensitive without lower().
CREATE EXTENSION IF NOT EXISTS citext;


CREATE TABLE IF NOT EXISTS companies (
    id          bigserial PRIMARY KEY,
    name        text NOT NULL,
    domain      text,
    created_at  timestamptz NOT NULL DEFAULT now()
);

-- find_or_create_companies() looks companies up by domain.
CREATE UNIQUE INDEX IF NOT EXISTS companies_domain_key ON companies (domain);


CREATE TABLE IF NOT EXISTS users (
    id             bigserial PRIMARY KEY,
    company_id     bigint REFERENCES companies (id),
    email          citext NOT NULL UNIQUE,
    password_hash  text NOT NULL,
    full_name      text,
    role           text NOT NULL DEFAULT 'member',
    created_at     timestamptz NOT NULL DEFAULT now()
);


-- Opaque session tokens; the PK is the token itself.
CREATE TABLE IF NOT EXISTS sessions (
    token       text PRIMARY KEY,
    user_id     bigint NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at  timestamptz NOT NULL DEFAULT now(),
    expires_at  timestamptz NOT NULL
);


CREATE TABLE IF NOT EXISTS conversations (
    id          bigserial PRIMARY KEY,
    user_id     bigint NOT NULL REFERENCES users (id),
    started_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

-- list_conversations() filters the sidebar by owner.
CREATE INDEX IF NOT EXISTS conversations_user_id_idx ON conversations (user_id);


CREATE TABLE IF NOT EXISTS messages (
    id               bigserial PRIMARY KEY,
    conversation_id  bigint NOT NULL REFERENCES conversations (id),
    role             text NOT NULL,
    content          text NOT NULL,
    created_at       timestamptz NOT NULL DEFAULT now()
);

-- Both message reads are "one conversation, ordered by id": the full thread in
-- get_messages(), and the LATERAL first-user-message title in
-- list_conversations(). Leading id keeps the sort in the index.
CREATE INDEX IF NOT EXISTS messages_conversation_id_id_idx
    ON messages (conversation_id, id);
