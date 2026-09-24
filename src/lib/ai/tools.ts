/**
 * AI tool layer — function-calling definitions and executors.
 *
 * The AI GM interacts with the game through these tools: rolling
 * dice and combat damage, consulting the oracle and tables,
 * generating NPCs, running interludes and dramatic tasks,
 * searching campaign lore, writing journal entries and updating
 * story state.
 *
 * Pattern: Command — each tool declares a schema (for the model)
 * and an execute function (for the runtime).
 *
 * Stateless tools (dice, oracle, generation) return pure results;
 * stateful tools (dramatic tasks, XP) persist directly, mirroring
 * the `search_lore` precedent. Narrative side effects (journal,
 * threads, cast, scenes, chaos) are applied by the GM engine.
 */
import { z } from "zod";
import { rollTrait, rollPlain } from "../rules/dice";
import {
  damageRoll,
  rollInitiative,
  summarizeDamage,
} from "../rules/combat";
import {
  advanceTaskRound,
  applyTaskRoll,
  createDramaticTask,
  taskProgress,
  type DramaticTask,
} from "../rules/dramatic-tasks";
import { runInterlude } from "../rules/interludes";
import { awardXp, progress as progression } from "../rules/progression";
import { askFateChart, LIKELIHOODS, type Likelihood } from "../oracle/fate-chart";
import { randomEvent, detailAction, detailSubject, setupScene } from "../oracle/random-events";
import { generateNpc, formatNpc, type NpcGenre } from "../oracle/npc";
import { rollOnEntries, rollOnTable, TABLE_GENRES } from "../oracle/tables";
import { ingestDocument, resolveEmbeddingKey, searchLore } from "../rag/lore";
import { FACT_CATEGORIES, normalizeFactText } from "../gm/knowledge";
import { prisma } from "../db";

// ── Tool schemas (Zod is the single source of truth) ─────────

const rollDiceSchema = z.object({
  dieStep: z
    .number()
    .int()
    .min(3)
    .max(12)
    .describe("Trait die step: 3=d4-1, 4, 6, 8, 10, 12"),
  targetNumber: z.number().int().default(4).describe(
    "Target number: 4 for tasks/Soak/Unshake, the defender's Parry for attacks",
  ),
  modifier: z.number().int().default(0).describe("Situational modifier"),
  description: z.string().describe("What is being attempted"),
});

const rollDamageSchema = z.object({
  weaponDice: z
    .array(z.number().int().min(3).max(12))
    .min(1)
    .max(4)
    .describe("Weapon damage die/dice by sides (e.g. [6] or [6, 6]); dice ace"),
  attackRaises: z.number().int().min(0).max(5).default(0).describe(
    "Raises on the attack roll — each grants +1d6 (SWADE)",
  ),
  toughness: z.number().int().min(1).max(30).describe("Defender's Toughness"),
  isExtra: z.boolean().default(false).describe(
    "True for mooks/extras: a raise over Toughness takes them out",
  ),
  modifier: z.number().int().min(-10).max(10).default(0),
  targetName: z.string().optional().describe("Who is being hit"),
});

const rollInitiativeSchema = z.object({
  participants: z
    .array(
      z.object({
        name: z.string().describe("Combatant name"),
        actor: z.enum(["wildcard", "extra"]).optional().describe(
          "wildcard = PC/named NPC (hero's luck); extra = mook",
        ),
      }),
    )
    .min(1)
    .max(12)
    .describe("Everyone rolling for the round (d6+d6, doubles = Joker)"),
});

const oracleSchema = z.object({
  question: z.string().describe("The yes/no question"),
  likelihood: z.enum(LIKELIHOODS).describe("How likely a Yes is"),
});

const randomEventSchema = z.object({
  reason: z.string().optional().describe("What triggered the event (context for the story)"),
});

const rollTableSchema = z.object({
  table: z
    .string()
    .describe("Built-in table id (e.g. 'fantasy-encounter') or the name of a custom table"),
});

const npcSchema = z.object({
  genre: z
    .enum(["fantasy", "scifi", "western", "noir", "horror", "universal"] as [NpcGenre, ...NpcGenre[]])
    .optional()
    .describe("Name/occupation pool — match the campaign genre"),
  purpose: z.string().optional().describe("Why this NPC exists in the scene"),
});

