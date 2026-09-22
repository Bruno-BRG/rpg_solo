"use client";
/**
 * GM chat — talk to the AI Game Master.
 *
 * Consumes the SSE stream from /api/chat and renders deltas live.
 * History hydrates from the persisted ChatTurn rows (survives
 * reloads); world-state effects (chaos rank, new scene) propagate
 * to the workspace so the Oracle tab stays in sync.
 */
import { useEffect, useRef, useState } from "react";
import { Markdown } from "./Markdown";

export interface Turn {
  role: "user" | "assistant";
  content: string;
  tools?: Array<{ name: string; result: unknown }>;
}

export function GmChat({
  campaignId,
  initialTurns,
  onChaosChange,
  onSceneChange,
  onTurnDone,
}: {
  campaignId: string;
  initialTurns?: Turn[];
  onChaosChange?: (rank: number) => void;
  onSceneChange?: (sceneId: string) => void;
  onTurnDone?: () => void;
}) {
  const [turns, setTurns] = useState<Turn[]>(initialTurns ?? []);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const message = input.trim();
    if (!message || busy) return;
    setInput("");
    await runTurn({ message });
  }

  /** Opening narration: the GM sets the scene up and starts the story. */
  async function beginAdventure() {
    if (busy) return;
    await runTurn({ opening: true });
  }

  async function runTurn(payload: { message?: string; opening?: boolean }) {
    setBusy(true);
    const userLabel = payload.opening ? "Begin the adventure." : payload.message!;
    setTurns((t) => [...t, { role: "user", content: userLabel }, { role: "assistant", content: "" }]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId, ...payload }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          typeof data.error === "string" && data.error
            ? data.error
            : `The GM is unavailable (HTTP ${res.status}).`,
        );
      }
      if (!res.body) throw new Error("No stream");

      // Parse the SSE stream manually.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assistantText = "";
      let tools: Turn["tools"] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";

        for (const event of events) {
          const lines = event.split("\n");
          const eventName = lines.find((l) => l.startsWith("event: "))?.slice(7);
          const dataLine = lines.find((l) => l.startsWith("data: "))?.slice(6);
          if (!eventName || !dataLine) continue;
          const data = JSON.parse(dataLine);

          if (eventName === "delta") {
            assistantText += data.text;
            setTurns((t) => {
              const copy = [...t];
              copy[copy.length - 1] = { role: "assistant", content: assistantText };
              return copy;
            });
          } else if (eventName === "done") {
            tools = data.toolTrace ?? [];
            setTurns((t) => {
              const copy = [...t];
              copy[copy.length - 1] = { role: "assistant", content: data.content || assistantText, tools };
              return copy;
            });
            // World-state effects (chaos dial, freshly opened scene).
            if (typeof data.effects?.chaosRank === "number") {
              onChaosChange?.(data.effects.chaosRank);
            }
            if (typeof data.effects?.sceneId === "string") {
              onSceneChange?.(data.effects.sceneId);
            }
            onTurnDone?.();
          } else if (eventName === "error") {
            assistantText += `\n\n⚠️ ${data.message}`;
            setTurns((t) => {
              const copy = [...t];
              copy[copy.length - 1] = { role: "assistant", content: assistantText };
              return copy;
            });
          }
        }
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Connection error — try again.";
      setTurns((t) => {
        const copy = [...t];
        copy[copy.length - 1] = {
          role: "assistant",
          content: `⚠️ ${message}`,
        };
        return copy;
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col">
      {/* Transcript */}
      <div className="flex-1 space-y-4 overflow-y-auto p-6">
        {turns.length === 0 && (
          <div className="panel p-6 text-center text-sm text-ink-500">
            <p className="font-serif text-lg text-ink-800">The table is set.</p>
            <p className="mt-1">
              Let the GM open the story with narration — or describe what
              your character does to jump straight in.
            </p>
            <button
              className="btn-primary mt-4"
              onClick={beginAdventure}
              disabled={busy}
            >
              {busy ? "Opening…" : "Begin the adventure"}
            </button>
          </div>
        )}
        {turns.map((turn, i) => (
          <div key={i} className={turn.role === "user" ? "flex justify-end" : ""}>
            <div
              className={`max-w-[85%] px-4 py-2 text-sm leading-relaxed ${
                turn.role === "user"
                  ? "border border-ink-300 bg-ink-100"
                  : "border-l-2 border-accent bg-white"
              }`}
            >
              {turn.role === "assistant" && (
                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-widest text-ink-400">
                  GM
                </span>
              )}
              {turn.role === "assistant" ? (
                <Markdown>{turn.content || "…"}</Markdown>
              ) : (
                <p className="whitespace-pre-wrap">{turn.content}</p>
              )}
              {turn.tools && turn.tools.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {turn.tools.map((t, j) => (
                    <span key={j} className="tag" title={JSON.stringify(t.result)}>
                      {formatToolCall(t.name, t.result)}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <form onSubmit={send} className="border-t border-ink-200 bg-white p-4">
        <div className="flex gap-2">
          <input
            className="input"
            placeholder="What do you do?"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={busy}
          />
          <button className="btn-primary" disabled={busy || !input.trim()}>
            {busy ? "…" : "Send"}
          </button>
        </div>
      </form>
    </div>
  );
}

/** Turn a tool result into a compact, readable chip label. */
function formatToolCall(name: string, result: unknown): string {
  const r = (result ?? {}) as Record<string, any>;
  if (r.error) return `⚠ ${String(r.error).slice(0, 60)}`;

  switch (name) {
    case "roll_dice":
      return `🎲 ${r.description ?? "roll"}: ${r.label} → ${r.total}${
        r.criticalFailure ? " · CRIT FAIL" : r.raises > 0 ? ` · +${r.raises} raise` : ""
      }${r.success ? " ✔" : " ✘"}`;
    case "roll_damage":
      return `⚔ ${r.summary ?? `${r.total} vs TN ${r.toughness}`}`;
    case "roll_initiative":
      return `Initiative: ${(r.round ?? []).map((e: any) => e.name).join(" > ")}`;
    case "ask_oracle":
      return `Oracle: ${r.answer} (${r.roll}/${r.threshold})${r.randomEvent ? " ⚡" : ""}`;
    case "random_event":
      return `⚡ Event: ${r.event?.description ?? ""}${r.event ? ` · ${r.event.focus}` : ""}`;
    case "roll_table":
      return `Table [${r.roll}]: ${r.text}`;
    case "generate_npc":
      return `NPC: ${r.npc?.name} (${r.npc?.stance})`;
    case "run_interlude":
      return `Interlude: ${r.interlude?.question ?? ""}`;
    case "setup_scene":
      return `Scene check: ${r.type}${r.applied ? " (applied)" : ""}`;
    case "start_dramatic_task":
      return `⏱ Task: ${r.name} (0/${r.requiredSuccesses}, ${r.timeLimit} rounds)`;
    case "advance_dramatic_task":
      return `⏱ ${r.skill} → +${r.roll?.raises ?? 0} tokens (${r.successes}/${r.requiredSuccesses})${r.status !== "running" ? ` · ${r.status}` : ""}`;
    case "award_experience":
      return `+${r.amount} XP → ${(r.awarded ?? []).map((c: any) => c.name).join(", ")}`;
    case "save_journal_entry":
      return `📜 Journal: ${r.title}`;
    case "set_chaos_rank":
      return `Chaos → ${r.rank}: ${r.reason}`;
    case "open_scene":
      return `Scene: ${r.title}`;
    case "close_scene":
      return `Scene closed${r.reason ? `: ${r.reason}` : ""}`;
    case "update_threads":
      return `Thread ${r.action}${r.summary ? `: ${r.summary}` : ""}`;
    case "update_cast":
      return `Cast ${r.action}${r.name ? `: ${r.name} (${r.stance ?? "Neutral"})` : ""}`;
    case "update_character":
      return `${r.name}: ${(
        ["bennies", "wounds", "fatigue", "powerPoints"] as const
      )
        .filter((k) => r[k] !== undefined)
        .map((k) => `${k}=${r[k]}`)
        .join(" ")}`;
    case "search_lore":
      return `Memory: ${(r.results ?? []).length} hits`;
    default:
      return name.replace(/_/g, " ");
  }
}
