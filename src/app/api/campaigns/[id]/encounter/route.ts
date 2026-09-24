/**
 * /api/campaigns/[id]/encounter — the tactical grid.
 *
 * GET     the active encounter with its combatants and recent history
 * POST    create an encounter, add a combatant, paint terrain or log a note
 * PATCH   edit the encounter (including dealing the next round) or a combatant
 * DELETE  remove a combatant, or end the encounter
 *
 * Combatants linked to a character sheet write wounds, Shaken and bennies
 * straight through to the sheet, so the party panel and the grid agree.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  deckFromJson,
  logEncounter,
  syncCombatantToSheet,
  terrainFromJson,
} from "@/lib/gm/encounter";
import { createActionDeck, dealRound } from "@/lib/rules/combat";

type Params = { params: { id: string } };

const TerrainCellInput = z.object({
  x: z.number().int().min(0).max(60),
  y: z.number().int().min(0).max(60),
  kind: z.enum(["wall", "cover", "difficult", "hazard"]),
  label: z.string().max(80).optional(),
});

const CombatantFields = {
  name: z.string().min(1).max(80),
  kind: z.enum(["PlayerCharacter", "StoryCharacter", "Extra"]).default("Extra"),
  characterId: z.string().max(40).optional(),
  storyCharacterId: z.string().max(40).optional(),
  x: z.number().int().min(0).max(60).default(0),
  y: z.number().int().min(0).max(60).default(0),
  size: z.number().int().min(1).max(4).default(1),
  pace: z.number().int().min(1).max(30).default(6),
  parry: z.number().int().min(1).max(20).default(2),
  toughness: z.number().int().min(1).max(30).default(4),
  wounds: z.number().int().min(0).max(10).default(0),
  maxWounds: z.number().int().min(1).max(10).default(3),
  shaken: z.boolean().default(false),
  bennies: z.number().int().min(0).max(10).default(0),
  isExtra: z.boolean().default(true),
  defending: z.boolean().default(false),
  notes: z.string().max(500).optional(),
} as const;

const EncounterCreate = z.object({
  resource: z.literal("encounter"),
  name: z.string().min(1).max(120),
  width: z.number().int().min(4).max(60).default(12),
  height: z.number().int().min(4).max(60).default(12),
  terrain: z.array(TerrainCellInput).max(600).default([]),
  combatants: z.array(z.object(CombatantFields)).max(30).default([]),
  sceneId: z.string().max(40).optional(),
});

const CombatantCreate = z.object({ resource: z.literal("combatants") }).extend(CombatantFields);

const TerrainCreate = z.object({
  resource: z.literal("terrain"),
  cells: z.array(TerrainCellInput).min(1).max(600),
  clear: z.boolean().default(false),
});

const NoteCreate = z.object({
  resource: z.literal("log"),
  text: z.string().min(1).max(500),
  kind: z.string().max(20).default("Note"),
});

const PostUnion = z.discriminatedUnion("resource", [
  EncounterCreate,
  CombatantCreate,
  TerrainCreate,
  NoteCreate,
]);

const EncounterPatch = z.object({
  resource: z.literal("encounter"),
  name: z.string().min(1).max(120).optional(),
  status: z.enum(["Setup", "Active", "Ended"]).optional(),
  width: z.number().int().min(4).max(60).optional(),
  height: z.number().int().min(4).max(60).optional(),
  dealRound: z.boolean().optional().describe("Advance the round and deal cards"),
});

const CombatantPatch = z.object({
  resource: z.literal("combatants"),
  id: z.string().min(1),
  name: z.string().min(1).max(80).optional(),
  x: z.number().int().min(0).max(60).optional(),
  y: z.number().int().min(0).max(60).optional(),
  pace: z.number().int().min(1).max(30).optional(),
  parry: z.number().int().min(1).max(20).optional(),
  toughness: z.number().int().min(1).max(30).optional(),
  wounds: z.number().int().min(0).max(10).optional(),
  maxWounds: z.number().int().min(1).max(10).optional(),
  shaken: z.boolean().optional(),
  bennies: z.number().int().min(0).max(10).optional(),
  defending: z.boolean().optional(),
  status: z.enum(["Active", "Down", "Out"]).optional(),
  card: z
    .object({
      rank: z.string().max(6),
      suit: z.string().max(10),
      joker: z.boolean(),
      label: z.string().max(8),
    })
    .nullable()
    .optional(),
  notes: z.string().max(500).nullable().optional(),
});

const PatchUnion = z.discriminatedUnion("resource", [EncounterPatch, CombatantPatch]);

/** Load the campaign and confirm it belongs to the signed-in user. */
async function ownedCampaign(campaignId: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, userId: session.user.id },
  });
  if (!campaign) return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  return { campaign };
}

