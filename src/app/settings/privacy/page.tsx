import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import PrivacyForm from "./PrivacyForm";
import DeleteAccount from "./DeleteAccount";

export const metadata: Metadata = { title: "Privacy" };
export const dynamic = "force-dynamic";

export default async function PrivacyPage() {
  const session = await requireUser("/settings/privacy");

  return (
    <main>
      <h1
        className="mb-1 text-2xl tracking-tight"
        style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}
      >
        Privacy
      </h1>
      <p className="mb-6 text-sm text-[var(--ink-3)]">
        Your GPS points are readable by you and nobody else — not other
        walkers, not moderators, not admins — and are deleted 90 days after
        each walk. Distance, time and splits stay. These settings control what
        gets derived from them.
      </p>
      <PrivacyForm
        initial={{
          shareLiveLocation: session.profile.share_live_location,
          fuzzEndpoints: session.profile.fuzz_endpoints,
          consentRecording: session.profile.consent_recording,
        }}
      />
      <DeleteAccount />
    </main>
  );
}
