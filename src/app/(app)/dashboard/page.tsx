/**
 * Dashboard — campaign list and creation.
 * Server component fetches data; creation is a client island.
 */
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { NewCampaignForm } from "@/components/campaign/NewCampaignForm";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  const campaigns = await prisma.campaign.findMany({
    where: { userId: session!.user.id },
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true, genre: true, chaosRank: true, currentScene: true, updatedAt: true },
  });

  return (
    <div className="mx-auto max-w-4xl p-8">
      <h1 className="font-serif text-3xl">Campaigns</h1>
      <p className="mt-1 text-sm text-ink-500">
        Each campaign is a self-contained world: scenes, oracle, cast and memory.
      </p>

      <div className="mt-6 space-y-3">
        {campaigns.map((c) => (
          <Link
            key={c.id}
            href={`/campaigns/${c.id}`}
            className="panel block px-4 py-3 transition-colors hover:border-ink-400"
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold">{c.name}</h2>
                <p className="text-sm text-ink-500">
                  {c.genre ?? "No genre"}
                  {c.currentScene ? ` · Scene: ${c.currentScene}` : " · No scene yet"}
                </p>
              </div>
              <span className="tag">Chaos {c.chaosRank}</span>
            </div>
          </Link>
        ))}
        {campaigns.length === 0 && (
          <p className="panel p-6 text-center text-sm text-ink-500">
            No campaigns yet — create your first one below.
          </p>
        )}
      </div>

      <div className="mt-8">
        <NewCampaignForm />
      </div>
    </div>
  );
}