/** The encounter the campaign is currently fighting. */
async function activeEncounter(campaignId: string) {
  return prisma.encounter.findFirst({
    where: { campaignId, status: { in: ["Setup", "Active"] } },
    orderBy: { createdAt: "desc" },
  });
}

function normalizeTerrain(cells: Array<z.infer<typeof TerrainCellInput>>) {
  return cells.map((cell) => ({
    x: cell.x,
    y: cell.y,
    kind: cell.kind,
    label: cell.label ?? null,
  }));
}

/** GET — the active encounter, its pieces and the last lines of history. */
export async function GET(_request: Request, { params }: Params) {
  const owned = await ownedCampaign(params.id);
  if (owned.error) return owned.error;

  const encounter = await activeEncounter(params.id);
  if (!encounter) return NextResponse.json({ encounter: null, combatants: [], log: [] });

  const [combatants, log] = await Promise.all([
    prisma.combatant.findMany({ where: { encounterId: encounter.id }, orderBy: { createdAt: "asc" } }),
    prisma.encounterLog.findMany({
      where: { encounterId: encounter.id },
      orderBy: { createdAt: "desc" },
      take: 40,
    }),
  ]);

  return NextResponse.json({
    encounter: { ...encounter, terrain: terrainFromJson(encounter.terrain) },
    combatants,
    log: log.reverse(),
  });
}

