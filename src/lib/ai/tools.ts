/**
 * AI tool layer — function-calling definitions and executors.
 *
 * The AI GM interacts with the game through these tools: rolling
 * dice, consulting the oracle, searching campaign lore, writing
 * journal entries and updating story state.
 *
 * Pattern: Command — each tool declares a schema (for the model)
 * and an execute function (for the runtime).
 */
import { z } from "zod";
import { rollTrait, rollPlain } from "../rules/dice";
import { askFateChart, LIKELIHOODS, type Likelihood } from "../oracle/fate-chart";
import { randomEvent, detailAction, detailSubject, setupScene } from "../oracle/random-events";
import { searchLore } from "../rag/lore";

// ── Tool schemas (Zod is the single source of truth) ─────────

const rollDiceSchema = z.object({
  dieStep: z
    .number()
    .int()
    .min(3)
    .max(12)
    .describe("Trait die step: 3=d4-1, 4, 6, 8, 10, 12"),
  targetNumber: z.number().int().default(4).describe("Target number (default 4)"),
  modifier: z.number().int().default(0).describe("Situational modifier"),
  description: z.string().describe("What is being attempted"),
});

const oracleSchema = z.object({
  question: z.string().describe("The yes/no question"),
  likelihood: z.enum(LIKELIHOODS).describe("How likely a Yes is"),
});

const searchLoreSchema = z.object({
  query: z.string().describe("What to search in campaign memory"),
  limit: z.number().int().min(1).max(10).default(5),
});

const journalSchema = z.object({
  title: z.string().describe("Scene title / entry heading"),
  body: z.string().describe("Narrative journal entry (markdown)"),
  summary: z.string().describe("One-paragraph recap for context"),
});

const threadSchema = z.object({
  action: z.enum(["add", "resolve", "abandon", "list"]),
  summary: z.string().optional(),
});

const castSchema = z.object({
  action: z.enum(["add", "update", "list"]),
  name: z.string().optional(),
  description: z.string().optional(),
  stance: z.enum(["Neutral", "Friendly", "Hostile"]).optional(),
});

/** Map of tool name → Zod schema. */
export const TOOL_SCHEMAS = {
  roll_dice: rollDiceSchema,
  ask_oracle: oracleSchema,
  search_lore: searchLoreSchema,
  save_journal_entry: journalSchema,
  update_threads: threadSchema,
  update_cast: castSchema,
} as const;

export type ToolName = keyof typeof TOOL_SCHEMAS;

/** OpenAI function-calling definitions derived from the schemas. */
export function toolDefinitions() {
  return Object.entries(TOOL_SCHEMAS).map(([name, schema]) => ({
    type: "function" as const,
    function: {
      name,
      description: TOOL_DESCRIPTIONS[name as ToolName],
      parameters: zodToJsonSchema(schema),
    },
  }));
}

const TOOL_DESCRIPTIONS: Record<ToolName, string> = {
  roll_dice:
    "Roll a Savage Worlds trait check (wild die included). Use for any dramatic task.",
  ask_oracle:
    "Ask the Mythic oracle a yes/no question about the story. Use when the outcome is uncertain and should not be invented.",
  search_lore:
    "Search the campaign's memory (journal, characters, rules) for relevant context before narrating.",
  save_journal_entry:
    "Persist a narrative journal entry summarizing what just happened in the scene. Call at scene end or on significant events.",
  update_threads:
    "Manage plot threads: add new ones, resolve, abandon, or list active ones (Mythic thread tracking).",
  update_cast:
    "Manage story characters (NPCs): add, update stance/description, or list the current cast.",
};

/** Context passed to tool executors. */
export interface ToolContext {
  campaignId: string;
  chaosRank: number;
  sceneId?: string;
  askedBy: "player" | "ai";
}

/** Execute a tool by name with JSON arguments. */
export async function executeTool(
  name: string,
  argsJson: string,
  ctx: ToolContext,
): Promise<unknown> {
  const schema = TOOL_SCHEMAS[name as ToolName];
  if (!schema) throw new Error(`Unknown tool: ${name}`);

  const args = schema.parse(safeParse(argsJson));

  switch (name as ToolName) {
    case "roll_dice": {
      const a = args as z.infer<typeof rollDiceSchema>;
      const result = rollTrait(a.dieStep, a.targetNumber, a.modifier);
      return { description: a.description, ...result };
    }
    case "ask_oracle": {
      const a = args as z.infer<typeof oracleSchema>;
      const fate = askFateChart(a.question, a.likelihood as Likelihood, ctx.chaosRank);
      // Doubles → event trigger: include event details for the AI.
      if (fate.randomEvent) {
        return { ...fate, randomEventDetails: randomEvent() };
      }
      return fate;
    }
    case "search_lore": {
      const a = args as z.infer<typeof searchLoreSchema>;
      const hits = await searchLore(ctx.campaignId, a.query, a.limit);
      return { results: hits };
    }
    case "save_journal_entry": {
      // Persisted by the caller (chat service) — return parsed payload.
      return { ok: true, ...args };
    }
    case "update_threads":
    case "update_cast": {
      // Same: the chat service applies mutations and returns state.
      return { ok: true, ...args };
    }
    default:
      throw new Error(`Tool not wired: ${name}`);
  }
}

/** Also expose dice/random-event helpers for direct (non-AI) routes. */
export { rollPlain, randomEvent, detailAction, detailSubject, setupScene };

function safeParse(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    return {};
  }
}

/**
 * Convert a Zod object schema to a JSON Schema subset usable by
 * OpenAI function calling (no external dependency needed).
 */
function zodToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  const shape = (schema as unknown as { _def: { shape: () => Record<string, z.ZodTypeAny> } })
    ._def.shape();
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const [key, field] of Object.entries(shape)) {
    const json = zodFieldToJson(field);
    properties[key] = json.schema;
    if (json.required) required.push(key);
  }

  return { type: "object", properties, required };
}

function zodFieldToJson(field: z.ZodTypeAny): {
  schema: Record<string, unknown>;
  required: boolean;
} {
  const def = (field as unknown as { _def: Record<string, unknown> })._def;
  const typeName = def.typeName as string;
  const isOptional = typeName === "ZodDefault" || typeName === "ZodOptional";

  switch (typeName) {
    case "ZodString":
      return { schema: { type: "string" }, required: true };
    case "ZodNumber":
      return { schema: { type: "number" }, required: true };
    case "ZodEnum": {
      const values = def.values as string[];
      return { schema: { type: "string", enum: values }, required: true };
    }
    case "ZodDefault": {
      const inner = zodFieldToJson(def.innerType as z.ZodTypeAny);
      return { schema: inner.schema, required: false };
    }
    case "ZodOptional": {
      const inner = zodFieldToJson(def.innerType as z.ZodTypeAny);
      return { schema: inner.schema, required: false };
    }
    default:
      return { schema: { type: "string" }, required: !isOptional };
  }
}
