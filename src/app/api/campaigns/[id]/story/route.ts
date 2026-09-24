/**
 * /api/campaigns/[id]/threads & cast & scenes — story-state CRUD.
 *
 * Single file keeps small resource routes together; each handler
 * switches on the `resource` query param: threads | cast | scenes.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { FACT_CATEGORIES } from "@/lib/gm/knowledge";
import { ingestDocument, resolveEmbeddingKey } from "@/lib/rag/lore";

type Params = { params: { id: string } };

const ThreadInput = z.object({
  resource: z.literal("threads"),
  summary: z.string().min(1).max(300),
  tension: z.number().int().min(1).max(3).default(1),
});

const CastInput = z.object({
  resource: z.literal("cast"),
  name: z.string().min(1).max(80),
  description: z.string().max(2000).optional(),
  stance: z.enum(["Neutral", "Friendly", "Hostile"]).default("Neutral"),
  agenda: z.string().max(500).optional(),
  plan: z.string().max(500).optional(),
});

const SceneInput = z.object({
  resource: z.literal("scenes"),
  title: z.string().min(1).max(120),
  goal: z.string().max(1000).optional(),
});

const TaskInput = z.object({
  resource: z.literal("tasks"),
  name: z.string().min(1).max(120),
  skills: z.array(z.string().min(1).max(60)).min(1).max(6),
  requiredSuccesses: z.number().int().min(1).max(30).default(10),
  timeLimit: z.number().int().min(1).max(12).default(4),
});

const FactInput = z.object({
  resource: z.literal("facts"),
  category: z.enum(FACT_CATEGORIES),
  text: z.string().min(3).max(600),
  importance: z.number().int().min(1).max(3).default(2),
  sourceKind: z.enum(["GM", "Player", "Scene"]).default("Player"),
});

const ArcInput = z.object({
  resource: z.literal("arcs"),
  name: z.string().min(1).max(120),
  premise: z.string().max(1000).optional(),
  goal: z.string().max(500).optional(),
  status: z.enum(["Planned", "Active", "Resolved", "Abandoned"]).default("Planned"),
});

const BeatInput = z.object({
  resource: z.literal("beats"),
  title: z.string().min(1).max(200),
  detail: z.string().max(1000).optional(),
  arcId: z.string().max(40).optional(),
  status: z.enum(["Planned", "Ready", "Done", "Skipped"]).default("Planned"),
});

const ClockInput = z.object({
  resource: z.literal("clocks"),
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  current: z.number().int().min(0).max(20).default(0),
  max: z.number().int().min(1).max(20).default(6),
  status: z.enum(["Active", "Resolved", "Abandoned"]).default("Active"),
});

const Union = z.discriminatedUnion("resource", [
  ThreadInput,
  CastInput,
  SceneInput,
  TaskInput,
  FactInput,
  ArcInput,
  BeatInput,
  ClockInput,
]);

/** POST — create a thread, cast member or scene. */
export async function POST(request: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const campaign = await prisma.campaign.findFirst({
    where: { id: params.id, userId: session.user.id },
  });
  if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = Union.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  switch (parsed.data.resource) {
    case "threads": {
      const thread = await prisma.thread.create({
        data: { campaignId: params.id, summary: parsed.data.summary, tension: parsed.data.tension },
      });
      return NextResponse.json({ thread }, { status: 201 });
    }
    case "cast": {
      const cast = await prisma.storyCharacter.create({
        data: {
          campaignId: params.id,
          name: parsed.data.name,
          description: parsed.data.description,
          stance: parsed.data.stance,
          agenda: parsed.data.agenda,
          plan: parsed.data.plan,
        },
      });
      return NextResponse.json({ cast }, { status: 201 });
    }
    case "scenes": {
      const sceneInput = parsed.data;
      const scene = await prisma.$transaction(async (tx) => {
        await tx.$queryRawUnsafe(`SELECT "id" FROM "Campaign" WHERE "id" = $1 FOR UPDATE`, params.id);
        await tx.scene.updateMany({ where: { campaignId: params.id, open: true }, data: { open: false } });
        const created = await tx.scene.create({
          data: { campaignId: params.id, title: sceneInput.title, goal: sceneInput.goal },
        });
        await tx.campaign.update({ where: { id: params.id }, data: { currentScene: sceneInput.title } });
        return created;
      });
      return NextResponse.json({ scene }, { status: 201 });
    }
    case "tasks": {
      const openScene = await prisma.scene.findFirst({
        where: { campaignId: params.id, open: true },
        orderBy: { createdAt: "desc" },
      });
      const task = await prisma.dramaticTask.create({
        data: {
          campaignId: params.id,
          sceneId: openScene?.id,
          name: parsed.data.name,
          skills: parsed.data.skills,
          requiredSuccesses: parsed.data.requiredSuccesses,
          timeLimit: parsed.data.timeLimit,
        },
      });
      return NextResponse.json({ task }, { status: 201 });
    }
    case "facts": {
      const fact = await prisma.campaignFact.create({
        data: {
          campaignId: params.id,
          category: parsed.data.category,
          text: parsed.data.text,
          importance: parsed.data.importance,
          sourceKind: parsed.data.sourceKind,
        },
      });
      await indexFact(params.id, fact);
      return NextResponse.json({ fact }, { status: 201 });
    }
    case "arcs": {
      const order = await prisma.storyArc.count({ where: { campaignId: params.id } });
      const arc = await prisma.storyArc.create({
        data: {
          campaignId: params.id,
          name: parsed.data.name,
          premise: parsed.data.premise,
          goal: parsed.data.goal,
          status: parsed.data.status,
          order,
        },
      });
      return NextResponse.json({ arc }, { status: 201 });
    }
    case "beats": {
      const arc = parsed.data.arcId
        ? await prisma.storyArc.findFirst({ where: { id: parsed.data.arcId, campaignId: params.id } })
        : null;
      if (parsed.data.arcId && !arc) {
        return NextResponse.json({ error: "Arc not found" }, { status: 404 });
      }
      const order = await prisma.storyBeat.count({ where: { campaignId: params.id } });
      const beat = await prisma.storyBeat.create({
        data: {
          campaignId: params.id,
          arcId: arc?.id ?? null,
          title: parsed.data.title,
          detail: parsed.data.detail,
          status: parsed.data.status,
          order,
        },
      });
      return NextResponse.json({ beat }, { status: 201 });
    }
    case "clocks": {
      const clock = await prisma.storyClock.create({
        data: {
          campaignId: params.id,
          name: parsed.data.name,
          description: parsed.data.description,
          current: parsed.data.current,
          max: parsed.data.max,
          status: parsed.data.status,
        },
      });
      return NextResponse.json({ clock }, { status: 201 });
    }
  }
  return NextResponse.json({ error: "Unknown resource" }, { status: 400 });
}

