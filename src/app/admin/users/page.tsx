import { requireModerator } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import UserRow from "./UserRow";

export const dynamic = "force-dynamic";

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const session = await requireModerator();
  const { q } = await searchParams;
  const supabase = await supabaseServer();

  let query = supabase
    .from("profiles")
    .select("id,handle,display_name,avatar_url,role,banned_at,suspended_until,created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  if (q) query = query.ilike("handle", `%${q}%`);

  const { data: users } = await query;

  return (
    <main>
      <h1
        className="mb-1 text-2xl tracking-tight"
        style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}
      >
        Users
      </h1>
      <p className="mb-5 text-sm text-[var(--ink-3)]">
        {session.profile.role === "admin"
          ? "You can suspend, ban and change roles. You cannot change your own role."
          : "Moderators can see this list. Suspending and banning is admin-only."}
      </p>

      <form className="mb-5 flex gap-2" action="/admin/users">
        <input
          name="q"
          className="wt-input"
          placeholder="Search by handle"
          defaultValue={q ?? ""}
        />
        <button className="wt-btn w-auto px-5" type="submit">
          Search
        </button>
      </form>

      <ul className="wt-card divide-y divide-[var(--line-2)]">
        {(users ?? []).map((u) => (
          <UserRow
            key={u.id}
            user={u}
            canAct={session.profile.role === "admin"}
            isSelf={u.id === session.id}
          />
        ))}
      </ul>
    </main>
  );
}
