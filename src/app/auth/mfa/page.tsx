import { Suspense } from "react";
import type { Metadata } from "next";
import MfaChallenge from "./MfaChallenge";

export const metadata: Metadata = { title: "Two-step verification" };

export default function MfaPage() {
  return (
    <main className="min-h-screen flex items-center justify-center px-5 py-12">
      <div className="w-full max-w-sm">
        <div className="wt-label mb-3">Two-step verification</div>
        <h1
          className="text-3xl tracking-tight mb-2"
          style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}
        >
          Code, please
        </h1>
        <p className="text-sm text-[var(--ink-2)] mb-6">
          Open your authenticator app and enter the six digits for Walkie Talkie.
        </p>
        <Suspense fallback={<div className="h-32" />}>
          <MfaChallenge />
        </Suspense>
      </div>
    </main>
  );
}