/** POST — create an encounter, add a piece, paint terrain or log a note. */
export async function POST(request: Request, { params }: Params) {
  const owned = await ownedCampaign(params.id);
  if (owned.error) return owned.error;

  const parsed = PostUnion.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  switch (parsed.data.resource) {
    case "encounter": {
      const existing = await activeEncounter(params.id);
      if (existing) {
        await prisma.encounter.update({ where: { id: existing.id }, data: { status: "Ended" } });
        await logEncounter(existing.id, existing.round, "Note", "Closed to start " + parsed.data.name + ".");
      }
      const encounter = await prisma.encounter.create({
        data: {
          campaignId: params.id,
          sceneId: parsed.data.sceneId ?? null,
          name: parsed.data.name,
          status: "Active",
          width: parsed.data.width,
          height: parsed.data.height,
          terrain: normalizeTerrain(parsed.data.terrain),
          deck: createActionDeck() as unknown as object[],
          rounds: [],
        },
      });
      const created = [];
      for (const spec of parsed.data.combatants) {
        created.push(
          await prisma.combatant.create({
            data: {
              encounterId: encounter.id,
              name: spec.name,
              kind: spec.kind,
              characterId: spec.characterId ?? null,
              storyCharacterId: spec.storyCharacterId ?? null,
              x: spec.x,
              y: spec.y,
              size: spec.size,
              pace: spec.pace,
              parry: spec.parry,
              toughness: spec.toughness,
              wounds: spec.wounds,
              maxWounds: spec.maxWounds,
              shaken: spec.shaken,
              bennies: spec.bennies,
              isExtra: spec.isExtra,
              defending: spec.defending,
              notes: spec.notes ?? null,
            },
          }),
        );
      }
      await logEncounter(encounter.id, 1, "Note", "Encounter started: " + encounter.name);
      return NextResponse.json({ encounter, combatants: created }, { status: 201 });
    }
    case "combatants": {
      const encounter = await activeEncounter(params.id);
      if (!encounter) return NextResponse.json({ error: "No active encounter" }, { status: 404 });
      const { resource: _resource, ...spec } = parsed.data;
      const combatant = await prisma.combatant.create({
        data: {
          encounterId: encounter.id,
          name: spec.name,
          kind: spec.kind,
          characterId: spec.characterId ?? null,
          storyCharacterId: spec.storyCharacterId ?? null,
          x: spec.x,
          y: spec.y,
          size: spec.size,
          pace: spec.pace,
          parry: spec.parry,
          toughness: spec.toughness,
          wounds: spec.wounds,
          maxWounds: spec.maxWounds,
          shaken: spec.shaken,
          bennies: spec.bennies,
          isExtra: spec.isExtra,
          defending: spec.defending,
          notes: spec.notes ?? null,
        },
      });
      await logEncounter(
        encounter.id,
        encounter.round,
        "Note",
        combatant.name + " joins the fight at (" + combatant.x + "," + combatant.y + ").",
      );
      return NextResponse.json({ combatant }, { status: 201 });
    }
    case "terrain": {
      const encounter = await activeEncounter(params.id);
      if (!encounter) return NextResponse.json({ error: "No active encounter" }, { status: 404 });
      const map = new Map(
        terrainFromJson(encounter.terrain).map((cell) => [cell.x + "," + cell.y, cell]),
      );
      for (const cell of parsed.data.cells) {
        const key = cell.x + "," + cell.y;
        if (parsed.data.clear) map.delete(key);
        else map.set(key, { x: cell.x, y: cell.y, kind: cell.kind, label: cell.label ?? null });
      }
      const terrain = Array.from(map.values());
      const updated = await prisma.encounter.update({
        where: { id: encounter.id },
        data: { terrain: terrain as unknown as object[] },
      });
      await logEncounter(
        encounter.id,
        encounter.round,
        "Terrain",
        (parsed.data.clear ? "Cleared " : "Painted ") + parsed.data.cells.length + " cell(s).",
      );
      return NextResponse.json({ encounter: { ...updated, terrain } });
    }
    case "log": {
      const encounter = await activeEncounter(params.id);
      if (!encounter) return NextResponse.json({ error: "No active encounter" }, { status: 404 });
      const entry = await prisma.encounterLog.create({
        data: {
          encounterId: encounter.id,
          round: encounter.round,
          kind: parsed.data.kind,
          text: parsed.data.text,
        },
      });
      return NextResponse.json({ entry }, { status: 201 });
    }
  }
}