const SceneCloseInput = z.object({ resource: z.literal("scenes"), id: z.string().min(1) });

const FactPatch = z.object({
  resource: z.literal("facts"),
  id: z.string().min(1),
  text: z.string().min(3).max(600).optional(),
  category: z.enum(FACT_CATEGORIES).optional(),
  importance: z.number().int().min(1).max(3).optional(),
  status: z.enum(["Active", "Archived"]).optional(),
});

const ArcPatch = z.object({
  resource: z.literal("arcs"),
  id: z.string().min(1),
  name: z.string().min(1).max(120).optional(),
  premise: z.string().max(1000).nullable().optional(),
  goal: z.string().max(500).nullable().optional(),
  status: z.enum(["Planned", "Active", "Resolved", "Abandoned"]).optional(),
  order: z.number().int().min(0).max(100).optional(),
});

const BeatPatch = z.object({
  resource: z.literal("beats"),
  id: z.string().min(1),
  title: z.string().min(1).max(200).optional(),
  detail: z.string().max(1000).nullable().optional(),
  arcId: z.string().max(40).nullable().optional(),
  status: z.enum(["Planned", "Ready", "Done", "Skipped"]).optional(),
  order: z.number().int().min(0).max(200).optional(),
});

const ClockPatch = z.object({
  resource: z.literal("clocks"),
  id: z.string().min(1),
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(500).nullable().optional(),
  current: z.number().int().min(0).max(20).optional(),
  max: z.number().int().min(1).max(20).optional(),
  status: z.enum(["Active", "Resolved", "Abandoned"]).optional(),
});

