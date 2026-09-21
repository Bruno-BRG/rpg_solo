/**
 * GET /api/campaigns/[id]/lore — list lore chunks (RAG memory).
 */
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

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

  const chunks = await prisma.loreChunk.findMany({
    where: { campaignId: params.id },
    orderBy: [{ source: "asc" }, { chunkIndex: "asc" }],
    select: { id: true, source: true, content: true, chunkIndex: true },
    take: 200,
  });

  return NextResponse.json({ chunks });
}
