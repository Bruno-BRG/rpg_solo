/**
 * OpenAI API provider (official, pay-per-token).
 *
 * Thin adapter over the `openai` SDK implementing `AIProvider`.
 */
import OpenAI from "openai";
import type {
  AIProvider,
  ChatOptions,
  ChatResult,
  ToolCall,
} from "./provider";

export class OpenAIApiProvider implements AIProvider {
  readonly name = "openai-api";
  private client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async chat(options: ChatOptions): Promise<ChatResult> {
    const response = await this.client.chat.completions.create({
      model: options.model,
      messages: options.messages as never,
      tools: options.tools as never,
      temperature: options.temperature ?? 0.8,
      max_tokens: options.maxTokens,
    });

    const choice = response.choices[0];
    const message = choice?.message;

    const toolCalls: ToolCall[] | undefined = message?.tool_calls?.map((tc) => ({
      id: tc.id,
      name: (tc as { function: { name: string } }).function.name,
      arguments: (tc as { function: { arguments: string } }).function.arguments,
    }));

    return {
      content: message?.content ?? "",
      toolCalls: toolCalls?.length ? toolCalls : undefined,
      usage: response.usage
        ? {
            promptTokens: response.usage.prompt_tokens,
            completionTokens: response.usage.completion_tokens,
          }
        : undefined,
    };
  }

  async *streamChat(
    options: ChatOptions,
  ): AsyncGenerator<{ content?: string; toolCalls?: ToolCall[] }, void, unknown> {
    const stream = await this.client.chat.completions.create({
      model: options.model,
      messages: options.messages as never,
      tools: options.tools as never,
      temperature: options.temperature ?? 0.8,
      max_tokens: options.maxTokens,
      stream: true,
    });

    // Accumulate tool calls across chunks (arguments stream in pieces).
    const pending = new Map<number, { id: string; name: string; args: string }>();

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      if (!delta) continue;

      if (delta.content) {
        yield { content: delta.content };
      }

      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          const entry = pending.get(tc.index) ?? { id: "", name: "", args: "" };
          if (tc.id) entry.id = tc.id;
          if ((tc as { function?: { name?: string } }).function?.name) {
            entry.name = (tc as { function?: { name?: string } }).function!.name!;
          }
          if ((tc as { function?: { arguments?: string } }).function?.arguments) {
            entry.args += (tc as { function?: { arguments?: string } }).function!.arguments!;
          }
          pending.set(tc.index, entry);
        }
      }

      if (chunk.choices[0]?.finish_reason === "tool_calls") {
        const calls: ToolCall[] = Array.from(pending.values()).map((p) => ({
          id: p.id,
          name: p.name,
          arguments: p.args,
        }));
        yield { toolCalls: calls };
        pending.clear();
      }
    }
  }

  async listModels(): Promise<string[]> {
    const models = await this.client.models.list();
    return models.data
      .map((m) => m.id)
      .filter((id) => id.startsWith("gpt") || id.startsWith("o"))
      .sort();
  }
}
