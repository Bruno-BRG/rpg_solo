/**
 * /api/campaigns/[id] — single campaign endpoints.
 * GET: full workspace state. PATCH: update settings/chaos. DELETE: remove.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

type Params = { params: { id: string } };

/** GET — full campaign state for the workspace UI. */
export async function GET(_request: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const campaign = await prisma.campaign.findFirst({
    where: { id: params.id, userId: session.user.id },
    include: {
      characters: true,
      threads: true,
      storyChars: true,
      journal: { orderBy: { order: "asc" } },
      scenes: { orderBy: { createdAt: "desc" }, take: 10 },
      tasks: { orderBy: { updatedAt: "desc" }, take: 10 },
      chatTurns: { orderBy: { createdAt: "desc" }, take: 40 },
    },
  });
  if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Chat history is returned oldest-first for replay.
  const { chatTurns, ...rest } = campaign;
  return NextResponse.json({
    campaign: { ...rest, chatTurns: chatTurns.slice().reverse() },
  });
}

const UpdateCampaign = z.object({
  name: z.string().min(1).max(120).optional(),
  genre: z.string().max(80).optional(),
  chaosRank: z.number().int().min(1).max(9).optional(),
  currentScene: z.string().max(2000).optional(),
  settingNotes: z.string().max(50_000).optional(),
});

/** PATCH — update campaign fields. */
export async function PATCH(request: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = UpdateCampaign.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const existing = await prisma.campaign.findFirst({
    where: { id: params.id, userId: session.user.id },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const campaign = await prisma.campaign.update({
    where: { id: params.id },
    data: parsed.data,
  });
  return NextResponse.json({ campaign });
}

/** DELETE — remove the campaign and all dependent data. */
export async function DELETE(_request: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const existing = await prisma.campaign.findFirst({
    where: { id: params.id, userId: session.user.id },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.campaign.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
