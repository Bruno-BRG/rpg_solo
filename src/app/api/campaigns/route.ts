/**
 * /api/campaigns — campaign collection endpoints.
 * GET: list the user's campaigns. POST: create one.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

const CreateCampaign = z.object({
  name: z.string().min(1).max(120),
  genre: z.string().max(80).optional(),
  settingNotes: z.string().max(50_000).optional(),
});

/** GET /api/campaigns — list campaigns for the signed-in user. */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const campaigns = await prisma.campaign.findMany({
    where: { userId: session.user.id },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true, name: true, genre: true, chaosRank: true,
      updatedAt: true, currentScene: true,
    },
  });
  return NextResponse.json({ campaigns });
}

/** POST /api/campaigns — create a campaign (and its first scene). */
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = CreateCampaign.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const campaign = await prisma.campaign.create({
    data: {
      userId: session.user.id,
      name: parsed.data.name,
      genre: parsed.data.genre,
      settingNotes: parsed.data.settingNotes,
    },
  });

  // Ingest setting notes into RAG lore when provided.
  if (parsed.data.settingNotes && process.env.OPENAI_API_KEY) {
    const { ingestDocument } = await import("@/lib/rag/lore");
    await ingestDocument(
      process.env.OPENAI_API_KEY,
      campaign.id,
      "SettingNotes",
      campaign.id,
      parsed.data.settingNotes,
    ).catch(() => undefined); // RAG is best-effort at creation time
  }

  return NextResponse.json({ campaign }, { status: 201 });
}