const interludeSchema = z.object({
  context: z.string().optional().describe("Where/when the interlude happens"),
});

const setupSceneCheckSchema = z.object({
  applyToScene: z
    .boolean()
    .default(false)
    .describe("Mark the current scene with the rolled type (Set/Altered/Interrupt)"),
});

const startTaskSchema = z.object({
  name: z.string().describe("What the party is racing against time to do"),
  skills: z
    .array(z.string())
    .min(1)
    .max(6)
    .describe("Skills that may be used to advance the task"),
  requiredSuccesses: z.number().int().min(1).max(30).default(10).describe(
    "Tokens needed (SWADE default 10)",
  ),
  timeLimit: z.number().int().min(1).max(12).default(4).describe(
    "Rounds/actions before it fails (default 4)",
  ),
});

const advanceTaskSchema = z.object({
  taskName: z.string().optional().describe("Defaults to the running task"),
  skill: z.string().describe("Skill used for this attempt"),
  dieStep: z.number().int().min(3).max(12).describe("The skill's die step"),
  modifier: z.number().int().min(-10).max(10).default(0),
});

const awardXpSchema = z.object({
  characterName: z.string().optional().describe(
    "Whose sheet to credit; omit to award the whole party",
  ),
  amount: z.number().int().min(1).max(5).default(1).describe("XP (1 normal, 2–3 for hard-won scenes)"),
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

const chaosSchema = z.object({
  rank: z.number().int().min(1).max(9).describe("New Mythic chaos rank (1=boring, 9=insane)"),
  reason: z.string().describe("One-line reason for the change"),
});

const openSceneSchema = z.object({
  title: z.string().min(1).describe("Scene title"),
  goal: z.string().optional().describe("Player-authored intent (if known)"),
  type: z
    .enum(["Set", "Altered", "Interrupt"])
    .optional()
    .describe("Rolled scene check result, when known"),
});

const closeSceneSchema = z.object({
  reason: z.string().optional().describe("Why the scene ends"),
});

const updateCharacterSchema = z.object({
  name: z.string().describe("Character name (matched case-insensitively)"),
  bennies: z.number().int().min(0).max(10).optional(),
  wounds: z.number().int().min(0).max(5).optional(),
  fatigue: z.number().int().min(0).max(3).optional(),
  powerPoints: z.number().int().min(0).max(100).optional(),
  shaken: z.boolean().optional().describe("True to mark the character Shaken (UI hint)"),
});

const rememberFactsSchema = z.object({
  action: z.enum(["add", "update", "archive", "list"]),
  facts: z
    .array(
      z.object({
        category: z.enum(FACT_CATEGORIES),
        text: z.string().min(3).max(600),
        importance: z.number().int().min(1).max(3).default(2),
      }),
    )
    .max(20)
    .optional()
    .describe("Facts to record (action=add)"),
  match: z
    .string()
    .max(600)
    .optional()
    .describe("Text fragment identifying an existing fact (action=update|archive)"),
  text: z.string().max(600).optional().describe("Replacement text (action=update)"),
  category: z
    .enum(FACT_CATEGORIES)
    .optional()
    .describe("Category filter for list, or new category for update"),
  importance: z
    .number()
    .int()
    .min(1)
    .max(3)
    .optional()
    .describe("New importance (action=update)"),
});

const planStorySchema = z.object({
  section: z.enum(["arcs", "beats", "clocks", "agendas"]),
  action: z.enum(["add", "update", "remove", "list"]),
  name: z.string().max(120).optional().describe("Arc name (arcs) or clock name (clocks)"),
  title: z.string().max(200).optional().describe("Event title (beats)"),
  detail: z.string().max(1000).optional().describe("What the event changes (beats)"),
  premise: z.string().max(1000).optional().describe("Setup of the arc (arcs)"),
  goal: z.string().max(500).optional().describe("What resolving the arc means (arcs)"),
  description: z.string().max(500).optional().describe("Clock description (clocks)"),
  current: z.number().int().min(0).max(20).optional().describe("Clock progress (clocks)"),
  max: z.number().int().min(1).max(20).optional().describe("Clock size (clocks)"),
  arc: z.string().max(120).optional().describe("Arc this event belongs to, by name (beats)"),
  npc: z.string().max(120).optional().describe("Story character name (agendas)"),
  agenda: z.string().max(500).optional().describe("What the NPC wants (agendas)"),
  plan: z.string().max(500).optional().describe("What the NPC is doing about it (agendas)"),
  status: z
    .string()
    .max(20)
    .optional()
    .describe("New status; valid values depend on the section"),
  match: z
    .string()
    .max(200)
    .optional()
    .describe("Name/title fragment identifying the item (action=update|remove)"),
});

/** Map of tool name → Zod schema. */
export const TOOL_SCHEMAS = {
  roll_dice: rollDiceSchema,
  roll_damage: rollDamageSchema,
  roll_initiative: rollInitiativeSchema,
  ask_oracle: oracleSchema,
  random_event: randomEventSchema,
  roll_table: rollTableSchema,
  generate_npc: npcSchema,
  run_interlude: interludeSchema,
  setup_scene: setupSceneCheckSchema,
  start_dramatic_task: startTaskSchema,
  advance_dramatic_task: advanceTaskSchema,
  award_experience: awardXpSchema,
  search_lore: searchLoreSchema,
  save_journal_entry: journalSchema,
  update_threads: threadSchema,
  update_cast: castSchema,
  set_chaos_rank: chaosSchema,
  open_scene: openSceneSchema,
  close_scene: closeSceneSchema,
  update_character: updateCharacterSchema,
  remember_facts: rememberFactsSchema,
  plan_story: planStorySchema,
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
    "Roll a Savage Worlds check (trait die + wild die, acing). Use for attacks (target = Parry), Soak/Unshake (target 4) and any dramatic task roll.",
  roll_damage:
    "Roll weapon damage (dice ace; +1d6 per attack raise) and compare to Toughness → Shaken/Wounds, or an extra taken out.",
  roll_initiative:
    "Roll combat initiative for everyone in the round (d6+d6, doubles = Joker +2). Returns the action order.",
  ask_oracle:
    "Ask the Mythic oracle a yes/no question about the story. Use when the outcome is uncertain and should not be invented.",
  random_event:
    "Force a Mythic random event NOW (focus/action/subject). Use when the chaos feels high or the story stalls.",
  roll_table:
    "Roll on a d100 table for color: encounters, complications, loot, omen, weather… (built-in genre tables or the user's custom tables).",
  generate_npc:
    "Generate a complete NPC (name, occupation, appearance, want, secret, mannerism, stance) for an incoming scene, then add them with update_cast.",
  run_interlude:
    "Run a scene-break interlude: a reflective question for the player (and +1 benny). Use during rests or between scenes.",
  setup_scene:
    "Roll the Mythic scene check: is the expected scene Set, Altered or Interrupted? Use right before opening a scene.",
  start_dramatic_task:
    "Start a SWADE dramatic task (a skill challenge against the clock: escaping, defusing, researching under pressure).",
  advance_dramatic_task:
    "Make one attempt on the running dramatic task: roll the skill, bank tokens (success = 1, +1 per raise), advance the round.",
  award_experience:
    "Award XP at a scene's end (1 XP normal, 2–3 for something hard-won). Updates the sheet(s) and reports rank progress.",
  search_lore:
    "Search the campaign's memory (journal, characters, rules) for relevant context before narrating.",
  save_journal_entry:
    "Persist a narrative journal entry summarizing what just happened in the scene. Call at scene end or on significant events.",
  update_threads:
    "Manage plot threads: add new ones, resolve, abandon, or list active ones (Mythic thread tracking).",
  update_cast:
    "Manage story characters (NPCs): add, update stance/description, or list the current cast.",
  set_chaos_rank:
    "Change the Mythic chaos rank (1–9). YOU own this dial: raise it when complications, danger or interruptions mount; lower it when threads resolve and calm returns.",
  open_scene:
    "Open a new scene (closes any currently open one). Use to start the adventure and to move the story forward after closing a scene.",
  close_scene:
    "Close the current scene. Always pair with save_journal_entry first so the chronicle is written.",
  update_character:
    "Update a player character sheet: spend/give bennies, apply wounds, fatigue or power points. You apply mechanical consequences — never ask the player to do it.",
  remember_facts:
    "Record the durable facts of the campaign so you never forget or contradict them: names, places, factions, items, promises made, rulings you gave, mysteries opened. Add facts as they are established; update a fact when the truth changes; archive one that turned out wrong. Facts stay in your memory every turn.",
  plan_story:
    "Your prep notebook. Manage arcs (the long storylines), beats (the next events you are preparing), tension clocks (pressure that builds) and NPC agendas (what each character wants and is doing). Prepare ahead like a table GM: keep two to four beats ready, tick clocks when the fiction moves, and rewrite anything the oracle or the player's choices invalidate.",
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
    case "roll_damage": {
      const a = args as z.infer<typeof rollDamageSchema>;
      const result = damageRoll(a.weaponDice, a.attackRaises, a.toughness, {
        isExtra: a.isExtra,
        modifier: a.modifier,
      });
      return {
        target: a.targetName ?? "the target",
        ...result,
        summary: summarizeDamage(result),
      };
    }
    case "roll_initiative": {
      const a = args as z.infer<typeof rollInitiativeSchema>;
      const order = rollInitiative(
        a.participants.map((p) => ({ name: p.name, actor: p.actor ?? "extra" })),
      );
      return { round: order };
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
    case "random_event": {
      const a = args as z.infer<typeof randomEventSchema>;
      return { reason: a.reason ?? null, event: randomEvent() };
    }
    case "roll_table": {
      const a = args as z.infer<typeof rollTableSchema>;
      // Custom tables are user-owned: resolve through the campaign.
      const custom = await findCustomTable(ctx.campaignId, a.table);
      if (custom) {
        const entries = custom.entries as string[];
        return {
          ...rollOnEntries(custom.id, `custom: ${custom.name}`, entries),
          custom: true,
        };
      }
      return { ...rollOnTable(a.table.trim()), custom: false };
    }
    case "generate_npc": {
      const a = args as z.infer<typeof npcSchema>;
      const npc = generateNpc(a.genre ?? "universal");
      return { purpose: a.purpose ?? null, npc, text: formatNpc(npc) };
    }
    case "run_interlude": {
      const a = args as z.infer<typeof interludeSchema>;
      return { context: a.context ?? null, interlude: runInterlude() };
    }
    case "setup_scene": {
      const a = args as z.infer<typeof setupSceneCheckSchema>;
      const setup = setupScene(ctx.chaosRank);
      if (a.applyToScene && ctx.sceneId) {
        await prisma.scene.update({
          where: { id: ctx.sceneId },
          data: { type: setup.type },
        });
      }
      return { ...setup, applied: a.applyToScene && !!ctx.sceneId };
    }
    case "start_dramatic_task": {
      const a = args as z.infer<typeof startTaskSchema>;
      const task = createDramaticTask({
        name: a.name,
        skills: a.skills,
        requiredSuccesses: a.requiredSuccesses,
        timeLimit: a.timeLimit,
      });
      const row = await prisma.dramaticTask.create({
        data: {
          campaignId: ctx.campaignId,
          sceneId: ctx.sceneId,
          name: task.name,
          skills: task.skills,
          targetNumber: task.targetNumber,
          requiredSuccesses: task.requiredSuccesses,
          timeLimit: task.timeLimit,
          attempts: [],
        },
      });
      return { id: row.id, ...task, progress: taskProgress(task) };
    }
    case "advance_dramatic_task": {
      const a = args as z.infer<typeof advanceTaskSchema>;
      const row = await prisma.dramaticTask.findFirst({
        where: {
          campaignId: ctx.campaignId,
          status: "running",
          ...(a.taskName
            ? { name: { equals: a.taskName, mode: "insensitive" as const } }
            : {}),
        },
        orderBy: { updatedAt: "desc" },
      });
      if (!row) throw new Error(`No running dramatic task${a.taskName ? ` "${a.taskName}"` : ""}`);

      const task = rowToTask(row);
      const roll = rollTrait(a.dieStep, task.targetNumber, a.modifier);
      const next = advanceTaskRound(applyTaskRoll(task, a.skill, roll));
      await prisma.dramaticTask.update({
        where: { id: row.id },
        data: {
          successes: next.successes,
          timeUsed: next.timeUsed,
          status: next.status,
          attempts: next.attempts.map((t) => ({
            round: t.round,
            skill: t.skill,
            raises: t.roll.raises,
            criticalFailure: t.roll.criticalFailure,
            tokens: t.tokens,
          })),
        },
      });
      return { id: row.id, skill: a.skill, roll, ...next, progress: taskProgress(next) };
    }
    case "award_experience": {
      const a = args as z.infer<typeof awardXpSchema>;
      const characters = await prisma.character.findMany({
        where: {
          campaignId: ctx.campaignId,
          isDead: false,
          ...(a.characterName
            ? { name: { equals: a.characterName, mode: "insensitive" as const } }
            : {}),
        },
      });
      if (characters.length === 0) {
        throw new Error(`No character${a.characterName ? ` "${a.characterName}"` : ""} to award XP`);
      }
      const awarded = [];
      for (const c of characters) {
        const xp = awardXp(c.xp, a.amount);
        await prisma.character.update({ where: { id: c.id }, data: { xp } });
        const snap = progression(xp);
        awarded.push({ name: c.name, xp: snap.xp, rank: snap.rank, advances: snap.advances });
      }
      return { amount: a.amount, awarded };
    }
    case "search_lore": {
      const a = args as z.infer<typeof searchLoreSchema>;
      const hits = await searchLore(ctx.campaignId, a.query, a.limit);
      return { results: hits };
    }
    case "save_journal_entry": {
      // Persisted by the caller (chat service) — return parsed payload.
      return {
        ok: true,
        ...args,
        guidance:
          "Chronicle written. Record the durable facts this scene established with remember_facts, then close the scene.",
      };
    }
    case "close_scene": {
      // The chat service closes the scene and clears the campaign title.
      return {
        ok: true,
        ...args,
        guidance:
          "Scene closed. Revise your prep with plan_story now — mark finished beats Done, tick clocks that moved, add what this scene revealed — then narrate.",
      };
    }
    case "remember_facts": {
      return await rememberFacts(args as z.infer<typeof rememberFactsSchema>, ctx);
    }
    case "plan_story": {
      return await planStory(args as z.infer<typeof planStorySchema>, ctx);
    }
    case "update_threads":
    case "update_cast":
    case "set_chaos_rank":
    case "open_scene":
    case "update_character": {
      // Same: the chat service applies mutations and returns state.
      return { ok: true, ...args };
    }
    default:
      throw new Error(`Tool not wired: ${name}`);
  }
}

/** Resolve a custom table by id or (case-insensitive) name. */
async function findCustomTable(campaignId: string, ref: string) {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { userId: true },
  });
  if (!campaign) return null;
  const table = await prisma.customTable.findFirst({
    where: {
      userId: campaign.userId,
      OR: [{ id: ref }, { name: { equals: ref, mode: "insensitive" } }],
    },
  });
  return table;
}

