/**
 * Geo maths, shared by the live tracker and the server-side recompute.
 * Pure functions, no DOM — so they are unit-testable and run in both places.
 */

export type Point = {
  t: number; // epoch ms
  lat: number;
  lng: number;
  accuracy?: number | null;
  altitude?: number | null;
  speed?: number | null;
};

const R = 6_371_000; // metres

export function haversine(a: Point, b: Point): number {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * GPS noise makes a stationary phone "walk" several hundred metres an hour.
 * Drop a fix when it is less accurate than 35 m, or when accepting it would
 * imply a speed no walker reaches (> 25 km/h over the segment).
 */
export function acceptPoint(prev: Point | null, next: Point): boolean {
  if (next.accuracy != null && next.accuracy > 35) return false;
  if (!prev) return true;
  const dt = (next.t - prev.t) / 1000;
  if (dt <= 0) return false;
  const d = haversine(prev, next);
  if (d < 2) return false; // inside the noise floor
  return d / dt <= 7; // ~25 km/h
}

export function totalDistance(points: readonly Point[]): number {
  let m = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (a && b) m += haversine(a, b);
  }
  return m;
}

export function elevationGain(points: readonly Point[]): number {
  let gain = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]?.altitude;
    const b = points[i]?.altitude;
    if (a != null && b != null && b > a) gain += b - a;
  }
  return gain;
}

/** Per-kilometre splits in seconds, derived from the accepted track. */
export function splits(points: readonly Point[]): { km: number; durationS: number }[] {
  const out: { km: number; durationS: number }[] = [];
  let acc = 0;
  let nextKm = 1000;
  const start = points[0]?.t;
  if (start == null) return out;
  let lastT = start;

  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (!a || !b) continue;
    acc += haversine(a, b);
    while (acc >= nextKm) {
      out.push({ km: out.length + 1, durationS: Math.round((b.t - lastT) / 1000) });
      lastT = b.t;
      nextKm += 1000;
    }
  }
  return out;
}

export function paceSecPerKm(distanceM: number, durationS: number): number | null {
  if (distanceM < 50) return null;
  return Math.round(durationS / (distanceM / 1000));
}

export function formatPace(secPerKm: number | null): string {
  if (secPerKm == null) return "—";
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function formatDuration(totalS: number): string {
  const s = Math.max(0, Math.floor(totalS));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h
    ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
    : `${m}:${String(sec).padStart(2, "0")}`;
}

/**
 * Privacy: hide the first and last `radiusM` of a route before anyone else
 * sees it, so a shared walk doesn't advertise a front door.
 */
export function trimEndpoints(points: readonly Point[], radiusM = 300): Point[] {
  if (points.length < 4) return [];
  const first = points[0]!;
  const last = points[points.length - 1]!;
  let s = 0;
  let e = points.length - 1;
  while (s < points.length && haversine(first, points[s]!) < radiusM) s++;
  while (e > s && haversine(last, points[e]!) < radiusM) e--;
  return points.slice(s, e + 1);
}

/** Project lat/lng onto a 0..1 box for the SVG route drawing. */
export function toViewBox(points: readonly Point[], w: number, h: number, pad = 12) {
  if (points.length === 0) return [] as { x: number; y: number }[];
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const spanLat = Math.max(maxLat - minLat, 1e-5);
  const spanLng = Math.max(maxLng - minLng, 1e-5);
  const scale = Math.min((w - pad * 2) / spanLng, (h - pad * 2) / spanLat);
  const offX = (w - spanLng * scale) / 2;
  const offY = (h - spanLat * scale) / 2;
  return points.map((p) => ({
    x: offX + (p.lng - minLng) * scale,
    y: h - (offY + (p.lat - minLat) * scale),
  }));
}

export function pathFrom(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return "";
  return pts
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");
}
