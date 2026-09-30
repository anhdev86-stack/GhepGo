"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { DEFAULT_CENTER, DEFAULT_TILES, type LatLng } from "@/lib/map";
import type { MapMarker, MapViewProps, MarkerKind } from "./map-view";

const PIN_COLOR: Record<MarkerKind, string> = {
  pickup: "#16a34a",
  dropoff: "#ea580c",
  driver: "#2563eb",
  stop: "#0f766e",
  "stop-done": "#94a3b8",
  me: "#7c3aed",
  trip: "#f59e0b",
  vertex: "#1d4ed8",
};

function iconFor(m: MapMarker): L.DivIcon {
  const color = PIN_COLOR[m.kind];
  if (m.kind === "driver" || m.kind === "me") {
    const rot = m.heading != null && Number.isFinite(m.heading) ? m.heading : 0;
    return L.divIcon({
      className: "gg-marker",
      iconSize: [28, 28],
      iconAnchor: [14, 14],
      html: `<div class="gg-car" style="background:${color};transform:rotate(${rot}deg)"><svg viewBox="0 0 24 24" width="18" height="18" fill="#fff"><path d="M12 2 4 20l8-4 8 4z"/></svg></div>`,
    });
  }
  if (m.kind === "vertex") {
    return L.divIcon({ className: "gg-marker", iconSize: [14, 14], iconAnchor: [7, 7], html: `<div class="gg-dot" style="background:${color}"></div>` });
  }
  const label = m.label ?? (m.kind === "pickup" ? "A" : m.kind === "dropoff" ? "B" : "");
  return L.divIcon({
    className: "gg-marker",
    iconSize: [26, 34],
    iconAnchor: [13, 32],
    popupAnchor: [0, -28],
    html: `<div class="gg-pin" style="background:${color}"><span>${label}</span></div>`,
  });
}

function sameLatLng(a: L.LatLng, b: LatLng) {
  return Math.abs(a.lat - b.lat) < 1e-9 && Math.abs(a.lng - b.lng) < 1e-9;
}