// ── Campaign knowledge (facts) ───────────────────────────────

/** Mirror a fact into campaign memory so search_lore can also find it. */
async function indexFact(
  campaignId: string,
  fact: { id: string; category: string; text: string },
) {
  await ingestDocument(
    resolveEmbeddingKey(),
    campaignId,
    "Fact",
    fact.id,
    `[${fact.category}] ${fact.text}`,
  ).catch(() => undefined);
}

/** Resolve the single active fact matching a text fragment. */
async function findFact(campaignId: string, match: string) {
  const needle = normalizeFactText(match);
  if (!needle) throw new Error("Provide the text of the fact to target (match)");
  const facts = await prisma.campaignFact.findMany({
    where: { campaignId, status: "Active" },
  });
  const hits = facts.filter((fact) => normalizeFactText(fact.text).includes(needle));
  if (hits.length === 0) throw new Error(`No active fact matches "${match}"`);
  if (hits.length > 1) {
    throw new Error(
      `Multiple facts match "${match}": ${hits
        .slice(0, 5)
        .map((f) => `"${f.text}"`)
        .join("; ")}. Use a longer fragment.`,
    );
  }
  return hits[0];
}

async function rememberFacts(
  a: z.infer<typeof rememberFactsSchema>,
  ctx: ToolContext,
) {
  if (a.action === "list") {
    const facts = await prisma.campaignFact.findMany({
      where: {
        campaignId: ctx.campaignId,
        status: "Active",
        ...(a.category ? { category: a.category } : {}),
      },
      orderBy: [{ importance: "desc" }, { updatedAt: "desc" }],
      take: 50,
    });
    return {
      facts: facts.map((f) => ({
        id: f.id,
        category: f.category,
        text: f.text,
        importance: f.importance,
      })),
    };
  }

  if (a.action === "add") {
    if (!a.facts?.length) throw new Error("remember_facts add needs at least one fact");
    const existing = await prisma.campaignFact.findMany({
      where: { campaignId: ctx.campaignId, status: "Active" },
      select: { text: true },
    });
    const seen = new Set(existing.map((f) => normalizeFactText(f.text)));
    const recorded: Array<{ id: string; category: string; text: string }> = [];
    const skippedDuplicates: string[] = [];

    for (const fact of a.facts) {
      const key = normalizeFactText(fact.text);
      if (!key || seen.has(key)) {
        skippedDuplicates.push(fact.text);
        continue;
      }
      seen.add(key);
      const row = await prisma.campaignFact.create({
        data: {
          campaignId: ctx.campaignId,
          category: fact.category,
          text: fact.text,
          importance: fact.importance,
          sourceKind: ctx.askedBy === "ai" ? "GM" : "Player",
          sceneId: ctx.sceneId ?? null,
        },
      });
      await indexFact(ctx.campaignId, row);
      recorded.push({ id: row.id, category: row.category, text: row.text });
    }

    return {
      recorded,
      skippedDuplicates,
      guidance:
        "These facts are now permanent and injected into every turn. Correct or archive anything that turns out wrong.",
    };
  }

  const target = await findFact(ctx.campaignId, a.match ?? "");

  if (a.action === "archive") {
    await prisma.campaignFact.update({
      where: { id: target.id },
      data: { status: "Archived" },
    });
    await prisma.loreChunk.deleteMany({
      where: { campaignId: ctx.campaignId, source: "Fact", sourceId: target.id },
    });
    return { archived: target.text };
  }

  const data: Record<string, string | number> = {};
  if (a.text) data.text = a.text;
  if (a.category) data.category = a.category;
  if (a.importance) data.importance = a.importance;
  if (Object.keys(data).length === 0) {
    throw new Error("remember_facts update needs text, category or importance");
  }
  const updated = await prisma.campaignFact.update({ where: { id: target.id }, data });
  await indexFact(ctx.campaignId, updated);
  return {
    updated: {
      id: updated.id,
      category: updated.category,
      text: updated.text,
      importance: updated.importance,
    },
  };
}

