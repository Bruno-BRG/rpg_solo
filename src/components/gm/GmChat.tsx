"use client";
/**
 * GM chat — talk to the AI Game Master.
 * Consumes the SSE stream from /api/chat and renders deltas live.
 */
import { useEffect, useRef, useState } from "react";

interface Turn {
  role: "user" | "assistant";
  content: string;
  tools?: Array<{ name: string; result: unknown }>;
}

export function GmChat({ campaignId }: { campaignId: string }) {
  const [turns, setTurns] = useState<Turn[]>([]);
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
    setBusy(true);
    setTurns((t) => [...t, { role: "user", content: message }, { role: "assistant", content: "" }]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId, message }),
      });
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
    } catch {
      setTurns((t) => {
        const copy = [...t];
        copy[copy.length - 1] = {
          role: "assistant",
          content: "⚠️ Connection error — try again.",
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
              Describe what your character does. The GM narrates, rolls, and
              consults the oracle when outcomes are uncertain.
            </p>
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
              <p className="whitespace-pre-wrap">{turn.content || "…"}</p>
              {turn.tools && turn.tools.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {turn.tools.map((t, j) => (
                    <span key={j} className="tag">
                      {t.name.replace(/_/g, " ")}
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
