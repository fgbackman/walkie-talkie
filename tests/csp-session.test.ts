import { describe, expect, it } from "vitest";
import { buildCsp, createNonce } from "../src/lib/csp";
import { IDLE_TIMEOUT_S, isIdle, latestAuthAt } from "../src/lib/session";

describe("buildCsp", () => {
  const csp = buildCsp("abc123");
  const directive = (name: string) =>
    csp.split("; ").find((d) => d.startsWith(name + " ")) ?? "";

  it("only runs scripts carrying this request's nonce", () => {
    expect(directive("script-src")).toBe("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(directive("script-src")).not.toContain("unsafe-inline");
    expect(directive("script-src")).not.toContain("unsafe-eval");
  });

  it("allows eval only in development", () => {
    expect(buildCsp("n", { dev: true })).toContain("'unsafe-eval'");
  });

  it("keeps framing, plugins and base-uri locked down", () => {
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
  });
});

describe("createNonce", () => {
  it("is fresh and long enough", () => {
    const a = createNonce();
    expect(a).not.toBe(createNonce());
    expect(Buffer.from(a, "base64")).toHaveLength(16);
  });
});

describe("session helpers", () => {
  it("treats a missing activity stamp as active, and an old one as idle", () => {
    const now = 1_800_000_000;
    expect(isIdle(null, now)).toBe(false);
    expect(isIdle(now - 60, now)).toBe(false);
    expect(isIdle(now - IDLE_TIMEOUT_S - 1, now)).toBe(true);
  });

  it("finds the newest authentication, optionally by method", () => {
    const amr = [
      { method: "oauth", timestamp: 100 },
      { method: "totp", timestamp: 50 },
    ];
    expect(latestAuthAt(amr)).toBe(100);
    expect(latestAuthAt(amr, "totp")).toBe(50);
    expect(latestAuthAt(amr, "password")).toBeNull();
    expect(latestAuthAt(["password"])).toBeNull();
    expect(latestAuthAt(undefined)).toBeNull();
  });
});
