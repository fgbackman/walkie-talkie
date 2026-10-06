"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";

type Factor = { id: string; status: string; friendly_name?: string };

export default function MfaSetup() {
  const router = useRouter();
  const [factors, setFactors] = useState<Factor[]>([]);
  const [enrolling, setEnrolling] = useState<{
    id: string;
    qr: string;
    secret: string;
  } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabaseBrowser().auth.mfa.listFactors();
    if (error) return setError(error.message);
    setFactors((data?.totp ?? []) as Factor[]);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function enroll() {
    setBusy(true);
    setError(null);
    const { data, error } = await supabaseBrowser().auth.mfa.enroll({
      factorType: "totp",
      friendlyName: `Walkie Talkie ${new Date().toISOString().slice(0, 10)}`,
    });
    setBusy(false);
    if (error) return setError(error.message);
    setEnrolling({
      id: data.id,
      qr: data.totp.qr_code,
      secret: data.totp.secret,
    });
  }

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    if (!enrolling) return;
    setBusy(true);
    setError(null);

    const supabase = supabaseBrowser();
    const challenge = await supabase.auth.mfa.challenge({ factorId: enrolling.id });
    if (challenge.error) {
      setBusy(false);
      return setError(challenge.error.message);
    }
    const { error } = await supabase.auth.mfa.verify({
      factorId: enrolling.id,
      challengeId: challenge.data.id,
      code: code.trim(),
    });
    setBusy(false);
    if (error) return setError("That code didn't match. Try the next one.");

    setEnrolling(null);
    setCode("");
    setNote("Two-step verification is on.");
    await load();
    router.refresh();
  }

  async function remove(id: string) {
    if (!window.confirm("Remove this authenticator? Your account gets less safe.")) return;
    setBusy(true);
    const { error } = await supabaseBrowser().auth.mfa.unenroll({ factorId: id });
    setBusy(false);
    if (error) return setError(error.message);
    await load();
    router.refresh();
  }

  const verified = factors.filter((f) => f.status === "verified");

  return (
    <div className="flex flex-col gap-5">
      {note && (
        <p className="rounded-xl bg-[var(--teal-ghost)] p-3 text-sm text-[var(--teal)]">
          {note}
        </p>
      )}

      {verified.length > 0 && (
        <section className="wt-card p-4">
          <div className="wt-label mb-2">Active authenticators</div>
          <ul className="flex flex-col gap-2">
            {verified.map((f) => (
              <li key={f.id} className="flex items-center gap-3">
                <span className="text-sm">{f.friendly_name ?? "Authenticator app"}</span>
                <button
                  onClick={() => remove(f.id)}
                  disabled={busy}
                  className="ml-auto text-xs text-[var(--signal)] underline"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {enrolling ? (
        <section className="wt-card p-4">
          <div className="wt-label mb-3">Scan this</div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={enrolling.qr}
            alt="QR code for your authenticator app"
            width={200}
            height={200}
            className="mb-3 rounded-lg bg-white p-2"
          />
          <p className="mb-1 text-xs text-[var(--ink-3)]">
            Can’t scan? Enter this key by hand:
          </p>
          <p className="wt-mono mb-4 select-all break-all rounded-lg bg-[var(--card-2)] p-2 text-xs">
            {enrolling.secret}
          </p>
          <form onSubmit={confirm} className="flex flex-col gap-3">
            <input
              className="wt-input wt-mono text-center text-xl tracking-[0.35em]"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              pattern="[0-9]{6}"
              required
              aria-label="Six-digit code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            />
            <button className="wt-btn wt-btn-amber" disabled={busy || code.length !== 6}>
              {busy ? "Checking…" : "Turn it on"}
            </button>
            <button
              type="button"
              className="wt-btn wt-btn-ghost"
              onClick={() => setEnrolling(null)}
            >
              Cancel
            </button>
          </form>
        </section>
      ) : (
        <button className="wt-btn wt-btn-amber" onClick={enroll} disabled={busy}>
          {verified.length ? "Add another authenticator" : "Turn on two-step verification"}
        </button>
      )}

      {error && (
        <p role="alert" className="text-sm text-[var(--signal)]">
          {error}
        </p>
      )}

      <p className="text-xs leading-relaxed text-[var(--ink-3)]">
        Admin and moderator accounts must use two-step verification. If you
        lose your authenticator, an admin has to reset it for you — we can’t
        email you a bypass code, because an attacker in your inbox would get it
        too.
      </p>
    </div>
  );
}
