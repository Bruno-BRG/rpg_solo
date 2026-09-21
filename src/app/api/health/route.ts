/**
 * GET /api/health — liveness probe used by Docker/Coolify.
 * Verifies database connectivity with a trivial query.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok", database: "up" });
  } catch {
    return NextResponse.json(
      { status: "degraded", database: "down" },
      { status: 503 },
    );
  }
}
