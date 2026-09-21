/**
 * GET /api/ai/models?provider=… — model catalog for the picker UI.
 *
 * For the OpenAI API provider it tries a live listing with the
 * user's key (env fallback); on any failure it returns a static
 * catalog. The ChatGPT subscription flow has no list endpoint,
 * so it always returns the known Codex/ChatGPT model ids.
 */
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { OpenAIApiProvider } from "@/lib/ai/openai-api";
import { ChatGptOAuthProvider } from "@/lib/ai/chatgpt-oauth";
import type { ProviderId } from "@/lib/ai/provider";

/** Static fallback catalog for the official API. */
const OPENAI_API_CATALOG = [
  "gpt-5",
  "gpt-5-mini",
  "gpt-4.1",
  "gpt-4.1-mini",
  "gpt-4o",
  "gpt-4o-mini",
  "o4-mini",
];

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const requested = new URL(request.url).searchParams.get("provider") as ProviderId | null;
  const settings = await prisma.aiSettings.findUnique({ where: { userId: session.user.id } });
  const provider: ProviderId =
    requested === "openai-api" || requested === "chatgpt-oauth"
      ? requested
      : ((settings?.provider as ProviderId) ?? "openai-api");

  if (provider === "chatgpt-oauth") {
    const models = await new ChatGptOAuthProvider(async () => ({
      accessToken: "",
    })).listModels();
    return NextResponse.json({ provider, models, source: "catalog" });
  }

  // openai-api: live listing when a key is available.
  const key = settings?.apiKey || process.env.OPENAI_API_KEY;
  if (key) {
    try {
      const models = await new OpenAIApiProvider(key).listModels();
      if (models.length > 0) return NextResponse.json({ provider, models, source: "live" });
    } catch {
      // Fall through to the static catalog.
    }
  }
  return NextResponse.json({ provider, models: OPENAI_API_CATALOG, source: "catalog" });
}
