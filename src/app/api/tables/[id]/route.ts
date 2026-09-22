/**
 * DELETE /api/tables/[id] — remove a custom table (owner only).
 */
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

type Params = { params: { id: string } };

export async function DELETE(_request: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await prisma.customTable.deleteMany({
    where: { id: params.id, userId: session.user.id },
  });
  return NextResponse.json({ ok: true });
}
