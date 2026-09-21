"use client";
/**
 * Campaign workspace — tabbed layout: Story (AI GM), Oracle,
 * Journal, Cast & Threads, Party, Lore.
 *
 * Client component; tabs keep each panel mounted lazily to avoid
 * fetching everything at once.
 */
import { useState } from "react";
import { GmChat } from "@/components/gm/GmChat";
import { OraclePanel } from "@/components/oracle/OraclePanel";
import { JournalFeed } from "@/components/campaign/JournalFeed";
import { ThreadsPanel } from "@/components/campaign/ThreadsPanel";
import { PartyPanel } from "@/components/campaign/PartyPanel";
import { LorePanel } from "@/components/campaign/LorePanel";
import { ChaosRankControl } from "@/components/campaign/ChaosRankControl";

const TABS = ["Story", "Oracle", "Journal", "Threads & Cast", "Party", "Lore"] as const;
type Tab = (typeof TABS)[number];

export interface WorkspaceProps {
  campaignId: string;
  name: string;
  genre: string | null;
  chaosRank: number;
  currentScene: string | null;
  openSceneId: string | null;
  characters: Array<{ id: string; name: string; rank: string }>;
}

export function Workspace(props: WorkspaceProps) {
  const [tab, setTab] = useState<Tab>("Story");
  const [chaosRank, setChaosRank] = useState(props.chaosRank);

  async function changeChaos(rank: number) {
    setChaosRank(rank);
    await fetch(`/api/campaigns/${props.campaignId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chaosRank: rank }),
    });
  }

  return (
    <div className="flex h-screen flex-col">
      {/* Header */}
      <header className="border-b border-ink-200 bg-white px-6 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-serif text-xl font-semibold">{props.name}</h1>
            <p className="text-xs text-ink-500">
              {props.genre ?? "No genre"}
              {props.currentScene ? ` · Scene: ${props.currentScene}` : ""}
            </p>
          </div>
          <ChaosRankControl value={chaosRank} onChange={changeChaos} />
        </div>
        <nav className="mt-3 flex gap-1">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`border-b-2 px-3 py-1.5 text-sm ${
                tab === t
                  ? "border-accent font-semibold text-ink-900"
                  : "border-transparent text-ink-500 hover:text-ink-800"
              }`}
            >
              {t}
            </button>
          ))}
        </nav>
      </header>

      {/* Panels */}
      <section className="flex-1 overflow-hidden">
        {tab === "Story" && (
          <GmChat campaignId={props.campaignId} />
        )}
        {tab === "Oracle" && (
          <OraclePanel campaignId={props.campaignId} openSceneId={props.openSceneId} chaosRank={chaosRank} />
        )}
        {tab === "Journal" && <JournalFeed campaignId={props.campaignId} />}
        {tab === "Threads & Cast" && <ThreadsPanel campaignId={props.campaignId} />}
        {tab === "Party" && (
          <PartyPanel campaignId={props.campaignId} characters={props.characters} />
        )}
        {tab === "Lore" && <LorePanel campaignId={props.campaignId} />}
      </section>
    </div>
  );
}
