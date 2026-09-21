/**
 * ChatGPT OAuth provider (Codex-style).
 *
 * Authenticates with a ChatGPT account (Plus subscription) using
 * the same OAuth 2.0 PKCE flow the Codex CLI uses, then calls the
 * ChatGPT backend Responses API with the subscription token.
 *
 * Constants mirror the Codex CLI source (openai/codex,
 * codex-rs/login): the client_id and the localhost:1455 redirect
 * are from OpenAI's Hydra allow-list, so they must not change.
 *
 * ⚠️ Grey area: this relies on undocumented endpoints that may
 * change or be restricted. All ChatGPT-specific logic is isolated
 * in this file so it can be fixed or swapped without touching the
 * rest of the system.
 */
import type {
  AIProvider,
  ChatOptions,
  ChatResult,
  ChatMessage,
  ToolCall,
} from "./provider";

/** OAuth endpoints — same issuer the Codex CLI uses. */
const ISSUER = "https://auth.openai.com";
const AUTHORIZE_ENDPOINT = `${ISSUER}/oauth/authorize`;
const TOKEN_ENDPOINT = `${ISSUER}/oauth/token`;

/** The client_id from the Codex CLI source (public allow-list). */
export const CODEX_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";

/** The ONLY redirect_uri registered for this client (port 1455). */
export const OAUTH_REDIRECT_URI = "http://localhost:1455/auth/callback";

/** Scopes requested by the Codex CLI. */
const SCOPE = "openid profile email offline_access api.connectors.read api.connectors.invoke";

/** Extra parameters Codex appends to the authorize URL. */
const EXTRA_PARAMS: Array<[string, string]> = [
  ["id_token_add_organizations", "true"],
  ["codex_cli_simplified_flow", "true"],
  ["originator", "codex_cli_rs"],
];

/** ChatGPT backend API base (undocumented; used by Codex clients). */
const CHATGPT_API_BASE = "https://chatgpt.com/backend-api";

/** Tokens issued by the OAuth flow. */
export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  /** Epoch milliseconds. */
  expiresAt?: number;
  /** ChatGPT account id (from the id_token) — required header. */
  accountId?: string;
}

/** URL the user must open to authorize the app. */
export interface AuthorizationRequest {
  url: string;
  state: string;
  /** PKCE verifier — keep server-side until the code exchange. */
  verifier: string;
}

/** Build the authorization URL (PKCE S256 + state + Codex extras). */
export async function buildAuthorizeUrl(clientId: string): Promise<AuthorizationRequest> {
  const verifier = randomToken(48);
  const state = randomToken(32);
  const challenge = await pkceChallenge(verifier);

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: OAUTH_REDIRECT_URI,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
    scope: SCOPE,
    ...Object.fromEntries(EXTRA_PARAMS),
  });

  return {
    url: `${AUTHORIZE_ENDPOINT}?${params.toString()}`,
    state,
    verifier,
  };
}

/** Exchange an authorization code for tokens (returns verifier separately). */
export async function exchangeCodeForTokens(
  clientId: string,
  code: string,
  verifier: string,
): Promise<OAuthTokens> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      code,
      code_verifier: verifier,
      redirect_uri: OAUTH_REDIRECT_URI,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) {
    throw new Error(`OAuth token exchange failed: ${res.status} ${await res.text()}`);
  }
  return tokensFromResponse(await res.json());
}

/** Refresh an expired access token. */
export async function refreshOAuthTokens(
  clientId: string,
  refreshToken: string,
): Promise<OAuthTokens> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    throw new Error(`OAuth refresh failed: ${res.status} ${await res.text()}`);
  }
  return tokensFromResponse(await res.json());
}

/** Provider implementation backed by ChatGPT OAuth tokens. */
export class ChatGptOAuthProvider implements AIProvider {
  readonly name = "chatgpt-oauth";

  constructor(
    private getTokens: () => Promise<OAuthTokens>,
    private model = "gpt-5-codex",
  ) {}

