/**
 * Characters page — lists campaigns to pick, then the character
 * creator (Savage Worlds guided creation) for the chosen one.
 */
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { CharacterCreator } from "@/components/rules/CharacterCreator";

export default async function CharactersPage() {
  const session = await getServerSession(authOptions);
  const campaigns = await prisma.campaign.findMany({
    where: { userId: session!.user.id },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return (
    <div className="mx-auto max-w-4xl p-8">
      <h1 className="font-serif text-3xl">Character Creator</h1>
      <p className="mt-1 text-sm text-ink-500">
        Guided Savage Worlds creation: attributes, core skills, edges and
        hindrances. Sheets attach to a campaign.
      </p>
      <div className="mt-6">
        <CharacterCreator campaigns={campaigns} />
      </div>
    </div>
  );
}
