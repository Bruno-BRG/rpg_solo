/**
 * Campaign workspace — shell that mounts the client workspace.
 */
import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { notFound } from "next/navigation";
import { Workspace } from "@/components/campaign/Workspace";

export default async function CampaignPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await getServerSession(authOptions);
  const campaign = await prisma.campaign.findFirst({
    where: { id: params.id, userId: session!.user.id },
    include: {
      scenes: { where: { open: true }, orderBy: { createdAt: "desc" }, take: 1 },
      characters: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!campaign) notFound();

  return (
    <Workspace
      campaignId={campaign.id}
      name={campaign.name}
      genre={campaign.genre}
      chaosRank={campaign.chaosRank}
      currentScene={campaign.currentScene}
      openSceneId={campaign.scenes[0]?.id ?? null}
      characters={campaign.characters.map((c) => ({ id: c.id, name: c.name, rank: c.rank }))}
    />
  );
}