const AgendaPatch = z.object({
  resource: z.literal("agendas"),
  id: z.string().min(1),
  agenda: z.string().max(500).nullable().optional(),
  plan: z.string().max(500).nullable().optional(),
  stance: z.enum(["Neutral", "Friendly", "Hostile"]).optional(),
  description: z.string().max(2000).nullable().optional(),
  status: z.enum(["Alive", "Dead", "Gone"]).optional(),
});

const PatchUnion = z.discriminatedUnion("resource", [
  SceneCloseInput,
  FactPatch,
  ArcPatch,
  BeatPatch,
  ClockPatch,
  AgendaPatch,
]);

/**
 * PATCH — close a scene (clearing the campaign's displayed title) or edit a
 * fact, arc, prepared event, tension clock or NPC agenda.
 */
export async function PATCH(request: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const campaign = await prisma.campaign.findFirst({ where: { id: params.id, userId: session.user.id } });
  if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const parsed = PatchUnion.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  switch (parsed.data.resource) {
    case "facts": {
      const { id, text, category, importance, status } = parsed.data;
      const updated = await prisma.campaignFact.updateMany({
        where: { id, campaignId: params.id },
        data: {
          ...(text !== undefined ? { text } : {}),
          ...(category !== undefined ? { category } : {}),
          ...(importance !== undefined ? { importance } : {}),
          ...(status !== undefined ? { status } : {}),
        },
      });
      if (updated.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
      const fact = await prisma.campaignFact.findUnique({ where: { id } });
      if (!fact) return NextResponse.json({ error: "Not found" }, { status: 404 });
      if (fact.status === "Archived") {
        await prisma.loreChunk.deleteMany({
          where: { campaignId: params.id, source: "Fact", sourceId: fact.id },
        });
      } else {
        await indexFact(params.id, fact);
      }
      return NextResponse.json({ fact });
    }
    case "arcs": {
      const { id, name, premise, goal, status, order } = parsed.data;
      const updated = await prisma.storyArc.updateMany({
        where: { id, campaignId: params.id },
        data: {
          ...(name !== undefined ? { name } : {}),
          ...(premise !== undefined ? { premise } : {}),
          ...(goal !== undefined ? { goal } : {}),
          ...(status !== undefined ? { status } : {}),
          ...(order !== undefined ? { order } : {}),
        },
      });
      if (updated.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json({ arc: await prisma.storyArc.findUnique({ where: { id } }) });
    }
    case "beats": {
      const { id, title, detail, arcId, status, order } = parsed.data;
      if (arcId) {
        const arc = await prisma.storyArc.findFirst({ where: { id: arcId, campaignId: params.id } });
        if (!arc) return NextResponse.json({ error: "Arc not found" }, { status: 404 });
      }
      const updated = await prisma.storyBeat.updateMany({
        where: { id, campaignId: params.id },
        data: {
          ...(title !== undefined ? { title } : {}),
          ...(detail !== undefined ? { detail } : {}),
          ...(arcId !== undefined ? { arcId } : {}),
          ...(status !== undefined ? { status } : {}),
          ...(order !== undefined ? { order } : {}),
        },
      });
      if (updated.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json({ beat: await prisma.storyBeat.findUnique({ where: { id } }) });
    }
    case "clocks": {
      const { id, name, description, current, max, status } = parsed.data;
      const updated = await prisma.storyClock.updateMany({
        where: { id, campaignId: params.id },
        data: {
          ...(name !== undefined ? { name } : {}),
          ...(description !== undefined ? { description } : {}),
          ...(current !== undefined ? { current } : {}),
          ...(max !== undefined ? { max } : {}),
          ...(status !== undefined ? { status } : {}),
        },
      });
      if (updated.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json({ clock: await prisma.storyClock.findUnique({ where: { id } }) });
    }
    case "agendas": {
      const { id, agenda, plan, stance, description, status } = parsed.data;
      const updated = await prisma.storyCharacter.updateMany({
        where: { id, campaignId: params.id },
        data: {
          ...(agenda !== undefined ? { agenda } : {}),
          ...(plan !== undefined ? { plan } : {}),
          ...(stance !== undefined ? { stance } : {}),
          ...(description !== undefined ? { description } : {}),
          ...(status !== undefined ? { status } : {}),
        },
      });
      if (updated.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json({ cast: await prisma.storyCharacter.findUnique({ where: { id } }) });
    }
  }

  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRawUnsafe(`SELECT "id" FROM "Campaign" WHERE "id" = $1 FOR UPDATE`, params.id);
    const scene = await tx.scene.findFirst({ where: { id: parsed.data.id, campaignId: params.id } });
    if (!scene) return null;
    await tx.scene.update({ where: { id: scene.id }, data: { open: false } });
    if (scene.open) {
      const remaining = await tx.scene.findFirst({
        where: { campaignId: params.id, open: true },
        orderBy: { createdAt: "desc" },
      });
      await tx.campaign.update({ where: { id: params.id }, data: { currentScene: remaining?.title ?? null } });
    }
    return { ...scene, open: false };
  });
  if (!result) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ scene: result });
}

/** DELETE — remove a thread/cast/scene by `resource` + `itemId`. */
export async function DELETE(request: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const campaign = await prisma.campaign.findFirst({
    where: { id: params.id, userId: session.user.id },
  });
  if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const url = new URL(request.url);
  const resource = url.searchParams.get("resource");
  const itemId = url.searchParams.get("itemId");
  if (!resource || !itemId) {
    return NextResponse.json({ error: "resource and itemId required" }, { status: 400 });
  }

  switch (resource) {
    case "threads":
      await prisma.thread.deleteMany({ where: { id: itemId, campaignId: params.id } });
      break;
    case "cast":
      await prisma.storyCharacter.deleteMany({ where: { id: itemId, campaignId: params.id } });
      break;
    case "scenes":
      await prisma.$transaction(async (tx) => {
        await tx.$queryRawUnsafe(`SELECT "id" FROM "Campaign" WHERE "id" = $1 FOR UPDATE`, params.id);
        const scene = await tx.scene.findFirst({ where: { id: itemId, campaignId: params.id } });
        if (!scene) return;
        await tx.scene.delete({ where: { id: scene.id } });
        if (scene.open) {
          const remaining = await tx.scene.findFirst({
            where: { campaignId: params.id, open: true },
            orderBy: { createdAt: "desc" },
          });
          await tx.campaign.update({ where: { id: params.id }, data: { currentScene: remaining?.title ?? null } });
        }
      });
      break;
    case "tasks":
      await prisma.dramaticTask.deleteMany({ where: { id: itemId, campaignId: params.id } });
      break;
    case "facts":
      await prisma.campaignFact.deleteMany({ where: { id: itemId, campaignId: params.id } });
      await prisma.loreChunk.deleteMany({
        where: { campaignId: params.id, source: "Fact", sourceId: itemId },
      });
      break;
    case "arcs":
      await prisma.storyArc.deleteMany({ where: { id: itemId, campaignId: params.id } });
      break;
    case "beats":
      await prisma.storyBeat.deleteMany({ where: { id: itemId, campaignId: params.id } });
      break;
    case "clocks":
      await prisma.storyClock.deleteMany({ where: { id: itemId, campaignId: params.id } });
      break;
    default:
      return NextResponse.json({ error: "Unknown resource" }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

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
