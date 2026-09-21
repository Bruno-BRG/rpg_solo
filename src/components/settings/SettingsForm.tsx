"use client";
/**
 * AI settings form — provider selection between the official
 * OpenAI API (key) and the ChatGPT subscription flow (OAuth).
 */
import { useEffect, useState } from "react";
import { PROVIDER_META, type ProviderId } from "@/lib/ai/provider";

interface Loaded {
  provider: ProviderId;
  chatModel: string;
  hasApiKey: boolean;
  hasOAuth: boolean;
  gmPersona?: string | null;
}

export function SettingsForm() {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [provider, setProvider] = useState<ProviderId>("openai-api");
  const [chatModel, setChatModel] = useState("gpt-4o");
  const [apiKey, setApiKey] = useState("");
  const [gmPersona, setGmPersona] = useState("");
  const [pastedUrl, setPastedUrl] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/settings/ai");
      if (res.ok) {
        const data = await res.json();
        if (data.settings) {
          setLoaded(data.settings);
          setProvider(data.settings.provider);
          setChatModel(data.settings.chatModel);
          setGmPersona(data.settings.gmPersona ?? "");
        }
      }
    })();
  }, []);

  async function completeManual() {
    setStatus(null);
    const res = await fetch("/api/ai/oauth/exchange", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callbackUrl: pastedUrl.trim() }),
    });
    if (res.ok) {
      setPastedUrl("");
      setStatus("ChatGPT account connected.");
      // Reload the loaded settings state.
      const r = await fetch("/api/settings/ai");
      if (r.ok) {
        const data = await r.json();
        if (data.settings) {
          setLoaded(data.settings);
          setProvider(data.settings.provider);
          setChatModel(data.settings.chatModel);
          setGmPersona(data.settings.gmPersona ?? "");
        }
      }
    } else {
      const data = await res.json().catch(() => ({}));
      setStatus(data.error ?? "Exchange failed.");
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);
    const res = await fetch("/api/settings/ai", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider,
        chatModel,
        apiKey: apiKey || undefined,
        gmPersona: gmPersona || undefined,
      }),
    });
    setStatus(res.ok ? "Saved." : "Failed to save.");
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <div className="panel">
        <div className="panel-header">AI provider</div>
        <div className="space-y-4 p-4">
          {Object.entries(PROVIDER_META).map(([id, meta]) => (
            <label key={id} className="flex cursor-pointer items-start gap-3">
              <input
                type="radio" name="provider" checked={provider === id}
                onChange={() => setProvider(id as ProviderId)}
                className="mt-1"
              />
              <span>
                <span className="block text-sm font-semibold">{meta.label}</span>
                <span className="block text-xs text-ink-500">{meta.description}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">Model & credentials</div>
        <div className="space-y-3 p-4">
          <div>
            <label className="label">Chat model</label>
            <input className="input" value={chatModel}
              onChange={(e) => setChatModel(e.target.value)}
              placeholder={provider === "chatgpt-oauth" ? "gpt-5-codex" : "gpt-4o"} />
          </div>

          {provider === "openai-api" && (
            <div>
              <label className="label">
                OpenAI API key {loaded?.hasApiKey && "(saved — leave blank to keep)"}
              </label>
              <input className="input" type="password" value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-…" />
            </div>
          )}

          {provider === "chatgpt-oauth" && (
            <div className="border border-ink-300 bg-ink-50 p-3 text-xs text-ink-600">
              {loaded?.hasOAuth
                ? "ChatGPT account connected."
                : "Connect your ChatGPT account via the Codex-style OAuth flow. After authorizing, the local callback captures the token automatically."}
              <div className="mt-2">
                <a className="btn-secondary inline-flex text-xs" href="/api/ai/oauth/login">
                  Connect ChatGPT account
                </a>
              </div>
              <details className="mt-3">
                <summary className="cursor-pointer select-none text-[11px] uppercase tracking-wider text-ink-400">
                  Manual fallback (paste callback URL)
                </summary>
                <div className="mt-2 flex gap-2">
                  <input
                    className="input"
                    placeholder="http://localhost:1455/auth/callback?code=…"
                    value={pastedUrl}
                    onChange={(e) => setPastedUrl(e.target.value)}
                  />
                  <button type="button" className="btn-secondary text-xs" disabled={!pastedUrl.trim()}
                    onClick={completeManual}>
                    Complete
                  </button>
                </div>
                <p className="mt-1">
                  If the local callback fails (port busy, remote server), copy the URL
                  from the browser address bar after authorizing and paste it here.
                </p>
              </details>
            </div>
          )}

          <div>
            <label className="label">GM persona (optional system-prompt override)</label>
            <textarea className="input min-h-24" value={gmPersona}
              onChange={(e) => setGmPersona(e.target.value)}
              placeholder="Grimdark tone, terse descriptions, frequent complications…" />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button type="submit" className="btn-primary">Save settings</button>
        {status && <span className="text-sm text-ink-500">{status}</span>}
      </div>
    </form>
  );
}
