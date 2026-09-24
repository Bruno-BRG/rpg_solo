/**
 * GET /api/campaigns/[id]/lore — list lore chunks (RAG memory).
 */
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ensureCampaignLoreIndexed } from "@/lib/rag/lore";

type Params = { params: { id: string } };

export async function GET(_request: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const campaign = await prisma.campaign.findFirst({
    where: { id: params.id, userId: session.user.id },
  });
  if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await ensureCampaignLoreIndexed(params.id);

  const chunks = await prisma.loreChunk.findMany({
    where: { campaignId: params.id },
    orderBy: [{ source: "asc" }, { chunkIndex: "asc" }],
    select: { id: true, source: true, content: true, chunkIndex: true },
    take: 200,
  });

  const sources = await prisma.loreChunk.groupBy({
    by: ["source"],
    where: { campaignId: params.id },
    _count: { _all: true },
  });

  return NextResponse.json({ chunks, sources: sources.map(({ source, _count }) => ({ source, count: _count._all })) });
}
