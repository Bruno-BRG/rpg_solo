"use client";
/**
 * Campaign workspace — tabbed layout: Story (AI GM), Oracle,
 * Tables, Journal, Cast & Threads, Party, Lore.
 *
 * Client component; tabs keep each panel mounted lazily to avoid
 * fetching everything at once. Shared world state (chaos rank,
 * open scene, refresh signal after GM turns) lives here and is
 * pushed down to the panels that care about it.
 */
import { useEffect, useState } from "react";
import { GmChat, type Turn } from "@/components/gm/GmChat";
import { OraclePanel } from "@/components/oracle/OraclePanel";
import { TablesPanel } from "@/components/oracle/TablesPanel";
import { JournalFeed } from "@/components/campaign/JournalFeed";
import { ThreadsPanel } from "@/components/campaign/ThreadsPanel";
import { PartyPanel } from "@/components/campaign/PartyPanel";
import { MemoryPanel } from "@/components/campaign/MemoryPanel";
import { PrepPanel } from "@/components/campaign/PrepPanel";
import { ChaosRankControl } from "@/components/campaign/ChaosRankControl";
import { CampaignSettingsPanel, type CampaignSettings } from "@/components/campaign/CampaignSettings";

const TABS = [
  "Story",
  "Oracle",
  "Tables",
  "Journal",
  "Threads & Cast",
  "Party",
  "Memory",
  "Prep",
  "Settings",
] as const;
type Tab = (typeof TABS)[number];

export interface WorkspaceProps {
  campaignId: string;
  name: string;
  genre: string | null;
  chaosRank: number;
  currentScene: string | null;
  openSceneId: string | null;
  /** Persisted conversation, oldest-first (ChatTurn rows). */
  chatTurns?: Turn[];
  /** Per-campaign AI overrides (null = user global). */
  aiConfig?: CampaignSettings;
}

export function Workspace(props: WorkspaceProps) {
  const [tab, setTab] = useState<Tab>("Story");
  const [chaosRank, setChaosRank] = useState(props.chaosRank);
  const [openSceneId, setOpenSceneId] = useState(props.openSceneId);
  const [currentScene, setCurrentScene] = useState(props.currentScene);
  /** Bumped after every GM turn so panels refetch world state. */
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    setOpenSceneId(props.openSceneId);
    setCurrentScene(props.currentScene);
  }, [props.openSceneId, props.currentScene]);

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
              {currentScene ? ` · Scene: ${currentScene}` : ""}
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

      {/* Panels — each panel manages its own height; long panels
          (Settings, Threads, Lore…) scroll here instead of being clipped. */}
      <section className="flex-1 overflow-y-auto">
        {tab === "Story" && (
          <GmChat
            campaignId={props.campaignId}
            initialTurns={props.chatTurns}
            onChaosChange={setChaosRank}
            onSceneChange={(sceneId, title) => {
              setOpenSceneId(sceneId);
              setCurrentScene(title ?? null);
            }}
            onTurnDone={() => setRefreshKey((k) => k + 1)}
          />
        )}
        {tab === "Oracle" && (
          <OraclePanel
            campaignId={props.campaignId}
            openSceneId={openSceneId}
            chaosRank={chaosRank}
          />
        )}
        {tab === "Tables" && <TablesPanel openSceneId={openSceneId} />}
        {tab === "Journal" && (
          <JournalFeed campaignId={props.campaignId} refreshKey={refreshKey} />
        )}
        {tab === "Threads & Cast" && (
          <ThreadsPanel campaignId={props.campaignId} refreshKey={refreshKey} />
        )}
        {tab === "Party" && (
          <PartyPanel campaignId={props.campaignId} key={refreshKey} />
        )}
        {tab === "Memory" && (
          <MemoryPanel campaignId={props.campaignId} refreshKey={refreshKey} />
        )}
        {tab === "Prep" && (
          <PrepPanel campaignId={props.campaignId} refreshKey={refreshKey} />
        )}
        {tab === "Settings" && (
          <CampaignSettingsPanel
            campaignId={props.campaignId}
            initial={props.aiConfig ?? {
              name: props.name,
              genre: props.genre,
              chatModel: null,
              gmPersona: null,
              temperature: null,
            }}
          />
        )}
      </section>
    </div>
  );
}
