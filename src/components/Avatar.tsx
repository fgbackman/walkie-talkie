const PALETTE = [
  "#d8a0a0", "#9fc0b4", "#e7c27d", "#c9b6dd",
  "#b7c79a", "#e2ae96", "#a8beda", "#ddc9a3",
];

function hue(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length]!;
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "??";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
}

export default function Avatar({
  name,
  src,
  size = 40,
  id,
}: {
  name: string;
  src?: string | null;
  size?: number;
  id?: string;
}) {
  const bg = hue(id ?? name);
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        className="rounded-full object-cover shrink-0"
        style={{ width: size, height: size }}
        referrerPolicy="no-referrer"
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className="rounded-full grid place-items-center shrink-0"
      style={{
        width: size,
        height: size,
        background: bg,
        color: "#20180c",
        fontFamily: "var(--font-display)",
        fontWeight: 700,
        fontSize: size * 0.36,
      }}
    >
      {initials(name)}
    </span>
  );
}