  /** ChatGPT backend Responses endpoint (Codex protocol). */
  async chat(options: ChatOptions): Promise<ChatResult> {
    const tokens = await this.getTokens();
    if (!tokens.accountId) {
      throw new Error("ChatGPT account id missing — reconnect the account.");
    }

    const res = await fetch(`${CHATGPT_API_BASE}/codex/responses`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokens.accessToken}`,
        "chatgpt-account-id": tokens.accountId,
        "Content-Type": "application/json",
        originator: "codex_cli_rs",
      },
      body: JSON.stringify({
        model: options.model || this.model,
        instructions: options.messages.find((m) => m.role === "system")?.content,
        input: toResponsesInput(options.messages),
        store: false,
        stream: false,
      }),
    });
    if (!res.ok) {
      throw new Error(`ChatGPT API error ${res.status}: ${await res.text()}`);
    }
    return parseResponsesPayload(await res.json());
  }

  /**
   * Streaming: the backend supports SSE, but for resilience the
   * non-streaming path is used and emitted as a single chunk.
   */
  async *streamChat(
    options: ChatOptions,
  ): AsyncGenerator<{ content?: string; toolCalls?: ToolCall[] }, void, unknown> {
    const result = await this.chat(options);
    if (result.content) yield { content: result.content };
    if (result.toolCalls) yield { toolCalls: result.toolCalls };
  }

  /** Known models available through the subscription flow. */
  async listModels(): Promise<string[]> {
    return ["gpt-5-codex", "gpt-5", "gpt-5.1", "gpt-4.1", "o4-mini"];
  }
}

// ── Helpers ──────────────────────────────────────────────────

/** Normalize a token endpoint response. */
function tokensFromResponse(data: {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  id_token?: string;
}): OAuthTokens {
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined,
    accountId: data.id_token ? extractChatgptAccountId(data.id_token) : undefined,
  };
}

/**
 * Extract the chatgpt account id from the id_token JWT. The claim
 * lives either at the top level or under `https://api.openai.com/auth`.
 */
function extractChatgptAccountId(idToken: string): string | undefined {
  try {
    const payload = JSON.parse(
      Buffer.from(idToken.split(".")[1], "base64url").toString("utf8"),
    ) as Record<string, unknown>;
    const nested = payload["https://api.openai.com/auth"] as
      | { chatgpt_account_id?: string }
      | undefined;
    return (
      (nested?.chatgpt_account_id as string | undefined) ??
      (payload.chatgpt_account_id as string | undefined)
    );
  } catch {
    return undefined;
  }
}

/** Convert chat messages to the Responses API input shape. */
function toResponsesInput(messages: ChatMessage[]) {
  return messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      type: "message",
      role: m.role === "tool" ? "user" : m.role,
      content: [{ type: "input_text", text: m.content }],
    }));
}

/** Extract content/tool calls from a Responses-style payload. */
function parseResponsesPayload(data: unknown): ChatResult {
  const d = data as {
    output?: Array<{
      type?: string;
      content?: Array<{ type?: string; text?: string }>;
      name?: string;
      arguments?: string;
      call_id?: string;
    }>;
  };
  let content = "";
  const toolCalls: ToolCall[] = [];
  for (const item of d.output ?? []) {
    if (item.type === "message") {
      content += item.content?.map((c) => c.text ?? "").join("") ?? "";
    } else if (item.type === "function_call" || item.name) {
      toolCalls.push({
        id: item.call_id ?? crypto.randomUUID(),
        name: item.name ?? "",
        arguments: item.arguments ?? "{}",
      });
    }
  }
  return { content, toolCalls: toolCalls.length ? toolCalls : undefined };
}

/** Random URL-safe token (hex). */
function randomToken(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** PKCE S256 challenge from a verifier. */
async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  return base64Url(new Uint8Array(digest));
}

/** Base64url encode without padding. */
function base64Url(bytes: Uint8Array): string {
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