// ── GM preparation (arcs, beats, clocks, NPC agendas) ────────

const ARC_STATUSES = ["Planned", "Active", "Resolved", "Abandoned"];
const BEAT_STATUSES = ["Planned", "Ready", "Done", "Skipped"];
const CLOCK_STATUSES = ["Active", "Resolved", "Abandoned"];

/** Resolve one arc by name fragment. */
async function findArc(campaignId: string, ref: string | undefined) {
  if (!ref) throw new Error("plan_story arcs needs the arc name (name or match)");
  const needle = normalizeFactText(ref);
  const arcs = await prisma.storyArc.findMany({ where: { campaignId } });
  const hits = arcs.filter((arc) => normalizeFactText(arc.name).includes(needle));
  if (hits.length === 0) throw new Error(`No arc matching "${ref}"`);
  if (hits.length > 1) throw new Error(`Multiple arcs match "${ref}" — use a longer fragment`);
  return hits[0];
}

/** Resolve one prepared event by title fragment. */
async function findBeat(campaignId: string, ref: string | undefined) {
  if (!ref) throw new Error("plan_story beats needs the event title (title or match)");
  const needle = normalizeFactText(ref);
  const beats = await prisma.storyBeat.findMany({ where: { campaignId } });
  const hits = beats.filter((beat) => normalizeFactText(beat.title).includes(needle));
  if (hits.length === 0) throw new Error(`No prepared event matching "${ref}"`);
  if (hits.length > 1) throw new Error(`Multiple events match "${ref}" — use a longer fragment`);
  return hits[0];
}

