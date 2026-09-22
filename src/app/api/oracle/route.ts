/**
 * POST /api/oracle — consult the Mythic oracle.
 *
 * Body: { sceneId, question, likelihood?, kind?, tableId?, genre? }
 * Kinds: FateChart | RandomEvent | DetailCheck | SceneSetup |
 *        CustomTable/BuiltinTable (tableId) | Interlude | Npc.
 * Every consultation is logged to the scene for the story record.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { askFateChart, fateOdds, LIKELIHOODS, type Likelihood } from "@/lib/oracle/fate-chart";
import { randomEvent, detailAction, detailSubject, setupScene } from "@/lib/oracle/random-events";
import { runInterlude } from "@/lib/rules/interludes";
import { generateNpc, formatNpc, type NpcGenre } from "@/lib/oracle/npc";
import { rollOnEntries, rollOnTable } from "@/lib/oracle/tables";

const OracleInput = z.object({
  sceneId: z.string().min(1),
  kind: z
    .enum([
      "FateChart",
      "RandomEvent",
      "DetailCheck",
      "SceneSetup",
      "Table",
      "Interlude",
      "Npc",
    ])
    .default("FateChart"),
  question: z.string().max(500).default(""),
  likelihood: z.enum(LIKELIHOODS).default("50/50"),
  detailKind: z.enum(["Action", "Subject"]).optional(),
  /** Built-in table id or a custom table id/name (kind=Table). */
  tableId: z.string().max(120).optional(),
  genre: z.enum(["fantasy", "scifi", "western", "noir", "horror", "universal"]).optional(),
});

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = OracleInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const { sceneId, kind, question, likelihood, detailKind, tableId, genre } = parsed.data;

  // Scene must belong to the user's campaign.
  const scene = await prisma.scene.findFirst({
    where: { id: sceneId, campaign: { userId: session.user.id } },
    include: { campaign: { select: { chaosRank: true, genre: true, id: true, userId: true } } },
  });
  if (!scene) return NextResponse.json({ error: "Scene not found" }, { status: 404 });

  const chaosRank = scene.campaign.chaosRank;
  let result: unknown;

  try {
    switch (kind) {
      case "FateChart": {
        const fate = askFateChart(question, likelihood as Likelihood, chaosRank);
        result = { ...fate, odds: fateOdds(likelihood as Likelihood, chaosRank) };
        break;
      }
      case "RandomEvent":
        result = randomEvent();
        break;
      case "DetailCheck":
        result = detailKind === "Subject" ? detailSubject() : detailAction();
        break;
      case "SceneSetup":
        result = setupScene(chaosRank);
        break;
      case "Table": {
        if (!tableId) {
          return NextResponse.json({ error: "tableId required for Table rolls" }, { status: 400 });
        }
        // Custom tables resolve against the owner's user id.
        const custom = await prisma.customTable.findFirst({
          where: {
            userId: scene.campaign.userId,
            OR: [{ id: tableId }, { name: { equals: tableId, mode: "insensitive" } }],
          },
        });
        if (custom) {
          result = {
            ...rollOnEntries(custom.id, custom.name, custom.entries as string[]),
            custom: true,
          };
        } else {
          result = { ...rollOnTable(tableId), custom: false };
        }
        break;
      }
      case "Interlude":
        result = runInterlude();
        break;
      case "Npc": {
        const npc = generateNpc((genre ?? (scene.campaign.genre as NpcGenre | null) ?? "universal"));
        result = { npc, text: formatNpc(npc) };
        break;
      }
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }

  // Persist to the oracle log.
  await prisma.oracleLog.create({
    data: {
      sceneId,
      kind,
      question: question || (kind === "Table" ? `table: ${tableId}` : kind),
      likelihood: kind === "FateChart" ? likelihood : null,
      result: result as object,
      askedBy: "player",
    },
  });

  return NextResponse.json({ result });
}

/** GET /api/oracle?sceneId=… — oracle log for a scene. */
export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sceneId = new URL(request.url).searchParams.get("sceneId");
  if (!sceneId) return NextResponse.json({ error: "sceneId required" }, { status: 400 });

  const scene = await prisma.scene.findFirst({
    where: { id: sceneId, campaign: { userId: session.user.id } },
  });
  if (!scene) return NextResponse.json({ error: "Scene not found" }, { status: 404 });

  const logs = await prisma.oracleLog.findMany({
    where: { sceneId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return NextResponse.json({ logs });
}
