/**
 * POST /api/chat — AI Game Master turn (streaming).
 *
 * Body: { campaignId, message? } for a normal turn, or
 * { campaignId, opening: true } to have the GM open the adventure
 * with scene setup + narration (no player input needed).
 *
 * Streams text deltas as SSE-ish newline-delimited JSON, then a
 * final event with content, tool trace and world-state effects
 * (e.g. a chaos rank change the UI should reflect).
 */
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createProvider, resolveProviderConfig } from "@/lib/ai/factory";
import { runGmTurn, OPENING_DIRECTIVE } from "@/lib/gm/engine";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const body = await request.json().catch(() => null) as
    | { campaignId?: string; message?: string; opening?: boolean }
    | null;
  const playerInput =
    body?.opening === true ? OPENING_DIRECTIVE : body?.message?.trim();
  if (!body?.campaignId || !playerInput) {
    return new Response(
      JSON.stringify({ error: "campaignId and message (or opening: true) required" }),
      { status: 400 },
    );
  }

  // Campaign ownership check.
  const campaign = await prisma.campaign.findFirst({
    where: { id: body.campaignId, userId: session.user.id },
  });
  if (!campaign) {
    return new Response(JSON.stringify({ error: "Campaign not found" }), { status: 404 });
  }

  // Resolve the provider before opening the stream so a missing
  // key/config surfaces as a clean 400 the UI can explain.
  let provider;
  try {
    const config = await resolveProviderConfig(session.user.id);
    provider = createProvider(config);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };
      try {
        const result = await runGmTurn(
          provider,
          session.user.id,
          body.campaignId!,
          playerInput,
          (text) => send("delta", { text }),
        );
        send("done", {
          content: result.content,
          toolTrace: result.toolTrace,
          effects: result.effects,
        });
      } catch (error) {
        send("error", { message: error instanceof Error ? error.message : String(error) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
