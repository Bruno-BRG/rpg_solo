/**
 * POST /api/dice — dice rolling endpoint.
 *
 * Body modes:
 *  - Trait roll: { mode: "trait", dieStep, targetNumber?, modifier? }
 *  - Plain roll: { mode: "plain", sides, count? }
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { rollTrait, rollPlain } from "@/lib/rules/dice";

const DiceInput = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("trait"),
    dieStep: z.number().int().min(3).max(12),
    targetNumber: z.number().int().min(2).max(12).default(4),
    modifier: z.number().int().default(0),
  }),
  z.object({
    mode: z.literal("plain"),
    sides: z.number().int().min(2).max(1000),
    count: z.number().int().min(1).max(20).default(1),
  }),
]);

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = DiceInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  if (parsed.data.mode === "trait") {
    const result = rollTrait(
      parsed.data.dieStep,
      parsed.data.targetNumber,
      parsed.data.modifier,
    );
    return NextResponse.json({ mode: "trait", result });
  }

  const rolls = rollPlain(parsed.data.sides, parsed.data.count);
  return NextResponse.json({
    mode: "plain",
    result: { rolls, total: rolls.reduce((a, b) => a + b, 0), sides: parsed.data.sides },
  });
}