/** Resolve one tension clock by name fragment. */
async function findClock(campaignId: string, ref: string | undefined) {
  if (!ref) throw new Error("plan_story clocks needs the clock name (name or match)");
  const needle = normalizeFactText(ref);
  const clocks = await prisma.storyClock.findMany({ where: { campaignId } });
  const hits = clocks.filter((clock) => normalizeFactText(clock.name).includes(needle));
  if (hits.length === 0) throw new Error(`No clock matching "${ref}"`);
  if (hits.length > 1) throw new Error(`Multiple clocks match "${ref}" — use a longer fragment`);
  return hits[0];
}

/** Resolve one story character by name (exact first, then unique partial). */
async function findStoryCharacter(campaignId: string, name: string | undefined) {
  if (!name) throw new Error("plan_story agendas needs the NPC name (npc)");
  const matches = await prisma.storyCharacter.findMany({
    where: { campaignId, name: { contains: name, mode: "insensitive" } },
  });
  const exact = matches.find(
    (c) => c.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
  );
  const character = exact ?? (matches.length === 1 ? matches[0] : null);
  if (!character) {
    throw new Error(
      matches.length > 1
        ? `Multiple story characters match "${name}"`
        : `No story character matching "${name}" — add them with update_cast first`,
    );
  }
  return character;
}

