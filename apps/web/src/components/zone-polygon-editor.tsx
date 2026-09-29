"use client";

import { useMemo, useState } from "react";

type Ring = [number, number][];

/**
 * Parses a polygon typed/pasted by an admin. Accepts GeoJSON (Polygon /
 * Feature / FeatureCollection with one polygon) or one "lat, lng" per line.
 * Returns a [lng, lat] ring or an error.
 */
export function parsePolygonInput(text: string): { ring?: Ring; error?: string } {
  const t = text.trim();
  if (!t) return {};
  if (t.startsWith("{") || t.startsWith("[")) {
    try {
      let g: any = JSON.parse(t);
      if (g.type === "FeatureCollection") g = g.features?.[0];
      if (g?.type === "Feature") g = g.geometry;
      const coords = g?.type === "Polygon" ? g.coordinates?.[0] : Array.isArray(g) ? (Array.isArray(g[0]?.[0]) ? g[0] : g) : null;
      if (!Array.isArray(coords) || coords.length < 3) return { error: "GeoJSON không chứa Polygon hợp lệ" };
      return { ring: coords.map((p: any) => [Number(p[0]), Number(p[1])]) as Ring };
    } catch {
      return { error: "JSON không hợp lệ" };
    }
  }
  const pts: Ring = [];
  for (const line of t.split(/\n|;/)) {
    const s = line.trim();
    if (!s) continue;
    const [a, b] = s.split(/[,\s]+/).map(Number);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return { error: `Dòng không hợp lệ: "${s}"` };
    pts.push([b, a]); // typed as lat, lng
  }
  if (pts.length < 3) return { error: "Cần ít nhất 3 điểm" };
  return { ring: pts };
}

/** Tiny SVG preview so the admin can sanity-check the shape before saving. */
export function PolygonPreview({ ring, size = 160 }: { ring: Ring | null; size?: number }) {
  const path = useMemo(() => {
    if (!ring || ring.length < 3) return null;
    const lngs = ring.map((p) => p[0]);
    const lats = ring.map((p) => p[1]);
    const minX = Math.min(...lngs), maxX = Math.max(...lngs), minY = Math.min(...lats), maxY = Math.max(...lats);
    const scale = (size - 16) / Math.max(maxX - minX, (maxY - minY) * 1.0, 1e-9);
    const pts = ring.map(([lng, lat]) => `${8 + (lng - minX) * scale},${size - 8 - (lat - minY) * scale}`);
    return pts.join(" ");
  }, [ring, size]);
  return (
    <svg width={size} height={size} className="border rounded bg-slate-50">
      {path ? <polygon points={path} fill="#bfdbfe" stroke="#2563eb" strokeWidth={1.5} /> : <text x={8} y={size / 2} fontSize={11} fill="#94a3b8">Chưa có đa giác</text>}
    </svg>
  );
}

export function ZonePolygonEditor({
  initial,
  onSave,
  onClear,
  busy,
}: {
  initial: Ring | null;
  onSave: (ring: Ring) => void;
  onClear?: () => void;
  busy?: boolean;
}) {
  const [text, setText] = useState(initial ? JSON.stringify({ type: "Polygon", coordinates: [initial] }) : "");
  const parsed = useMemo(() => parsePolygonInput(text), [text]);
  const ring = parsed.ring ?? initial;
  return (
    <div className="flex gap-3 items-start text-sm">
      <div className="flex-1 flex flex-col gap-1">
        <textarea
          className="border rounded px-2 py-1 font-mono text-xs h-28"
          placeholder={'Dán GeoJSON Polygon (vẽ tại geojson.io) hoặc mỗi dòng một điểm "lat, lng":\n10.776, 106.690\n10.776, 106.712\n10.792, 106.712'}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        {parsed.error && <p className="text-red-600 text-xs">{parsed.error}</p>}
        {parsed.ring && <p className="text-xs text-slate-500">{parsed.ring.length} điểm</p>}
        <div className="flex gap-2">
          <button type="button" disabled={busy || !parsed.ring} onClick={() => parsed.ring && onSave(parsed.ring)} className="bg-blue-600 text-white rounded px-3 py-1 disabled:opacity-50">
            Lưu đa giác
          </button>
          {onClear && initial && (
            <button type="button" disabled={busy} onClick={onClear} className="text-red-600 underline">
              Xoá đa giác (dùng hình tròn)
            </button>
          )}
          <a href="https://geojson.io" target="_blank" rel="noreferrer" className="text-slate-500 underline ml-auto">vẽ trên geojson.io</a>
        </div>
      </div>
      <PolygonPreview ring={ring} />
    </div>
  );
}
