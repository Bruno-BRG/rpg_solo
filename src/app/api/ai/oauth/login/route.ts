/**
 * GET /api/ai/oauth/login — start the ChatGPT OAuth (Codex-style) flow.
 * Redirects the user to auth.openai.com with PKCE. State/verifier
 * are stored in a short-lived cookie for the callback.
 */
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { beginOAuth } from "@/lib/ai/chatgpt-oauth";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const clientId = process.env.CHATGPT_OAUTH_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      { error: "CHATGPT_OAUTH_CLIENT_ID not configured on the server." },
      { status: 501 },
    );
  }

  // Redirect URI mirrors the host, under /api/ai/oauth/callback.
  const url = new URL(request.url);
  const redirectUri =
    process.env.CHATGPT_OAUTH_REDIRECT_URI ??
    `${url.origin}/api/ai/oauth/callback`;

  const auth = await beginOAuth(clientId, redirectUri);

  const response = NextResponse.redirect(auth.url);
  response.cookies.set("oauth_verifier", auth.verifier, {
    httpOnly: true,
    maxAge: 600,
    path: "/",
  });
  response.cookies.set("oauth_state", auth.state, {
    httpOnly: true,
    maxAge: 600,
    path: "/",
  });
  return response;
}
