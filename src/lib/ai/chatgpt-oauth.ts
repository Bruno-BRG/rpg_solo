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

/**
 * Models verified working with a ChatGPT Plus account on the Codex
 * backend (Sept 2026). Gating is per-account: other slugs
 * (gpt-5, gpt-5-codex, gpt-4.1, o4-mini…) return
 * "model is not supported when using Codex with a ChatGPT account".
 */
export const CHATGPT_MODELS = [
  "gpt-6-astra",
  "gpt-5.6-sol",
  "gpt-5.6-terra",
  "gpt-5.6-luna",
  "gpt-5.5",
];

/** Default model: flagship, official catalog priority 1. */
export const CHATGPT_DEFAULT_MODEL = "gpt-6-astra";

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
    private model = CHATGPT_DEFAULT_MODEL,
  ) {}

  /**
   * Non-streaming convenience: collects the SSE stream.
   * The Codex backend requires stream:true, so this drains
   * streamChat and aggregates the result.
   */
  async chat(options: ChatOptions): Promise<ChatResult> {
    let content = "";
    let toolCalls: ToolCall[] | undefined;
    for await (const chunk of this.streamChat(options)) {
      if (chunk.content) content += chunk.content;
      if (chunk.toolCalls) toolCalls = chunk.toolCalls;
    }
    return { content, toolCalls };
  }

  /**
   * ChatGPT backend Responses endpoint (Codex protocol) over SSE.
   * Follows the standard Responses API event shapes:
   * response.output_text.delta / response.function_call_arguments.delta
   * / response.output_item.done / response.completed.
   */
  async *streamChat(
    options: ChatOptions,
  ): AsyncGenerator<{ content?: string; toolCalls?: ToolCall[] }, void, unknown> {
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
        Accept: "text/event-stream",
        originator: "codex_cli_rs",
      },
      body: JSON.stringify({
        model: options.model || this.model,
        input: toResponsesInput(options.messages),
        tools: toResponsesTools(options.tools),
        store: false,
        stream: true,
      }),
    });
    if (!res.ok || !res.body) {
      throw new Error(`ChatGPT API error ${res.status}: ${await res.text()}`);
    }

    // Pending function calls keyed by item id.
    const pending = new Map<string, { callId: string; name: string; args: string }>();

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    const handleEvent = function* (
      event: string,
      data: unknown,
    ): Generator<{ content?: string; toolCalls?: ToolCall[] }> {
      const d = data as Record<string, unknown>;
      if (event === "response.output_text.delta" && typeof d.delta === "string") {
        yield { content: d.delta };
      } else if (event === "response.output_item.added") {
        const item = d.item as
          | { type?: string; id?: string; call_id?: string; name?: string }
          | undefined;
        if (item?.type === "function_call" && item.id) {
          pending.set(item.id, {
            callId: item.call_id ?? item.id,
            name: item.name ?? "",
            args: "",
          });
        }
      } else if (event === "response.function_call_arguments.delta") {
        const itemId = d.item_id as string | undefined;
        if (itemId) {
          const entry = pending.get(itemId) ?? { callId: itemId, name: "", args: "" };
          entry.args += (d.delta as string) ?? "";
          pending.set(itemId, entry);
        }
      } else if (event === "response.function_call_arguments.done") {
        const itemId = d.item_id as string | undefined;
        if (itemId) {
          const entry = pending.get(itemId) ?? { callId: itemId, name: "", args: "" };
          if (typeof d.arguments === "string") entry.args = d.arguments;
          pending.set(itemId, entry);
        }
      } else if (event === "response.output_item.done") {
        const item = d.item as
          | { type?: string; id?: string; call_id?: string; name?: string; arguments?: string }
          | undefined;
        if (item?.type === "function_call" && item.id) {
          const entry = pending.get(item.id) ?? {
            callId: item.call_id ?? item.id,
            name: "",
            args: "",
          };
          if (item.name) entry.name = item.name;
          if (typeof item.arguments === "string" && item.arguments) entry.args = item.arguments;
          pending.set(item.id, entry);
        }
      } else if (event === "response.completed") {
        if (pending.size > 0) {
          const calls: ToolCall[] = Array.from(pending.values()).map((p) => ({
            id: p.callId,
            name: p.name,
            arguments: p.args || "{}",
          }));
          pending.clear();
          yield { toolCalls: calls };
        }
      } else if (event === "response.failed") {
        const err = (d.response as { error?: unknown } | undefined)?.error;
        throw new Error(`ChatGPT response failed: ${JSON.stringify(err)}`);
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";

      for (const frame of frames) {
        const lines = frame.split("\n");
        const eventName = lines.find((l) => l.startsWith("event:"))?.slice(6).trim();
        const dataLine = lines.find((l) => l.startsWith("data:"))?.slice(5).trim();
        if (!eventName || !dataLine || dataLine === "[DONE]") continue;
        let data: unknown;
        try {
          data = JSON.parse(dataLine);
        } catch {
          continue;
        }
        yield* handleEvent(eventName, data);
      }
    }
  }

  /** Models verified against the subscription backend. */
  async listModels(): Promise<string[]> {
    return [...CHATGPT_MODELS];
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

/**
 * Convert chat messages to the Codex backend input shape.
 *
 * Wire quirks discovered empirically (Sept 2026):
 * - No `instructions` field (it breaks input validation).
 * - No `system` role ("System messages are not allowed") — the
 *   system prompt goes in as a `developer` message instead.
 * - Content parts are role-typed: `input_text` for developer/user,
 *   `output_text` for prior assistant messages.
 * - Tool loop history uses first-class items: prior assistant
 *   tool calls become `function_call` items and their results
 *   become `function_call_output` items (standard Responses API).
 */
function toResponsesInput(messages: ChatMessage[]) {
  const out: unknown[] = [];
  for (const m of messages) {
    if (m.role === "system") {
      out.push({
        type: "message",
        role: "developer",
        content: [{ type: "input_text", text: m.content }],
      });
    } else if (m.role === "assistant" && m.toolCalls?.length) {
      if (m.content) {
        out.push({
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: m.content }],
        });
      }
      for (const tc of m.toolCalls) {
        out.push({
          type: "function_call",
          call_id: tc.id,
          name: tc.name,
          arguments: tc.arguments,
        });
      }
    } else if (m.role === "tool") {
      out.push({
        type: "function_call_output",
        call_id: m.toolCallId ?? "",
        output: m.content,
      });
    } else {
      out.push({
        type: "message",
        role: m.role,
        content: [
          {
            type: m.role === "assistant" ? "output_text" : "input_text",
            text: m.content,
          },
        ],
      });
    }
  }
  return out;
}

/**
 * Convert our tool definitions to the Responses API tool shape.
 * The Codex backend accepts the standard function tool objects.
 */
function toResponsesTools(
  tools?: Array<{ type: "function"; function: { name: string; description: string; parameters: Record<string, unknown> } }>,
) {
  if (!tools || tools.length === 0) return undefined;
  return tools.map((t) => ({
    type: "function",
    name: t.function.name,
    description: t.function.description,
    parameters: t.function.parameters,
  }));
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
