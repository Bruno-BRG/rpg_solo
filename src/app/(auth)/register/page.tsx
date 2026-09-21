"use client";
/**
 * Register page — creates an account, then redirects to login.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Registration failed.");
      return;
    }
    router.push("/login");
  }

  return (
    <div className="panel">
      <div className="panel-header">RPG Solo</div>
      <form onSubmit={onSubmit} className="space-y-4 p-6">
        <h1 className="font-serif text-2xl">Create account</h1>
        {error && (
          <p className="border border-accent/40 bg-accent/5 px-3 py-2 text-sm text-accent">
            {error}
          </p>
        )}
        <div>
          <label className="label" htmlFor="name">Name</label>
          <input id="name" className="input" value={form.name}
            onChange={(e) => set("name", e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" type="email" required className="input"
            value={form.email} onChange={(e) => set("email", e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="password">Password (min 8)</label>
          <input id="password" type="password" required minLength={8}
            className="input" value={form.password}
            onChange={(e) => set("password", e.target.value)} />
        </div>
        <button type="submit" className="btn-primary w-full" disabled={loading}>
          {loading ? "Creating…" : "Register"}
        </button>
        <p className="text-center text-sm text-ink-500">
          Already registered?{" "}
          <Link href="/login" className="underline hover:text-ink-800">Sign in</Link>
        </p>
      </form>
    </div>
  );
}
