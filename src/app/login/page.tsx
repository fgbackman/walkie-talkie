import { Suspense } from "react";
import type { Metadata } from "next";
import LoginForm from "./LoginForm";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center px-5 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <div className="wt-label flex items-center gap-2 mb-4">
            <span className="w-2 h-2 rounded-full bg-[var(--signal)]" />
            Channel KX-7
          </div>
          <h1
            className="text-5xl leading-[0.92] tracking-tight"
            style={{ fontFamily: "var(--font-display)", fontWeight: 800 }}
          >
            Walkie
            <br />
            <span className="text-[var(--amber)]">Talkie</span>
          </h1>
          <p className="mt-4 text-[var(--ink-2)]">
            Drop-in audio rooms for people who are already walking.
          </p>
        </div>

        <Suspense fallback={<div className="h-40" />}>
          <LoginForm />
        </Suspense>

        <p className="mt-8 text-xs text-[var(--ink-3)] leading-relaxed">
          By signing in you agree that live audio is shared with everyone in a
          room you join, and that your location is never shown to anyone outside
          your squad. You can delete your account and every route at any time.
        </p>
      </div>
    </main>
  );
}
