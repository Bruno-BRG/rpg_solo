/**
 * POST /api/ai/oauth/exchange — manual fallback for the OAuth flow.
 *
 * Body: { callbackUrl: "http://localhost:1455/auth/callback?code=…&state=…" }
 * Used when the automatic localhost:1455 listener could not capture
 * the redirect (busy port, headless server). The user pastes the URL
 * from the browser address bar after authorizing.
 */
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { completeFromPastedUrl } from "@/lib/ai/oauth-flow";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null) as { callbackUrl?: string } | null;
  if (!body?.callbackUrl) {
    return NextResponse.json({ error: "callbackUrl required" }, { status: 400 });
  }

  try {
    await completeFromPastedUrl(body.callbackUrl.trim());
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Exchange failed" },
      { status: 400 },
    );
  }
}