export function MapViewInner({
  center,
  zoom = 13,
  tiles = DEFAULT_TILES,
  markers = [],
  polylines = [],
  polygons = [],
  circles = [],
  fitKey,
  autoFit = true,
  onClick,
  height = 320,
  className = "",
}: MapViewProps) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const tileLayer = useRef<L.TileLayer | null>(null);
  const markerLayer = useRef<Map<string, L.Marker>>(new Map());
  const shapeLayer = useRef<L.LayerGroup | null>(null);
  const fitted = useRef<string | number | null | undefined>(undefined);
  const onClickRef = useRef(onClick);
  useEffect(() => {
    onClickRef.current = onClick;
  });

  // Create / destroy the map.
  useEffect(() => {
    if (!el.current || map.current) return;
    const markersById = markerLayer.current;
    const m = L.map(el.current, { zoomControl: true, attributionControl: true }).setView(
      [center?.lat ?? DEFAULT_CENTER.lat, center?.lng ?? DEFAULT_CENTER.lng],
      zoom,
    );
    m.on("click", (e: L.LeafletMouseEvent) => onClickRef.current?.({ lat: e.latlng.lat, lng: e.latlng.lng }));
    shapeLayer.current = L.layerGroup().addTo(m);
    map.current = m;
    // Leaflet measures the container on creation; when it is inside a flex/grid that lays out later, refresh once.
    const t = setTimeout(() => m.invalidateSize(), 50);
    return () => {
      clearTimeout(t);
      m.remove();
      map.current = null;
      tileLayer.current = null;
      shapeLayer.current = null;
      markersById.clear();
      fitted.current = undefined;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tile layer (swaps when the API reports a different provider).
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    tileLayer.current?.remove();
    tileLayer.current = L.tileLayer(tiles.url, { attribution: tiles.attribution, maxZoom: tiles.maxZoom }).addTo(m);
  }, [tiles.url, tiles.attribution, tiles.maxZoom]);

  // Recentre when the caller moves the centre (e.g. first GPS fix) and nothing has been fitted yet.
  useEffect(() => {
    const m = map.current;
    if (!m || !center || fitted.current !== undefined) return;
    m.setView([center.lat, center.lng], m.getZoom());
  }, [center?.lat, center?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  // Markers: diff by id so live positions move instead of flickering.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const seen = new Set<string>();
    for (const mk of markers) {
      seen.add(mk.id);
      let layer = markerLayer.current.get(mk.id);
      if (!layer) {
        layer = L.marker([mk.lat, mk.lng], { icon: iconFor(mk), draggable: !!mk.draggable, keyboard: false }).addTo(m);
        markerLayer.current.set(mk.id, layer);
      } else {
        if (!sameLatLng(layer.getLatLng(), mk)) layer.setLatLng([mk.lat, mk.lng]);
        layer.setIcon(iconFor(mk));
        if (mk.draggable) layer.dragging?.enable();
        else layer.dragging?.disable();
      }
      layer.off("dragend").off("click");
      if (mk.onDragEnd) {
        const cb = mk.onDragEnd;
        layer.on("dragend", () => {
          const p = layer!.getLatLng();
          cb({ lat: p.lat, lng: p.lng });
        });
      }
      if (mk.onClick) layer.on("click", mk.onClick);
      if (mk.title) layer.bindTooltip(mk.title, { direction: "top", offset: [0, mk.kind === "driver" || mk.kind === "me" ? -12 : -30] });
      else layer.unbindTooltip();
    }
    for (const [id, layer] of markerLayer.current) {
      if (!seen.has(id)) {
        layer.remove();
        markerLayer.current.delete(id);
      }
    }
  }, [markers]);

  // Shapes are cheap: rebuild the group on every change.
  useEffect(() => {
    const g = shapeLayer.current;
    if (!g) return;
    g.clearLayers();
    for (const pg of polygons) {
      const color = pg.color ?? "#2563eb";
      const layer = L.polygon(
        pg.ring.map((p) => [p.lat, p.lng] as [number, number]),
        { color, weight: 2, fillColor: color, fillOpacity: 0.12 },
      );
      if (pg.title) layer.bindTooltip(pg.title, { sticky: true });
      g.addLayer(layer);
    }
    for (const c of circles) {
      const color = c.color ?? "#2563eb";
      const layer = L.circle([c.center.lat, c.center.lng], { radius: c.radiusMeters, color, weight: 1.5, dashArray: "4 4", fillColor: color, fillOpacity: 0.06 });
      if (c.title) layer.bindTooltip(c.title, { sticky: true });
      g.addLayer(layer);
    }
    for (const pl of polylines) {
      if (pl.points.length < 2) continue;
      g.addLayer(
        L.polyline(
          pl.points.map((p) => [p.lat, p.lng] as [number, number]),
          { color: pl.color ?? "#2563eb", weight: pl.weight ?? 4, opacity: 0.85, dashArray: pl.dashed ? "8 8" : undefined, lineJoin: "round" },
        ),
      );
    }
  }, [polylines, polygons, circles]);

  // Fit to overlays: once when they first appear, then whenever fitKey changes.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const pts: [number, number][] = [];
    for (const mk of markers) if (mk.kind !== "vertex" || markers.length > 2) pts.push([mk.lat, mk.lng]);
    for (const pl of polylines) for (const p of pl.points) pts.push([p.lat, p.lng]);
    for (const pg of polygons) for (const p of pg.ring) pts.push([p.lat, p.lng]);
    for (const c of circles) {
      const b = L.latLng(c.center.lat, c.center.lng).toBounds(c.radiusMeters * 2);
      pts.push([b.getNorth(), b.getEast()], [b.getSouth(), b.getWest()]);
    }
    if (pts.length === 0) return;
    const first = fitted.current === undefined && autoFit;
    if (!first && fitted.current === fitKey) return;
    fitted.current = fitKey ?? null;
    if (pts.length === 1) m.setView(pts[0], Math.max(m.getZoom(), 15));
    else m.fitBounds(L.latLngBounds(pts), { padding: [28, 28], maxZoom: 16 });
  }, [fitKey, autoFit, markers, polylines, polygons, circles]);

  // Leaflet owns the inner div's class list; React only ever touches the wrapper.
  return (
    <div className={`w-full rounded-2xl border border-ink-200/70 overflow-hidden z-0 ${className}`} style={{ height }}>
      <div ref={el} className="h-full w-full" />
    </div>
  );
}
