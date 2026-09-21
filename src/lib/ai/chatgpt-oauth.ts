/**
 * ChatGPT OAuth provider (Codex-style).
 *
 * Authenticates with a ChatGPT account (Plus subscription) using
 * the same OAuth 2.0 PKCE device/authorization flow the Codex CLI
 * uses, then exchanges the ChatGPT token for model access.
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

/** OAuth endpoints (auth.openai.com — same host the Codex CLI uses). */
const AUTH_BASE = "https://auth.openai.com";
/** ChatGPT backend API base (undocumented; used by Codex-style clients). */
const CHATGPT_API_BASE = "https://chatgpt.com/backend-api";

/** Tokens issued by the OAuth flow. */
export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  /** Epoch milliseconds. */
  expiresAt?: number;
}

/** Browser-open URL the user must visit to authorize the app. */
export interface AuthorizationRequest {
  url: string;
  /** PKCE verifier to keep server-side until callback. */
  verifier: string;
  /** State parameter for CSRF protection. */
  state: string;
}

/**
 * Build the authorization URL (PKCE + state).
 * Requires OAuth client credentials registered for the Codex flow.
 */
export async function beginOAuth(
  clientId: string,
  redirectUri: string,
): Promise<AuthorizationRequest> {
  const verifier = randomToken(64);
  const state = randomToken(16);
  const challenge = await pkceChallenge(verifier);

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid profile email offline_access",
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
  });

  return {
    url: `${AUTH_BASE}/authorize?${params.toString()}`,
    verifier,
    state,
  };
}

/** Exchange the authorization code for tokens. */
export async function completeOAuth(
  clientId: string,
  code: string,
  verifier: string,
  redirectUri: string,
): Promise<OAuthTokens> {
  const res = await fetch(`${AUTH_BASE}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      code,
      code_verifier: verifier,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`OAuth token exchange failed: ${res.status}`);
  const data = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  };
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined,
  };
}

/** Refresh an expired access token. */
export async function refreshOAuth(
  clientId: string,
  refreshToken: string,
): Promise<OAuthTokens> {
  const res = await fetch(`${AUTH_BASE}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`OAuth refresh failed: ${res.status}`);
  const data = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  };
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? refreshToken,
    expiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined,
  };
}

/** Provider implementation backed by ChatGPT OAuth tokens. */
export class ChatGptOAuthProvider implements AIProvider {
  readonly name = "chatgpt-oauth";

  constructor(
    private getTokens: () => Promise<OAuthTokens>,
    private model = "gpt-5-codex",
  ) {}

  /**
   * ChatGPT backend responses endpoint. Mirrors the OpenAI
   * Responses API shape loosely; adapted per current behavior.
   */
  async chat(options: ChatOptions): Promise<ChatResult> {
    const tokens = await this.getTokens();
    const res = await fetch(`${CHATGPT_API_BASE}/codex/responses`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokens.accessToken}`,
        "Content-Type": "application/json",
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
    const data = await res.json();
    return parseResponsesPayload(data);
  }

  async *streamChat(
    options: ChatOptions,
  ): AsyncGenerator<{ content?: string; toolCalls?: ToolCall[] }, void, unknown> {
    // Streaming for the ChatGPT backend uses SSE; for resilience the
    // non-streaming path is used and emitted as a single chunk.
    const result = await this.chat(options);
    if (result.content) yield { content: result.content };
    if (result.toolCalls) yield { toolCalls: result.toolCalls };
  }

  async listModels(): Promise<string[]> {
    // Known models available through the subscription flow.
    return ["gpt-5-codex", "gpt-5", "gpt-4.1", "o4-mini"];
  }
}

// ── Helpers ──────────────────────────────────────────────────

/** Convert chat messages to the Responses API input shape. */
function toResponsesInput(messages: ChatMessage[]) {
  return messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role, content: m.content }));
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

/** Random URL-safe token. */
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
