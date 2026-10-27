"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { safeNext } from "@/lib/safe-redirect";

export default function MfaChallenge() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabaseBrowser().auth.mfa.listFactors();
      if (cancelled) return;
      if (error) return setError(error.message);
      const totp = data?.totp?.find((f) => f.status === "verified");
      if (!totp) {
        // No factor enrolled — nothing to challenge.
        router.replace(next);
        return;
      }
      setFactorId(totp.id);
    })();
    return () => {
      cancelled = true;
    };
  }, [router, next]);

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (!factorId) return;
    setBusy(true);
    setError(null);

    const supabase = supabaseBrowser();
    const challenge = await supabase.auth.mfa.challenge({ factorId });
    if (challenge.error) {
      setBusy(false);
      return setError(challenge.error.message);
    }

    const { error } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challenge.data.id,
      code: code.trim(),
    });

    setBusy(false);
    if (error) return setError("That code didn't match. Codes rotate every 30 seconds.");
    router.replace(next);
    router.refresh();
  }

  return (
    <form onSubmit={verify} className="flex flex-col gap-4">
      <input
        className="wt-input wt-mono text-center text-2xl tracking-[0.4em]"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]{6}"
        maxLength={6}
        required
        aria-label="Six-digit code"
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
      />
      <button
        type="submit"
        className="wt-btn wt-btn-amber"
        disabled={busy || code.length !== 6}
      >
        {busy ? "Checking…" : "Verify"}
      </button>
      {error && (
        <p role="alert" className="text-sm text-[var(--signal)]">
          {error}
        </p>
      )}
    </form>
  );
}
