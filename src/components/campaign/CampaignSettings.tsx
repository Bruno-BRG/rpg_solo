"use client";
/**
 * Campaign settings — per-campaign AI configuration and danger zone.
 *
 * Chat model / GM persona / temperature override the user's global
 * settings; clearing a field falls back to the user default. Deleting
 * the campaign requires typing its exact name.
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export interface CampaignSettings {
  name: string;
  genre: string | null;
  chatModel: string | null;
  gmPersona: string | null;
  temperature: number | null;
}

export function CampaignSettingsPanel({
  campaignId,
  initial,
}: {
  campaignId: string;
  initial: CampaignSettings;
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    name: initial.name,
    genre: initial.genre ?? "",
    chatModel: initial.chatModel ?? "",
    gmPersona: initial.gmPersona ?? "",
    temperature: initial.temperature ?? 0.8,
  });
  const [models, setModels] = useState<string[]>([]);
  const [provider, setProvider] = useState<string>("openai-api");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteName, setDeleteName] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetch("/api/ai/models")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.models) {
          setModels(d.models);
          setProvider(d.provider);
        }
      })
      .catch(() => undefined);
  }, []);

  async function save() {
    setSaving(true);
    setSaved(false);
    setError(null);
    const res = await fetch(`/api/campaigns/${campaignId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        genre: form.genre || null,
        chatModel: form.chatModel || null,
        gmPersona: form.gmPersona || null,
        temperature: form.temperature,
      }),
    });
    setSaving(false);
    if (res.ok) {
      setSaved(true);
      router.refresh();
      setTimeout(() => setSaved(false), 2500);
    } else {
      const data = await res.json().catch(() => ({}));
      setError(typeof data.error === "string" ? data.error : "Could not save.");
    }
  }

  async function remove() {
    setDeleting(true);
    const res = await fetch(`/api/campaigns/${campaignId}`, { method: "DELETE" });
    if (res.ok) {
      router.push("/dashboard");
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(typeof data.error === "string" ? data.error : "Could not delete.");
      setDeleting(false);
    }
  }

  const providerLabel = provider === "chatgpt-oauth" ? "ChatGPT (Plus)" : "OpenAI API";

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      {error && (
        <div className="border border-accent bg-accent/5 px-4 py-2 text-sm text-accent">{error}</div>
      )}

      {/* ── AI configuration ─────────────────────────────────── */}
      <div className="panel">
        <div className="panel-header">AI · this campaign</div>
        <div className="space-y-4 p-4">
          <div>
            <label className="label">Chat model</label>
            <select
              className="input"
              value={form.chatModel}
              onChange={(e) => setForm({ ...form, chatModel: e.target.value })}
            >
              <option value="">(use my global model)</option>
              {models.map((m: string) => (
                <option key={m} value={m}>
                  {m} — {provider === "chatgpt-oauth" ? "ChatGPT (Plus)" : "OpenAI API"}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-ink-400">
              Catalog for {providerLabel}. Empty = follows your global
              setting.
            </p>
          </div>

          <div>
            <label className="label">GM style / persona (override)</label>
            <textarea
              className="input min-h-24"
              placeholder="e.g. dark humor, short punchy beats, NPCs never exposition-dump…"
              value={form.gmPersona}
              onChange={(e) => setForm({ ...form, gmPersona: e.target.value })}
            />
            <p className="mt-1 text-[11px] text-ink-400">
              Empty = uses your global GM persona. This shapes every GM answer in
              this campaign.
            </p>
          </div>

          <div>
            <label className="label">Narrative temperature ({form.temperature.toFixed(1)})</label>
            <input
              type="range" min={0} max={2} step={0.1}
              value={form.temperature}
              onChange={(e) => setForm({ ...form, temperature: Number(e.target.value) })}
              className="w-full accent-[rgb(var(--accent-rgb))]"
            />
            <div className="flex justify-between text-[10px] uppercase tracking-wider text-ink-400">
              <span>0 · strict</span>
              <span>0.8 · default</span>
              <span>2 · wild</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Campaign identity ────────────────────────────────── */}
      <div className="panel">
        <div className="panel-header">Campaign</div>
        <div className="space-y-4 p-4">
          <div>
            <label className="label">Name</label>
            <input
              className="input" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Genre / setting</label>
            <input
              className="input" placeholder="weird west, space opera…"
              value={form.genre ?? ""}
              onChange={(e) => setForm({ ...form, genre: e.target.value })}
            />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button className="btn-primary" onClick={save} disabled={saving || !form.name.trim()}>
          {saving ? "Saving…" : "Save settings"}
        </button>
        {saved && <span className="text-xs text-ink-500">Saved.</span>}
      </div>

      {/* ── Danger zone ──────────────────────────────────────── */}
      <div className="panel border-accent">
        <div className="panel-header text-accent">Danger zone</div>
        <div className="space-y-3 p-4">
          <p className="text-sm text-ink-600">
            Deletes the campaign <strong>and everything in it</strong>: scenes,
            chat history, journal, threads, cast, tasks, characters and lore
            memory. There is no undo.
          </p>
          <div className="flex gap-2">
            <input
              className="input"
              placeholder={`type "${initial.name}" to confirm`}
              value={deleteName}
              onChange={(e) => setDeleteName(e.target.value)}
            />
            <button
              className="btn border-accent text-accent hover:bg-accent hover:text-white disabled:opacity-40"
              disabled={deleting || deleteName !== initial.name || !initial.name}
              onClick={remove}
            >
              {deleting ? "Deleting…" : "Delete forever"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
