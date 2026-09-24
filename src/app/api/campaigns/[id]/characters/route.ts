/**
 * /api/campaigns/[id]/characters — character sheet CRUD.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { validateCreation } from "@/lib/rules/creation";

type Params = { params: { id: string } };

const CharacterInput = z.object({
  name: z.string().min(1).max(80),
  concept: z.string().max(200).optional(),
  ancestry: z.string().max(80).optional(),
  rank: z.enum(["Novice", "Seasoned", "Veteran", "Heroic", "Legendary"]).default("Novice"),
  agility: z.number().int().min(3).max(12).default(4),
  smarts: z.number().int().min(3).max(12).default(4),
  spirit: z.number().int().min(3).max(12).default(4),
  strength: z.number().int().min(3).max(12).default(4),
  vigor: z.number().int().min(3).max(12).default(4),
  skills: z.record(z.number().int().min(0).max(12)).default({}),
  edges: z.array(z.string()).default([]),
  hindrances: z.array(z.string()).default([]),
  bennies: z.number().int().min(0).max(10).default(3),
  wounds: z.number().int().min(0).max(5).default(0),
  fatigue: z.number().int().min(0).max(3).default(0),
  powerPoints: z.number().int().min(0).max(100).default(0),
  gear: z.string().max(2000).optional(),
  appearance: z.string().max(1000).optional(),
  background: z.string().max(10_000).optional(),
});

/** GET — list characters in the campaign. */
export async function GET(_request: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const campaign = await prisma.campaign.findFirst({
    where: { id: params.id, userId: session.user.id },
  });
  if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const characters = await prisma.character.findMany({
    where: { campaignId: params.id },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ characters });
}

const CharacterPatch = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(80).optional(),
  background: z.string().max(10_000).nullable().optional(),
  xp: z.number().int().min(0).max(10_000).optional(),
  bennies: z.number().int().min(0).max(10).optional(),
  wounds: z.number().int().min(0).max(5).optional(),
  fatigue: z.number().int().min(0).max(3).optional(),
  shaken: z.boolean().optional(),
  powerPoints: z.number().int().min(0).max(100).optional(),
  rank: z.enum(["Novice", "Seasoned", "Veteran", "Heroic", "Legendary"]).optional(),
  isDead: z.boolean().optional(),
});

/** PATCH — quick sheet updates (XP awards, bennies, wounds…). */
export async function PATCH(request: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const campaign = await prisma.campaign.findFirst({
    where: { id: params.id, userId: session.user.id },
  });
  if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = CharacterPatch.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const { id, ...data } = parsed.data;
  const updated = await prisma.character.updateMany({
    where: { id, campaignId: params.id },
    data,
  });
  if (updated.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const character = await prisma.character.findUnique({ where: { id } });
  if (character && (data.name !== undefined || data.background !== undefined)) {
    const { ingestDocument } = await import("@/lib/rag/lore");
    await ingestDocument(
      process.env.OPENAI_API_KEY ?? null,
      params.id,
      "Character",
      character.id,
      character.background ? `${character.name}: ${character.background}` : "",
    ).catch(() => undefined);
  }
  return NextResponse.json({ character });
}

/** POST — create a character; background text is ingested into RAG. */
export async function POST(request: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const campaign = await prisma.campaign.findFirst({
    where: { id: params.id, userId: session.user.id },
  });
  if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = CharacterInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  // Creation budgets are enforced here too, so an illegal sheet cannot
  // be written even if it never went through the guided creator.
  const report = validateCreation({
    attributes: {
      agility: parsed.data.agility,
      smarts: parsed.data.smarts,
      spirit: parsed.data.spirit,
      strength: parsed.data.strength,
      vigor: parsed.data.vigor,
    },
    skills: parsed.data.skills,
    edges: parsed.data.edges,
    hindrances: parsed.data.hindrances,
  });
  if (!report.valid) {
    return NextResponse.json(
      { error: "Illegal character sheet", details: report.errors },
      { status: 400 },
    );
  }

  const character = await prisma.character.create({
    data: { ...parsed.data, campaignId: params.id },
  });  // Ingest background into campaign lore (best-effort).
  if (parsed.data.background) {
    const { ingestDocument } = await import("@/lib/rag/lore");
    await ingestDocument(
      process.env.OPENAI_API_KEY ?? null,
      params.id,
      "Character",
      character.id,
      `${character.name}: ${parsed.data.background}`,
    ).catch(() => undefined);
  }

  return NextResponse.json({ character }, { status: 201 });
}
