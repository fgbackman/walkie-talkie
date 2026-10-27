"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { DELETE_ACCOUNT_PHRASE } from "@/lib/delete-phrase";

export default function DeleteAccount() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsReauth, setNeedsReauth] = useState(false);

  async function remove(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/account", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ confirm: phrase.trim().toLowerCase() }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);

    if (res.ok) {
      router.replace("/login?reason=deleted");
      router.refresh();
      return;
    }
    if (body.reauth) setNeedsReauth(true);
    setError(body.error ?? "Could not delete the account.");
  }

  async function signInAgain() {
    await supabaseBrowser().auth.signOut({ scope: "local" });
    router.replace("/login?next=/settings/privacy");
  }

  return (
    <section className="mt-8 rounded-2xl border border-[var(--signal)] p-4">
      <h2 className="text-sm font-semibold text-[var(--signal)]">Delete account</h2>
      <p className="mt-1 text-xs leading-relaxed text-[var(--ink-3)]">
        Removes your profile, every walk and GPS point, your posts, comments,
        follows and reports, and any channel you host. This can’t be undone.
      </p>

      {!open ? (
        <button
          type="button"
          className="wt-btn wt-btn-ghost mt-3"
          style={{ color: "var(--signal)" }}
          onClick={() => setOpen(true)}
        >
          Delete my account…
        </button>
      ) : (
        <form onSubmit={remove} className="mt-3 flex flex-col gap-3">
          <label htmlFor="confirm-delete" className="text-xs text-[var(--ink-2)]">
            Type <strong className="wt-mono">{DELETE_ACCOUNT_PHRASE}</strong> to confirm.
          </label>
          <input
            id="confirm-delete"
            className="wt-input"
            autoComplete="off"
            spellCheck={false}
            value={phrase}
            onChange={(e) => setPhrase(e.target.value)}
          />
          <button
            type="submit"
            className="wt-btn wt-btn-red"
            disabled={busy || phrase.trim().toLowerCase() !== DELETE_ACCOUNT_PHRASE}
          >
            {busy ? "Deleting…" : "Permanently delete"}
          </button>
          <button type="button" className="wt-btn wt-btn-ghost" onClick={() => setOpen(false)}>
            Cancel
          </button>
        </form>
      )}

      {error && (
        <div role="alert" className="mt-3 text-sm text-[var(--signal)]">
          <p>{error}</p>
          {needsReauth && (
            <button type="button" className="mt-2 underline" onClick={signInAgain}>
              Sign in again
            </button>
          )}
        </div>
      )}
    </section>
  );
}
