/**
 * POST /api/chat — AI Game Master turn (streaming).
 *
 * Streams text deltas as SSE-ish newline-delimited JSON, then a
 * final event with tool trace and persisted message id.
 */
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createProvider, resolveProviderConfig } from "@/lib/ai/factory";
import { runGmTurn } from "@/lib/gm/engine";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const body = await request.json().catch(() => null) as
    | { campaignId?: string; message?: string }
    | null;
  if (!body?.campaignId || !body?.message) {
    return new Response(JSON.stringify({ error: "campaignId and message required" }), {
      status: 400,
    });
  }

  // Campaign ownership check.
  const campaign = await prisma.campaign.findFirst({
    where: { id: body.campaignId, userId: session.user.id },
  });
  if (!campaign) {
    return new Response(JSON.stringify({ error: "Campaign not found" }), { status: 404 });
  }

  const config = await resolveProviderConfig(session.user.id);
  const provider = createProvider(config);

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
          body.message!,
          (text) => send("delta", { text }),
        );
        send("done", { content: result.content, toolTrace: result.toolTrace });
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