async function planStory(a: z.infer<typeof planStorySchema>, ctx: ToolContext) {
  const campaignId = ctx.campaignId;

  switch (a.section) {
    case "arcs": {
      if (a.action === "list") {
        const arcs = await prisma.storyArc.findMany({
          where: { campaignId },
          orderBy: [{ order: "asc" }, { createdAt: "asc" }],
        });
        return { arcs: arcs.map((arc) => ({ ...arc, id: arc.id })) };
      }
      if (a.action === "add") {
        if (!a.name) throw new Error("plan_story arcs add needs a name");
        const order = await prisma.storyArc.count({ where: { campaignId } });
        const arc = await prisma.storyArc.create({
          data: {
            campaignId,
            name: a.name,
            premise: a.premise ?? null,
            goal: a.goal ?? null,
            status: a.status && ARC_STATUSES.includes(a.status) ? a.status : "Planned",
            order,
          },
        });
        return { arc: { id: arc.id, name: arc.name, status: arc.status } };
      }
      const arc = await findArc(campaignId, a.match ?? a.name);
      if (a.action === "remove") {
        await prisma.storyArc.delete({ where: { id: arc.id } });
        return { removed: arc.name };
      }
      const updated = await prisma.storyArc.update({
        where: { id: arc.id },
        data: {
          ...(a.name ? { name: a.name } : {}),
          ...(a.premise !== undefined ? { premise: a.premise } : {}),
          ...(a.goal !== undefined ? { goal: a.goal } : {}),
          ...(a.status && ARC_STATUSES.includes(a.status) ? { status: a.status } : {}),
        },
      });
      return { arc: { id: updated.id, name: updated.name, status: updated.status } };
    }

    case "beats": {
      if (a.action === "list") {
        const beats = await prisma.storyBeat.findMany({
          where: { campaignId },
          orderBy: [{ order: "asc" }, { createdAt: "asc" }],
        });
        return { beats };
      }
      if (a.action === "add") {
        if (!a.title) throw new Error("plan_story beats add needs a title");
        const arc = a.arc ? await findArc(campaignId, a.arc) : null;
        const order = await prisma.storyBeat.count({ where: { campaignId } });
        const beat = await prisma.storyBeat.create({
          data: {
            campaignId,
            arcId: arc?.id ?? null,
            title: a.title,
            detail: a.detail ?? null,
            status: a.status && BEAT_STATUSES.includes(a.status) ? a.status : "Planned",
            order,
          },
        });
        return { beat: { id: beat.id, title: beat.title, status: beat.status } };
      }
      const beat = await findBeat(campaignId, a.match ?? a.title);
      if (a.action === "remove") {
        await prisma.storyBeat.delete({ where: { id: beat.id } });
        return { removed: beat.title };
      }
      const arc = a.arc ? await findArc(campaignId, a.arc) : null;
      const updated = await prisma.storyBeat.update({
        where: { id: beat.id },
        data: {
          ...(a.title ? { title: a.title } : {}),
          ...(a.detail !== undefined ? { detail: a.detail } : {}),
          ...(arc ? { arcId: arc.id } : {}),
          ...(a.status && BEAT_STATUSES.includes(a.status) ? { status: a.status } : {}),
        },
      });
      return { beat: { id: updated.id, title: updated.title, status: updated.status } };
    }

    case "clocks": {
      if (a.action === "list") {
        const clocks = await prisma.storyClock.findMany({
          where: { campaignId },
          orderBy: { createdAt: "asc" },
        });
        return { clocks };
      }
      if (a.action === "add") {
        if (!a.name) throw new Error("plan_story clocks add needs a name");
        const clock = await prisma.storyClock.create({
          data: {
            campaignId,
            name: a.name,
            description: a.description ?? null,
            current: a.current ?? 0,
            max: a.max ?? 6,
            status: a.status && CLOCK_STATUSES.includes(a.status) ? a.status : "Active",
          },
        });
        return { clock: { id: clock.id, name: clock.name, current: clock.current, max: clock.max } };
      }
      const clock = await findClock(campaignId, a.match ?? a.name);
      if (a.action === "remove") {
        await prisma.storyClock.delete({ where: { id: clock.id } });
        return { removed: clock.name };
      }
      const updated = await prisma.storyClock.update({
        where: { id: clock.id },
        data: {
          ...(a.name ? { name: a.name } : {}),
          ...(a.description !== undefined ? { description: a.description } : {}),
          ...(a.current !== undefined ? { current: a.current } : {}),
          ...(a.max !== undefined ? { max: a.max } : {}),
          ...(a.status && CLOCK_STATUSES.includes(a.status) ? { status: a.status } : {}),
        },
      });
      return {
        clock: {
          id: updated.id,
          name: updated.name,
          current: updated.current,
          max: updated.max,
          status: updated.status,
        },
      };
    }

    case "agendas": {
      if (a.action === "list") {
        const cast = await prisma.storyCharacter.findMany({
          where: { campaignId },
          orderBy: { createdAt: "asc" },
        });
        return {
          cast: cast.map((c) => ({ name: c.name, stance: c.stance, agenda: c.agenda, plan: c.plan })),
        };
      }
      const character = await findStoryCharacter(campaignId, a.npc ?? a.match);
      if (a.action === "remove") {
        await prisma.storyCharacter.update({
          where: { id: character.id },
          data: { agenda: null, plan: null },
        });
        return { cleared: character.name };
      }
      if (a.action === "add" || a.action === "update") {
        if (a.agenda === undefined && a.plan === undefined) {
          throw new Error("plan_story agendas needs agenda and/or plan");
        }
        const updated = await prisma.storyCharacter.update({
          where: { id: character.id },
          data: {
            ...(a.agenda !== undefined ? { agenda: a.agenda } : {}),
            ...(a.plan !== undefined ? { plan: a.plan } : {}),
          },
        });
        return {
          npc: { name: updated.name, agenda: updated.agenda, plan: updated.plan },
        };
      }
      throw new Error(`Unsupported action "${a.action}" for agendas`);
    }
  }

  throw new Error(`Unsupported section "${a.section}"`);
}

