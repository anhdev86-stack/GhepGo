"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { MapView, type MapMarker, type MapPolygon } from "@/components/map-view";
import { useMapTiles, type LatLng } from "@/lib/map";

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

/** Open ring (no repeated closing vertex) as map points. */
function ringToVertices(ring: Ring | null | undefined): LatLng[] {
  if (!ring) return [];
  const pts = ring.map(([lng, lat]) => ({ lat, lng }));
  if (pts.length > 1 && pts[0].lat === pts[pts.length - 1].lat && pts[0].lng === pts[pts.length - 1].lng) pts.pop();
  return pts;
}

function verticesToText(v: LatLng[]): string {
  if (v.length === 0) return "";
  const ring: Ring = v.map((p) => [Number(p.lng.toFixed(6)), Number(p.lat.toFixed(6))]);
  ring.push(ring[0]);
  return JSON.stringify({ type: "Polygon", coordinates: [ring] });
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

/**
 * Draw a service area on the map (tap to add a vertex, drag a vertex to move
 * it) or paste GeoJSON / "lat, lng" lines. Both views edit the same text, so
 * what gets saved is always what is shown.
 */
export function ZonePolygonEditor({
  token,
  initial,
  onSave,
  onClear,
  onChange,
  busy,
  center,
  otherZones = [],
}: {
  token: string | null;
  initial: Ring | null;
  /** Save button; omit for a controlled editor that only reports `onChange`. */
  onSave?: (ring: Ring) => void;
  onClear?: () => void;
  /** Called with the current text on every edit (create form). */
  onChange?: (text: string, ring: Ring | null) => void;
  busy?: boolean;
  /** Initial map centre when there is nothing to draw yet. */
  center?: LatLng;
  /** Existing zones shown greyed-out for context. */
  otherZones?: { id: string; name: string; ring: LatLng[] }[];
}) {
  const tiles = useMapTiles(token);
  // Vertices drive the map; the textarea mirrors them once there are enough for a polygon,
  // and typing valid GeoJSON / "lat, lng" lines replaces the vertices.
  const [vertices, setVerticesState] = useState<LatLng[]>(() => ringToVertices(initial));
  const [text, setText] = useState(initial ? JSON.stringify({ type: "Polygon", coordinates: [initial] }) : "");
  const parsed = useMemo(() => parsePolygonInput(text), [text]);

  useEffect(() => {
    onChange?.(text, parsed.ring ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const setVertices = useCallback((v: LatLng[]) => {
    setVerticesState(v);
    setText(v.length >= 3 ? verticesToText(v) : "");
  }, []);

  const onTextChange = useCallback((t: string) => {
    setText(t);
    const r = parsePolygonInput(t).ring;
    if (r) setVerticesState(ringToVertices(r));
    else if (!t.trim()) setVerticesState([]);
  }, []);

  const addVertex = useCallback((p: LatLng) => setVertices([...vertices, p]), [vertices, setVertices]);

  const markers = useMemo<MapMarker[]>(
    () =>
      vertices.map((p, i) => ({
        id: `v${i}`,
        kind: "vertex",
        lat: p.lat,
        lng: p.lng,
        title: `Điểm ${i + 1} (kéo để chỉnh, bấm để xoá)`,
        draggable: true,
        onDragEnd: (np) => setVertices(vertices.map((q, j) => (j === i ? np : q))),
        onClick: () => setVertices(vertices.filter((_, j) => j !== i)),
      })),
    [vertices, setVertices],
  );

  const polygons = useMemo<MapPolygon[]>(() => {
    const out: MapPolygon[] = otherZones.map((z) => ({ id: z.id, ring: z.ring, color: "#94a3b8", title: z.name }));
    if (vertices.length >= 3) out.push({ id: "draft", ring: vertices, color: "#2563eb", title: "Đa giác đang vẽ" });
    return out;
  }, [vertices, otherZones]);

  const polylines = useMemo(() => (vertices.length === 2 ? [{ id: "draft-line", points: vertices, color: "#2563eb", dashed: true }] : []), [vertices]);

  return (
    <div className="flex flex-col gap-2 text-sm">
      <MapView
        tiles={tiles}
        markers={markers}
        polygons={polygons}
        polylines={polylines}
        center={center}
        zoom={12}
        autoFit={!!initial}
        fitKey={initial ? "initial" : undefined}
        onClick={addVertex}
        height={320}
        className="cursor-crosshair"
      />
      <p className="text-xs text-slate-500">
        Chạm bản đồ để thêm đỉnh · kéo đỉnh để chỉnh · bấm đỉnh để xoá · {vertices.length} đỉnh
        {vertices.length > 0 && vertices.length < 3 ? " (cần ít nhất 3)" : ""}
      </p>
      <div className="flex gap-3 items-start">
        <div className="flex-1 flex flex-col gap-1">
          <textarea
            className="border rounded px-2 py-1 font-mono text-xs h-20"
            placeholder={'Hoặc dán GeoJSON Polygon (vẽ tại geojson.io) / mỗi dòng một điểm "lat, lng":\n10.776, 106.690\n10.776, 106.712\n10.792, 106.712'}
            value={text}
            onChange={(e) => onTextChange(e.target.value)}
          />
          {parsed.error && <p className="text-red-600 text-xs">{parsed.error}</p>}
          <div className="flex flex-wrap gap-2 items-center">
            {onSave && (
              <button type="button" disabled={busy || !parsed.ring} onClick={() => parsed.ring && onSave(parsed.ring)} className="bg-blue-600 text-white rounded px-3 py-1 disabled:opacity-50">
                Lưu đa giác
              </button>
            )}
            <button type="button" disabled={busy || vertices.length === 0} onClick={() => setVertices(vertices.slice(0, -1))} className="underline text-slate-600 disabled:opacity-50">
              Bỏ đỉnh cuối
            </button>
            <button type="button" disabled={busy || (!text && vertices.length === 0)} onClick={() => setVertices([])} className="underline text-slate-600 disabled:opacity-50">
              Vẽ lại
            </button>
            {onClear && initial && (
              <button type="button" disabled={busy} onClick={onClear} className="text-red-600 underline">
                Xoá đa giác (dùng hình tròn)
              </button>
            )}
            <a href="https://geojson.io" target="_blank" rel="noreferrer" className="text-slate-500 underline ml-auto">vẽ trên geojson.io</a>
          </div>
        </div>
        <PolygonPreview ring={parsed.ring ?? null} size={96} />
      </div>
    </div>
  );
}
