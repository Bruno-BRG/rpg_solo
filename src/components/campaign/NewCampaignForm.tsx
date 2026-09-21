"use client";
/**
 * New campaign form — name, genre, optional setting notes
 * (notes are ingested into the campaign's RAG memory).
 */
import { useState } from "react";
import { useRouter } from "next/navigation";

export function NewCampaignForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", genre: "", settingNotes: "" });
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const res = await fetch("/api/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setLoading(false);
    if (res.ok) {
      const data = await res.json();
      router.push(`/campaigns/${data.campaign.id}`);
    }
  }

  if (!open) {
    return (
      <button className="btn-secondary" onClick={() => setOpen(true)}>
        + New campaign
      </button>
    );
  }

  return (
    <form onSubmit={onSubmit} className="panel max-w-xl space-y-4 p-4">
      <div className="panel-header">New campaign</div>
      <div className="grid grid-cols-2 gap-3 p-4">
        <div className="col-span-2">
          <label className="label">Name</label>
          <input className="input" required value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="col-span-2">
          <label className="label">Genre / setting</label>
          <input className="input" placeholder="weird west, space opera…"
            value={form.genre}
            onChange={(e) => setForm({ ...form, genre: e.target.value })} />
        </div>
        <div className="col-span-2">
          <label className="label">Setting notes (fed to AI memory)</label>
          <textarea className="input min-h-32" value={form.settingNotes}
            onChange={(e) => setForm({ ...form, settingNotes: e.target.value })} />
        </div>
      </div>
      <div className="flex gap-2 border-t border-ink-200 p-4">
        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? "Creating…" : "Create"}
        </button>
        <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
