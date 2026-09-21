/**
 * AI provider abstraction.
 *
 * Every AI backend (OpenAI API, ChatGPT OAuth) implements this
 * interface. The GM service depends only on the abstraction —
 * swapping providers never touches game logic.
 *
 * Design pattern: Strategy + Factory (`createProvider`).
 */

/** A single chat message. */
export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  /** Present when role === "tool". */
  toolCallId?: string;
  /** Present when role === "assistant" requesting tools. */
  toolCalls?: ToolCall[];
}

/** A tool (function) the model may call. */
export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

/** A tool invocation requested by the model. */
export interface ToolCall {
  id: string;
  /** Function name. */
  name: string;
  /** JSON-encoded arguments. */
  arguments: string;
}

/** Options for a chat completion. */
export interface ChatOptions {
  model: string;
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  temperature?: number;
  maxTokens?: number;
}

/** Non-streaming completion result. */
export interface ChatResult {
  content: string;
  toolCalls?: ToolCall[];
  /** Rough token usage when the provider reports it. */
  usage?: { promptTokens: number; completionTokens: number };
}

/**
 * Common contract for all AI providers.
 * Streaming providers implement `streamChat`; simple ones may
 * wrap non-streaming calls into an async generator.
 */
export interface AIProvider {
  readonly name: string;
  /** Send a chat completion request (non-streaming). */
  chat(options: ChatOptions): Promise<ChatResult>;
  /** Send a streaming chat completion request. */
  streamChat(
    options: ChatOptions,
  ): AsyncGenerator<{ content?: string; toolCalls?: ToolCall[] }, void, unknown>;
  /** List model identifiers available under this provider. */
  listModels(): Promise<string[]>;
}

/** Provider identifiers. */
export const PROVIDER_IDS = ["openai-api", "chatgpt-oauth"] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

/** User-facing provider metadata. */
export const PROVIDER_META: Record<
  ProviderId,
  { label: string; description: string; usesSubscription: boolean }
> = {
  "openai-api": {
    label: "OpenAI API",
    description: "Official API — pay per token, requires an API key.",
    usesSubscription: false,
  },
  "chatgpt-oauth": {
    label: "ChatGPT (Plus subscription)",
    description:
      "Codex-style OAuth login — uses your ChatGPT Plus usage limits.",
    usesSubscription: true,
  },
};
