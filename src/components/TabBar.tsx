"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Channels", match: (p: string) => p === "/" || p.startsWith("/rooms") },
  { href: "/walk", label: "Walk", match: (p: string) => p.startsWith("/walk") },
  { href: "/feed", label: "Feed", match: (p: string) => p.startsWith("/feed") },
  { href: "/me", label: "Me", match: (p: string) => p.startsWith("/me") || p.startsWith("/settings") },
];

const ICONS: Record<string, React.ReactNode> = {
  Channels: (
    <>
      <path d="M4 14a8 8 0 0 1 16 0" />
      <rect x="3" y="14" width="4" height="6" rx="1.6" />
      <rect x="17" y="14" width="4" height="6" rx="1.6" />
    </>
  ),
  Walk: (
    <>
      <circle cx="13" cy="4" r="1.8" />
      <path d="m10.5 21 1.8-5.4L9 13l1-5 3.5 2 3 1" />
      <path d="m10 8-2.5 4M12.3 15.6 15 21" />
    </>
  ),
  Feed: (
    <>
      <rect x="3" y="4" width="18" height="7" rx="2" />
      <rect x="3" y="14" width="18" height="6" rx="2" />
    </>
  ),
  Me: (
    <>
      <circle cx="12" cy="8" r="3.4" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </>
  ),
};

export default function TabBar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Main"
      className="sticky bottom-0 z-20 grid grid-cols-4 gap-1 border-t border-[var(--line)] bg-[var(--card)] px-2 pb-[max(14px,env(safe-area-inset-bottom))] pt-2"
    >
      {TABS.map((t) => {
        const active = t.match(pathname);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className="flex flex-col items-center gap-1 rounded-xl py-1.5"
            style={{ color: active ? "var(--ink)" : "var(--ink-3)" }}
          >
            <svg
              viewBox="0 0 24 24"
              width="21"
              height="21"
              fill="none"
              stroke={active ? "var(--amber)" : "currentColor"}
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              {ICONS[t.label]}
            </svg>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                letterSpacing: "0.06em",
              }}
            >
              {t.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
