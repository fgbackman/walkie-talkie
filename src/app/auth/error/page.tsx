import Link from "next/link";

const MESSAGES: Record<string, { title: string; body: string }> = {
  banned: {
    title: "This account is closed",
    body: "Your account was removed for breaking the community rules. If you think that's wrong, reply to the email we sent you.",
  },
  forbidden: {
    title: "Not your door",
    body: "You don't have access to that area.",
  },
  "no-profile": {
    title: "Something went wrong setting up your profile",
    body: "Sign in again — if it keeps happening, let us know.",
  },
  "missing-code": {
    title: "That link didn't carry a sign-in code",
    body: "Links expire after an hour. Request a fresh one.",
  },
};

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await searchParams;
  const m = (reason && MESSAGES[reason]) || {
    title: "We couldn't sign you in",
    body: reason ? `The server said: ${reason}` : "Try again.",
  };

  return (
    <main className="min-h-screen flex items-center justify-center px-5">
      <div className="wt-card p-6 max-w-sm">
        <h1
          className="text-xl mb-2"
          style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}
        >
          {m.title}
        </h1>
        <p className="text-sm text-[var(--ink-2)] mb-5">{m.body}</p>
        <Link href="/login" className="wt-btn">
          Back to sign in
        </Link>
      </div>
    </main>
  );
}
