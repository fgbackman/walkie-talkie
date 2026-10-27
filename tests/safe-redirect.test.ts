import { describe, expect, it } from "vitest";
import { safeNext } from "../src/lib/safe-redirect";

describe("safeNext", () => {
  it("keeps same-site paths, with query and hash", () => {
    expect(safeNext("/rooms/abc")).toBe("/rooms/abc");
    expect(safeNext("/admin/users?q=sam#top")).toBe("/admin/users?q=sam#top");
  });

  it("falls back when there is nothing to go to", () => {
    expect(safeNext(null)).toBe("/");
    expect(safeNext(undefined)).toBe("/");
    expect(safeNext("")).toBe("/");
  });

  it.each([
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "\\\\evil.example",
    "javascript:alert(1)",
    "/%0a/evil.example",
    "/\tevil",
    "evil.example",
    " /rooms",
  ])("refuses %j", (raw) => {
    const out = safeNext(raw);
    expect(out.startsWith("/")).toBe(true);
    expect(out.startsWith("//")).toBe(false);
    expect(new URL(out, "https://walkie.example").origin).toBe("https://walkie.example");
  });

  it("returns the fallback, not a cleaned-up guess, for off-site input", () => {
    expect(safeNext("https://evil.example/admin")).toBe("/");
    expect(safeNext("//evil.example/admin", "/me")).toBe("/me");
  });
});
