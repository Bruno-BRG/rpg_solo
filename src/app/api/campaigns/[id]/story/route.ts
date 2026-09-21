/**
 * /api/campaigns/[id]/threads & cast & scenes — story-state CRUD.
 *
 * Single file keeps small resource routes together; each handler
 * switches on the `resource` query param: threads | cast | scenes.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

type Params = { params: { id: string } };

const ThreadInput = z.object({
  resource: z.literal("threads"),
  summary: z.string().min(1).max(300),
  tension: z.number().int().min(1).max(3).default(1),
});

const CastInput = z.object({
  resource: z.literal("cast"),
  name: z.string().min(1).max(80),
  description: z.string().max(2000).optional(),
  stance: z.enum(["Neutral", "Friendly", "Hostile"]).default("Neutral"),
});

const SceneInput = z.object({
  resource: z.literal("scenes"),
  title: z.string().min(1).max(120),
  goal: z.string().max(1000).optional(),
});

const Union = z.discriminatedUnion("resource", [ThreadInput, CastInput, SceneInput]);

/** POST — create a thread, cast member or scene. */
export async function POST(request: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const campaign = await prisma.campaign.findFirst({
    where: { id: params.id, userId: session.user.id },
  });
  if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = Union.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  switch (parsed.data.resource) {
    case "threads": {
      const thread = await prisma.thread.create({
        data: { campaignId: params.id, summary: parsed.data.summary, tension: parsed.data.tension },
      });
      return NextResponse.json({ thread }, { status: 201 });
    }
    case "cast": {
      const cast = await prisma.storyCharacter.create({
        data: {
          campaignId: params.id,
          name: parsed.data.name,
          description: parsed.data.description,
          stance: parsed.data.stance,
        },
      });
      return NextResponse.json({ cast }, { status: 201 });
    }
    case "scenes": {
      const scene = await prisma.scene.create({
        data: { campaignId: params.id, title: parsed.data.title, goal: parsed.data.goal },
      });
      await prisma.campaign.update({
        where: { id: params.id },
        data: { currentScene: parsed.data.title },
      });
      return NextResponse.json({ scene }, { status: 201 });
    }
  }
}

/** DELETE — remove a thread/cast/scene by `resource` + `itemId`. */
export async function DELETE(request: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const campaign = await prisma.campaign.findFirst({
    where: { id: params.id, userId: session.user.id },
  });
  if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const url = new URL(request.url);
  const resource = url.searchParams.get("resource");
  const itemId = url.searchParams.get("itemId");
  if (!resource || !itemId) {
    return NextResponse.json({ error: "resource and itemId required" }, { status: 400 });
  }

  switch (resource) {
    case "threads":
      await prisma.thread.deleteMany({ where: { id: itemId, campaignId: params.id } });
      break;
    case "cast":
      await prisma.storyCharacter.deleteMany({ where: { id: itemId, campaignId: params.id } });
      break;
    case "scenes":
      await prisma.scene.deleteMany({ where: { id: itemId, campaignId: params.id } });
      break;
    default:
      return NextResponse.json({ error: "Unknown resource" }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
