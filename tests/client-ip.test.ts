import { describe, expect, it, vi } from "vitest";

// ratelimit.ts imports the service-role client; clientIp needs none of it.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: () => ({}) }));

const { clientIp } = await import("../src/lib/ratelimit");

describe("clientIp", () => {
  it("uses the address Netlify's edge recorded", () => {
    expect(clientIp(new Headers({ "x-nf-client-connection-ip": "203.0.113.7" }))).toBe("203.0.113.7");
  });

  it("ignores X-Forwarded-For, which the client controls", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "198.51.100.1, 10.0.0.1" }))).toBe("unknown");
    expect(
      clientIp(
        new Headers({
          "x-forwarded-for": "198.51.100.1",
          "x-nf-client-connection-ip": "203.0.113.7",
        }),
      ),
    ).toBe("203.0.113.7");
  });
});
