"use client";
/**
 * Login page — email + password credentials form.
 */
import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });
    setLoading(false);
    if (res?.error) {
      setError("Invalid email or password.");
    } else {
      router.push("/dashboard");
      router.refresh();
    }
  }

  return (
    <div className="panel">
      <div className="panel-header">RPG Solo</div>
      <form onSubmit={onSubmit} className="space-y-4 p-6">
        <h1 className="font-serif text-2xl">Sign in</h1>
        {error && (
          <p className="border border-accent/40 bg-accent/5 px-3 py-2 text-sm text-accent">
            {error}
          </p>
        )}
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input
            id="email" type="email" required autoComplete="email"
            className="input" value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input
            id="password" type="password" required autoComplete="current-password"
            className="input" value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <button type="submit" className="btn-primary w-full" disabled={loading}>
          {loading ? "Signing in…" : "Sign in"}
        </button>
        <p className="text-center text-sm text-ink-500">
          No account?{" "}
          <Link href="/register" className="underline hover:text-ink-800">
            Register
          </Link>
        </p>
      </form>
    </div>
  );
}
