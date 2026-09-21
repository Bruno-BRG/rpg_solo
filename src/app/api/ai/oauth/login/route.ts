/**
 * GET /api/ai/oauth/login — start the ChatGPT OAuth (Codex-style) flow.
 *
 * Creates a PKCE flow for the signed-in user, starts the localhost:1455
 * callback listener (same port the Codex CLI uses — the only redirect
 * URI registered for this client), and redirects the browser to
 * auth.openai.com.
 */
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { createFlow, ensureListener } from "@/lib/ai/oauth-flow";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { url } = await createFlow(session.user.id);
  ensureListener();

  return NextResponse.redirect(url);
}
