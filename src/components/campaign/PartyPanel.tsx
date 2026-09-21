"use client";
/**
 * Party panel — Savage Worlds character sheets of the campaign.
 * Shows a summary list; sheet editing happens in the character
 * creator (Characters page).
 */
import Link from "next/link";

export function PartyPanel({
  campaignId,
  characters,
}: {
  campaignId: string;
  characters: Array<{ id: string; name: string; rank: string }>;
}) {
  return (
    <div className="mx-auto max-w-3xl p-6">
      {characters.length === 0 ? (
        <div className="panel p-6 text-center">
          <p className="text-sm text-ink-500">
            No characters in this campaign yet.
          </p>
          <Link href="/characters" className="btn-primary mt-4 inline-flex">
            Create a character
          </Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {characters.map((c) => (
            <li key={c.id} className="panel px-4 py-3">
              <div className="flex items-center justify-between">
                <span className="font-semibold">{c.name}</span>
                <span className="tag">{c.rank}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
