"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { publicEnv } from "@/lib/env";
import { safeNext } from "@/lib/safe-redirect";

export default function LoginForm() {
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const redirectTo = `${publicEnv.NEXT_PUBLIC_SITE_URL}/auth/callback?next=${encodeURIComponent(next)}`;

  async function google() {
    setError(null);
    setBusy(true);
    const { error } = await supabaseBrowser().auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
        queryParams: { access_type: "offline", prompt: "consent" },
      },
    });
    if (error) {
      setError(error.message);
      setBusy(false);
    }
  }

  async function magicLink(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const { error } = await supabaseBrowser().auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: redirectTo },
    });
    setBusy(false);
    if (error) setError(error.message);
    else setSent(true);
  }

  if (sent) {
    return (
      <div className="wt-card p-5">
        <h2
          className="text-lg mb-1"
          style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}
        >
          Check your email
        </h2>
        <p className="text-sm text-[var(--ink-2)]">
          We sent a sign-in link to <strong>{email}</strong>. It expires in an
          hour.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={google}
        disabled={busy}
        className="wt-btn wt-btn-amber"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="currentColor"
            d="M21.35 11.1H12v2.98h5.35c-.23 1.4-1.63 4.1-5.35 4.1-3.22 0-5.85-2.67-5.85-5.95S8.78 6.28 12 6.28c1.83 0 3.06.78 3.76 1.45l2.56-2.47C16.72 3.73 14.56 2.8 12 2.8 6.98 2.8 2.9 6.88 2.9 11.9S6.98 21 12 21c5.77 0 9.58-4.05 9.58-9.76 0-.66-.07-1.16-.23-1.64z"
          />
        </svg>
        Continue with Google
      </button>

      <div className="flex items-center gap-3 text-[var(--ink-3)]">
        <span className="h-px flex-1 bg-[var(--line)]" />
        <span className="wt-label">or</span>
        <span className="h-px flex-1 bg-[var(--line)]" />
      </div>

      <form onSubmit={magicLink} className="flex flex-col gap-3">
        <label className="wt-label" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          className="wt-input"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button type="submit" disabled={busy || !email} className="wt-btn wt-btn-ghost">
          {busy ? "Sending…" : "Email me a link"}
        </button>
      </form>

      {error && (
        <p
          role="alert"
          className="text-sm text-[var(--signal)] bg-[var(--signal-ghost)] rounded-xl p-3"
        >
          {error}
        </p>
      )}
    </div>
  );
}
