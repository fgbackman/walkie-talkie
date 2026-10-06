import { describe, expect, it } from "vitest";
import {
  acceptPoint,
  haversine,
  paceSecPerKm,
  splits,
  totalDistance,
  trimEndpoints,
  type Point,
} from "../src/lib/geo";

const p = (t: number, lat: number, lng: number, acc = 5): Point => ({
  t,
  lat,
  lng,
  accuracy: acc,
});

describe("haversine", () => {
  it("matches a known distance", () => {
    // Golden Gate Bridge to Alcatraz, roughly 5.1 km.
    const d = haversine(p(0, 37.8199, -122.4783), p(0, 37.8267, -122.423));
    expect(d).toBeGreaterThan(4800);
    expect(d).toBeLessThan(5400);
  });
});

describe("acceptPoint", () => {
  it("rejects a low-accuracy fix", () => {
    expect(acceptPoint(null, p(0, 37.8, -122.4, 80))).toBe(false);
  });

  it("rejects jitter under the noise floor", () => {
    const a = p(0, 37.8, -122.4);
    const b = p(1000, 37.800001, -122.4);
    expect(acceptPoint(a, b)).toBe(false);
  });

  it("rejects an impossible speed", () => {
    const a = p(0, 37.8, -122.4);
    const b = p(1000, 37.9, -122.4); // ~11 km in one second
    expect(acceptPoint(a, b)).toBe(false);
  });

  it("accepts a normal walking step", () => {
    const a = p(0, 37.8, -122.4);
    const b = p(10_000, 37.8001, -122.4); // ~11 m in 10 s
    expect(acceptPoint(a, b)).toBe(true);
  });
});

describe("totalDistance and splits", () => {
  const track: Point[] = Array.from({ length: 60 }, (_, i) =>
    p(i * 60_000, 37.8 + i * 0.0003, -122.4),
  );

  it("adds up", () => {
    expect(totalDistance(track)).toBeGreaterThan(1000);
  });

  it("produces one split per kilometre", () => {
    const s = splits(track);
    const km = Math.floor(totalDistance(track) / 1000);
    expect(s.length).toBe(km);
    expect(s[0]?.km).toBe(1);
  });
});

describe("paceSecPerKm", () => {
  it("is null for a distance too short to mean anything", () => {
    expect(paceSecPerKm(10, 60)).toBeNull();
  });

  it("computes a sane walking pace", () => {
    expect(paceSecPerKm(1000, 720)).toBe(720);
  });
});

describe("trimEndpoints", () => {
  it("removes the start and end of a route", () => {
    const track: Point[] = Array.from({ length: 100 }, (_, i) =>
      p(i * 10_000, 37.8 + i * 0.0002, -122.4),
    );
    const trimmed = trimEndpoints(track, 300);
    expect(trimmed.length).toBeLessThan(track.length);
    expect(trimmed.length).toBeGreaterThan(0);
    expect(haversine(track[0]!, trimmed[0]!)).toBeGreaterThanOrEqual(290);
  });
});
