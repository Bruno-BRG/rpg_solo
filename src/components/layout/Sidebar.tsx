"use client";
/**
 * Sidebar navigation — flat, bordered, no gradients.
 */
import Link from "next/link";
import { signOut } from "next-auth/react";
import { usePathname } from "next/navigation";
import { Dices, Settings, Swords, Users } from "lucide-react";
import { ThemeToggle } from "@/components/layout/ThemeToggle";

const NAV = [
  { href: "/dashboard", label: "Campaigns", icon: Swords },
  { href: "/characters", label: "Characters", icon: Users },
  { href: "/dice", label: "Dice Roller", icon: Dices },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar({ user }: { user: { name?: string | null; email?: string | null } }) {
  const pathname = usePathname();

  return (
    <aside className="flex w-56 flex-col border-r border-ink-200 bg-white">
      <div className="border-b border-ink-200 px-4 py-4">
        <span className="font-serif text-lg font-semibold tracking-tight">RPG Solo</span>
      </div>
      <nav className="flex-1 py-2">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 border-l-2 px-4 py-2 text-sm ${
                active
                  ? "border-accent bg-ink-100 font-semibold text-ink-900"
                  : "border-transparent text-ink-600 hover:bg-ink-50 hover:text-ink-900"
              }`}
            >
              <Icon size={16} strokeWidth={1.75} />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-ink-200 px-4 py-3">
        <ThemeToggle />
        <p className="mt-2 truncate text-xs text-ink-500">{user?.email}</p>
        <button onClick={() => signOut({ callbackUrl: "/login" })} className="btn-ghost mt-2 w-full text-xs">
          Sign out
        </button>
      </div>
    </aside>
  );
}
