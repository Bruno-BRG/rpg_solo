/**
 * /api/settings/ai — AI provider configuration endpoints.
 * GET: current settings (secrets masked). PUT: upsert settings.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PROVIDER_IDS, PROVIDER_META, type ProviderId } from "@/lib/ai/provider";

const SettingsInput = z.object({
  provider: z.enum(PROVIDER_IDS),
  chatModel: z.string().max(80),
  apiKey: z.string().max(300).optional(),
  gmPersona: z.string().max(4000).optional(),
});

/** GET — masked settings + provider catalog. */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const settings = await prisma.aiSettings.findUnique({
    where: { userId: session.user.id },
  });

  return NextResponse.json({
    settings: settings
      ? {
          provider: settings.provider,
          chatModel: settings.chatModel,
          hasApiKey: Boolean(settings.apiKey),
          hasOAuth: Boolean(settings.oauthAccessToken),
          gmPersona: settings.gmPersona,
        }
      : null,
    providers: PROVIDER_META,
  });
}

/** PUT — upsert provider settings (secrets stored server-side). */
export async function PUT(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = SettingsInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const data: Record<string, unknown> = {
    provider: parsed.data.provider,
    chatModel: parsed.data.chatModel,
    gmPersona: parsed.data.gmPersona,
  };
  // Only overwrite the API key when a new one is provided.
  if (parsed.data.apiKey) data.apiKey = parsed.data.apiKey;

  const settings = await prisma.aiSettings.upsert({
    where: { userId: session.user.id },
    create: { userId: session.user.id, ...data },
    update: data,
  });

  return NextResponse.json({
    provider: settings.provider,
    chatModel: settings.chatModel,
  });
}

/** Type helper for other modules. */
export type ProviderIdType = ProviderId;
