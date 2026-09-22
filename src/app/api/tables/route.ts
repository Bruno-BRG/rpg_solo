/**
 * /api/tables — d100 tables.
 * GET: built-in table library + the user's custom tables.
 * POST: create a custom table (equal-width d100 bands).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { BUILTIN_TABLES, TABLE_GENRES } from "@/lib/oracle/tables";

/** GET — the full table library (built-in + custom). */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const custom = await prisma.customTable.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    genres: TABLE_GENRES,
    builtin: BUILTIN_TABLES.map(({ entries, ...meta }) => ({
      ...meta,
      sample: entries.slice(0, 3),
    })),
    custom,
  });
}

const TableInput = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(300).optional(),
  /** 4–100 entries; a d100 roll picks equal-width bands. */
  entries: z
    .array(z.string().min(1).max(200))
    .min(2)
    .max(100)
    .refine(
      (entries) => entries.length <= 4 || 100 % entries.length === 0,
      "Entry count must divide 100 evenly (2, 4, 5, 10, 20, 25, 50, 100) so d100 bands are equal",
    ),
});

/** POST — create a custom table. */
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = TableInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const table = await prisma.customTable.create({
    data: {
      userId: session.user.id,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      entries: parsed.data.entries,
    },
  });
  return NextResponse.json({ table }, { status: 201 });
}