/** PATCH — edit the encounter (or deal the next round) and edit a piece. */
export async function PATCH(request: Request, { params }: Params) {
  const owned = await ownedCampaign(params.id);
  if (owned.error) return owned.error;

  const parsed = PatchUnion.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const encounter = await activeEncounter(params.id);
  if (!encounter) return NextResponse.json({ error: "No active encounter" }, { status: 404 });

  if (parsed.data.resource === "encounter") {
    const { resource: _resource, dealRound: shouldDeal, ...data } = parsed.data;
    const combatants = await prisma.combatant.findMany({
      where: { encounterId: encounter.id },
      orderBy: { createdAt: "asc" },
    });

    if (shouldDeal) {
      const round = encounter.round + 1;
      const dealt = dealRound(
        combatants.map((c) => ({
          name: c.name,
          actor: c.isExtra ? ("extra" as const) : ("wildcard" as const),
        })),
        deckFromJson(encounter.deck),
      );
      for (const entry of dealt.order) {
        const target = combatants.find((c) => c.name === entry.name);
        if (target) {
          await prisma.combatant.update({
            where: { id: target.id },
            data: { card: entry.card as unknown as object },
          });
        }
      }
      const history = Array.isArray(encounter.rounds) ? encounter.rounds : [];
      await prisma.encounter.update({
        where: { id: encounter.id },
        data: {
          round,
          deck: dealt.deck as unknown as object[],
          rounds: [
            ...history,
            { round, order: dealt.order.map((e) => ({ name: e.name, card: e.card })) },
          ] as unknown as object[],
        },
      });
      await logEncounter(
        encounter.id,
        round,
        "Card",
        "Round " + round + ": " + dealt.order.map((e) => e.name + " " + e.card.label).join(" > "),
      );
    }

    const updated = await prisma.encounter.update({
      where: { id: encounter.id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.width !== undefined ? { width: data.width } : {}),
        ...(data.height !== undefined ? { height: data.height } : {}),
      },
    });

    if (data.status === "Ended") {
      for (const combatant of combatants) {
        await syncCombatantToSheet({
          characterId: combatant.characterId,
          wounds: combatant.wounds,
          shaken: combatant.shaken,
          bennies: combatant.bennies,
        });
      }
      await logEncounter(encounter.id, updated.round, "Note", "Encounter ended.");
    }

    return NextResponse.json({ encounter: { ...updated, terrain: terrainFromJson(updated.terrain) } });
  }

  const { resource: _resource, id, ...data } = parsed.data;
  const existing = await prisma.combatant.findFirst({ where: { id, encounterId: encounter.id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const combatant = await prisma.combatant.update({
    where: { id },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.x !== undefined ? { x: data.x } : {}),
      ...(data.y !== undefined ? { y: data.y } : {}),
      ...(data.pace !== undefined ? { pace: data.pace } : {}),
      ...(data.parry !== undefined ? { parry: data.parry } : {}),
      ...(data.toughness !== undefined ? { toughness: data.toughness } : {}),
      ...(data.wounds !== undefined ? { wounds: data.wounds } : {}),
      ...(data.maxWounds !== undefined ? { maxWounds: data.maxWounds } : {}),
      ...(data.shaken !== undefined ? { shaken: data.shaken } : {}),
      ...(data.bennies !== undefined ? { bennies: data.bennies } : {}),
      ...(data.defending !== undefined ? { defending: data.defending } : {}),
      ...(data.status !== undefined ? { status: data.status } : {}),
      ...(data.card !== undefined ? { card: (data.card ?? undefined) as unknown as object } : {}),
      ...(data.notes !== undefined ? { notes: data.notes } : {}),
    },
  });

  await syncCombatantToSheet({
    characterId: combatant.characterId,
    wounds: combatant.wounds,
    shaken: combatant.shaken,
    bennies: combatant.bennies,
  });

  return NextResponse.json({ combatant });
}

/** DELETE — remove a piece, or end the encounter. */
export async function DELETE(request: Request, { params }: Params) {
  const owned = await ownedCampaign(params.id);
  if (owned.error) return owned.error;

  const url = new URL(request.url);
  const resource = url.searchParams.get("resource");
  const itemId = url.searchParams.get("itemId");
  if (!resource) return NextResponse.json({ error: "resource required" }, { status: 400 });

  const encounter = await activeEncounter(params.id);
  if (!encounter) return NextResponse.json({ error: "No active encounter" }, { status: 404 });

  if (resource === "combatants") {
    if (!itemId) return NextResponse.json({ error: "itemId required" }, { status: 400 });
    await prisma.combatant.deleteMany({ where: { id: itemId, encounterId: encounter.id } });
    return NextResponse.json({ ok: true });
  }

  if (resource === "encounter") {
    const combatants = await prisma.combatant.findMany({ where: { encounterId: encounter.id } });
    for (const combatant of combatants) {
      await syncCombatantToSheet({
        characterId: combatant.characterId,
        wounds: combatant.wounds,
        shaken: combatant.shaken,
        bennies: combatant.bennies,
      });
    }
    await prisma.encounter.delete({ where: { id: encounter.id } });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown resource" }, { status: 400 });
}