/** Map a DramaticTask row to the rules-layer structure. */
function rowToTask(row: {
  name: string;
  skills: unknown;
  targetNumber: number;
  requiredSuccesses: number;
  successes: number;
  timeLimit: number;
  timeUsed: number;
  status: string;
  attempts: unknown;
}): DramaticTask {
  return {
    name: row.name,
    skills: (row.skills as string[]) ?? [],
    targetNumber: row.targetNumber,
    requiredSuccesses: row.requiredSuccesses,
    successes: row.successes,
    timeLimit: row.timeLimit,
    timeUsed: row.timeUsed,
    status: row.status as DramaticTask["status"],
    attempts: [],
  };
}

/** Also expose dice/oracle helpers for direct (non-AI) routes. */
export { rollPlain, randomEvent, detailAction, detailSubject, setupScene, runInterlude, generateNpc, rollOnTable };

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
  return objectShapeToJson(schema);
}

function objectShapeToJson(schema: z.ZodTypeAny): Record<string, unknown> {
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
    case "ZodBoolean":
      return { schema: { type: "boolean" }, required: true };
    case "ZodEnum": {
      const values = def.values as string[];
      return { schema: { type: "string", enum: values }, required: true };
    }
    case "ZodArray": {
      const inner = zodFieldToJson(def.type as z.ZodTypeAny);
      return { schema: { type: "array", items: inner.schema }, required: true };
    }
    case "ZodObject":
      return { schema: objectShapeToJson(field), required: true };
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
