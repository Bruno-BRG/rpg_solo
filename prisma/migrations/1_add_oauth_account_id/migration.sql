-- ─────────────────────────────────────────────────────────────
-- Add the ChatGPT account id column (extracted from the OAuth
-- id_token; required as a request header by the Codex backend).
-- ─────────────────────────────────────────────────────────────
ALTER TABLE "AiSettings" ADD COLUMN "oauthAccountId" TEXT;
