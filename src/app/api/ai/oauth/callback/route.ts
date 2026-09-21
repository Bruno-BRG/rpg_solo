/**
 * GET /api/ai/oauth/callback — OAuth callback for the ChatGPT flow.
 * Exchanges the code for tokens and stores them on AiSettings.
 */
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { completeOAuth } from "@/lib/ai/chatgpt-oauth";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const verifier = request.headers
    .get("cookie")
    ?.match(/oauth_verifier=([^;]+)/)?.[1];
  const expectedState = request.headers
    .get("cookie")
    ?.match(/oauth_state=([^;]+)/)?.[1];

  if (!code || !verifier || !state || state !== expectedState) {
    return NextResponse.json({ error: "Invalid OAuth callback" }, { status: 400 });
  }

  const clientId = process.env.CHATGPT_OAUTH_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: "Client not configured" }, { status: 501 });
  }

  const redirectUri =
    process.env.CHATGPT_OAUTH_REDIRECT_URI ??
    `${url.origin}/api/ai/oauth/callback`;

  try {
    const tokens = await completeOAuth(clientId, code, verifier, redirectUri);

    await prisma.aiSettings.upsert({
      where: { userId: session.user.id },
      create: {
        userId: session.user.id,
        provider: "chatgpt-oauth",
        chatModel: "gpt-5-codex",
        oauthAccessToken: tokens.accessToken,
        oauthRefreshToken: tokens.refreshToken,
        oauthExpiresAt: tokens.expiresAt ? new Date(tokens.expiresAt) : null,
      },
      update: {
        provider: "chatgpt-oauth",
        oauthAccessToken: tokens.accessToken,
        oauthRefreshToken: tokens.refreshToken,
        oauthExpiresAt: tokens.expiresAt ? new Date(tokens.expiresAt) : null,
      },
    });

    // Clean the flow cookies and return to settings.
    const response = NextResponse.redirect(`${url.origin}/settings`);
    response.cookies.delete("oauth_verifier");
    response.cookies.delete("oauth_state");
    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "OAuth failed" },
      { status: 502 },
    );
  }
}
