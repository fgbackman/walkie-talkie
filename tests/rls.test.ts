/**
 * Row Level Security assertions.
 *
 * These run against a real Postgres (local `supabase start`, or a scratch
 * project). They are the test that matters most in this repo: they prove a
 * signed-in stranger cannot read another person's location history.
 *
 * Skipped automatically when the environment isn't configured, so `npm test`
 * still passes on a fresh clone.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "../src/types/database";

const URL = process.env.SUPABASE_TEST_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON =
  process.env.SUPABASE_TEST_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE =
  process.env.SUPABASE_TEST_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

const configured = Boolean(URL && ANON && SERVICE);
const d = configured ? describe : describe.skip;

type Client = SupabaseClient<Database>;

type Ctx = {
  aId: string;
  bId: string;
  aClient: Client;
  bClient: Client;
  walkId: string;
};

let ctx: Ctx;

async function makeUser(email: string) {
  const admin = createClient<Database>(URL!, SERVICE!, {
    auth: { persistSession: false },
  });
  const password = `Test!${Math.random().toString(36).slice(2)}aA1`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;

  const client = createClient<Database>(URL!, ANON!, {
    auth: { persistSession: false },
  });
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error) throw signIn.error;

  return { id: data.user!.id, client };
}

d("Row Level Security", () => {
  beforeAll(async () => {
    const stamp = Date.now();
    const a = await makeUser(`rls-a-${stamp}@example.test`);
    const b = await makeUser(`rls-b-${stamp}@example.test`);

    const { data: walk, error } = await a.client
      .from("walks")
      .insert({ user_id: a.id, visibility: "private" })
      .select("id")
      .single();
    if (error) throw error;

    await a.client.from("walk_points").insert({
      walk_id: walk!.id,
      t: new Date().toISOString(),
      lat: 37.8,
      lng: -122.4,
      accuracy_m: 5,
      altitude_m: null,
      speed_mps: null,
    });

    ctx = {
      aId: a.id,
      bId: b.id,
      aClient: a.client,
      bClient: b.client,
      walkId: walk!.id,
    };
  }, 60_000);

  it("lets the owner read their own GPS points", async () => {
    const { data } = await ctx.aClient
      .from("walk_points")
      .select("*")
      .eq("walk_id", ctx.walkId);
    expect(data?.length).toBeGreaterThan(0);
  });

  it("does NOT let another signed-in user read those points", async () => {
    const { data } = await ctx.bClient
      .from("walk_points")
      .select("*")
      .eq("walk_id", ctx.walkId);
    expect(data ?? []).toHaveLength(0);
  });

  it("does NOT let another user read a private walk", async () => {
    const { data } = await ctx.bClient.from("walks").select("*").eq("id", ctx.walkId);
    expect(data ?? []).toHaveLength(0);
  });

  it("does NOT let a user promote themselves to admin", async () => {
    const { error } = await ctx.bClient
      .from("profiles")
      .update({ role: "admin" })
      .eq("id", ctx.bId);
    expect(error).not.toBeNull();
  });

  it("does NOT let an anonymous client read profiles", async () => {
    const anon = createClient<Database>(URL!, ANON!, {
      auth: { persistSession: false },
    });
    const { data } = await anon.from("profiles").select("*").limit(1);
    expect(data ?? []).toHaveLength(0);
  });

  it("does NOT let a user insert a walk owned by someone else", async () => {
    const { error } = await ctx.bClient
      .from("walks")
      .insert({ user_id: ctx.aId, visibility: "public" });
    expect(error).not.toBeNull();
  });
});
