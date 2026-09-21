/**
 * OAuth pending-flow store and local callback listener.
 *
 * The Codex client_id only accepts the redirect URI
 * `http://localhost:1455/auth/callback`. This module:
 *
 *  1. Keeps pending flows (state → verifier + userId) in memory.
 *  2. Runs a tiny HTTP listener on port 1455 (like the Codex CLI)
 *     that captures the browser redirect, exchanges the code and
 *     saves the tokens for the initiating user.
 *  3. Offers a manual fallback: paste the callback URL — needed on
 *     headless servers or when port 1455 is unavailable.
 *
 * Pending flows expire after 10 minutes. The listener shuts down
 * after a capture or the same TTL.
 */
import http from "http";
import { prisma } from "../db";
import {
  buildAuthorizeUrl,
  exchangeCodeForTokens,
  CODEX_CLIENT_ID,
  CHATGPT_DEFAULT_MODEL,
  OAUTH_REDIRECT_URI,
  type OAuthTokens,
} from "./chatgpt-oauth";

/** One in-flight OAuth authorization. */
interface PendingFlow {
  userId: string;
  verifier: string;
  createdAt: number;
}

const FLOW_TTL_MS = 10 * 60 * 1000;
const LISTENER_PORT = 1455;

/** Global (hot-reload safe) state. */
const g = globalThis as unknown as {
  __rpgOauthFlows?: Map<string, PendingFlow>;
  __rpgOauthListener?: http.Server;
};
const flows = (g.__rpgOauthFlows ??= new Map());

/** Drop expired flows. */
function pruneFlows(): void {
  const now = Date.now();
  for (const [state, flow] of Array.from(flows.entries())) {
    if (now - flow.createdAt > FLOW_TTL_MS) flows.delete(state);
  }
}

/**
 * Create a pending authorization for a user.
 * Returns the URL to open in a browser.
 */
export async function createFlow(userId: string): Promise<{ url: string; state: string }> {
  pruneFlows();
  const clientId = process.env.CHATGPT_OAUTH_CLIENT_ID || CODEX_CLIENT_ID;
  const { url, state, verifier } = await buildAuthorizeUrl(clientId);
  flows.set(state, { userId, verifier, createdAt: Date.now() });
  return { url, state };
}

/** Begin (or reuse) the localhost:1455 listener. */
export function ensureListener(): void {
  if (g.__rpgOauthListener) return;
  try {
    const server = http.createServer((req, res) => {
      void handleCallbackRequest(req, res);
    });
    server.on("error", () => {
      // Port busy (e.g. real Codex CLI running): manual paste fallback applies.
      g.__rpgOauthListener = undefined;
    });
    server.listen(LISTENER_PORT, "127.0.0.1");
    g.__rpgOauthListener = server;
    // TTL shutdown.
    setTimeout(() => {
      server.close();
      if (g.__rpgOauthListener === server) g.__rpgOauthListener = undefined;
    }, FLOW_TTL_MS).unref();
  } catch {
    g.__rpgOauthListener = undefined;
  }
}

/** Handle the browser redirect arriving at localhost:1455. */
async function handleCallbackRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  const url = new URL(req.url ?? "/", OAUTH_REDIRECT_URI);

  // Ignore anything that is not the OAuth callback itself
  // (favicon, stray navigations). These have no OAuth params.
  if (req.method !== "GET" || !url.pathname.startsWith("/auth/callback")) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found.");
    return;
  }

  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  // Redirect back to the real app (NEXTAUTH_URL), NOT to this
  // listener's own origin — a relative "/settings" would resolve
  // to localhost:1455 and hit this handler again without params.
  const appBase = (process.env.NEXTAUTH_URL || "http://localhost:3000").replace(/\/$/, "");
  const finish = (ok: boolean, message: string) => {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(
      `<!doctype html><meta charset="utf-8"><title>RPG Solo</title>` +
        `<body style="font-family:system-ui;padding:40px">` +
        `<h2>${ok ? "ChatGPT account connected" : "Connection failed"}</h2>` +
        `<p>${message}</p>` +
        `<p><a href="${appBase}/settings">Back to Settings</a></p>` +
        `<script>setTimeout(()=>location.replace("${appBase}/settings"),2500)</script>`,
    );
  };

  if (!state) return finish(false, "Missing state parameter.");
  const flow = flows.get(state);
  if (!flow) return finish(false, "Unknown or expired flow. Start again from Settings.");

  if (error) {
    flows.delete(state);
    return finish(false, `Provider error: ${error}`);
  }
  if (!code) return finish(false, "Missing authorization code.");

  try {
    const tokens = await exchangeCodeForTokens(
      process.env.CHATGPT_OAUTH_CLIENT_ID || "",
      code,
      flow.verifier,
    );
    await saveTokensForUser(flow.userId, tokens);
    flows.delete(state);
    finish(true, "You can close this tab.");
  } catch (e) {
    finish(false, e instanceof Error ? e.message : "Token exchange failed.");
  }
}

/**
 * Manual fallback: complete a flow from a pasted callback URL
 * (works headless / when port 1455 is busy).
 */
export async function completeFromPastedUrl(
  callbackUrl: string,
): Promise<void> {
  pruneFlows();
  const url = new URL(callbackUrl);
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  if (!state || !code) throw new Error("URL does not contain code and state.");

  const flow = flows.get(state);
  if (!flow) throw new Error("Unknown or expired flow. Start again from Settings.");

  const tokens = await exchangeCodeForTokens(
    process.env.CHATGPT_OAUTH_CLIENT_ID || "",
    code,
    flow.verifier,
  );
  await saveTokensForUser(flow.userId, tokens);
  flows.delete(state);
}

/** Persist tokens on the user's AiSettings (upsert). */
export async function saveTokensForUser(
  userId: string,
  tokens: OAuthTokens,
): Promise<void> {
  await prisma.aiSettings.upsert({
    where: { userId },
    create: {
      userId,
      provider: "chatgpt-oauth",
      chatModel: CHATGPT_DEFAULT_MODEL,
      oauthAccessToken: tokens.accessToken,
      oauthRefreshToken: tokens.refreshToken,
      oauthExpiresAt: tokens.expiresAt ? new Date(tokens.expiresAt) : null,
      oauthAccountId: tokens.accountId,
    },
    update: {
      provider: "chatgpt-oauth",
      oauthAccessToken: tokens.accessToken,
      oauthRefreshToken: tokens.refreshToken,
      oauthExpiresAt: tokens.expiresAt ? new Date(tokens.expiresAt) : null,
      oauthAccountId: tokens.accountId,
    },
  });
}

// buildAuthorizeUrl returns the verifier together with the URL, so
// the protocol module stays the single source of PKCE logic.
