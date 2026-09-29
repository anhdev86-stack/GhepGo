"use client";

import dynamic from "next/dynamic";
import type { LatLng, MapTiles } from "@/lib/map";

export type MarkerKind = "pickup" | "dropoff" | "driver" | "stop" | "stop-done" | "me" | "trip" | "vertex";

export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  kind: MarkerKind;
  /** Short text inside the pin (stop number, initials). */
  label?: string;
  /** Tooltip / popup text. */
  title?: string;
  /** Degrees clockwise from north — rotates the driver arrow. */
  heading?: number;
  draggable?: boolean;
  onDragEnd?: (p: LatLng) => void;
  onClick?: () => void;
}

export interface MapPolyline {
  id: string;
  points: LatLng[];
  color?: string;
  dashed?: boolean;
  weight?: number;
}

export interface MapPolygon {
  id: string;
  ring: LatLng[];
  color?: string;
  title?: string;
}

export interface MapCircle {
  id: string;
  center: LatLng;
  radiusMeters: number;
  color?: string;
  title?: string;
}

export interface MapViewProps {
  center?: LatLng;
  zoom?: number;
  tiles?: MapTiles;
  markers?: MapMarker[];
  polylines?: MapPolyline[];
  polygons?: MapPolygon[];
  circles?: MapCircle[];
  /** Change this value to re-fit the view to every overlay (e.g. when the trip changes). */
  fitKey?: string | number;
  /** Fit once when overlays first appear, even without a fitKey change. Default true. */
  autoFit?: boolean;
  onClick?: (p: LatLng) => void;
  height?: number | string;
  className?: string;
}

/**
 * Leaflet map, loaded client-side only (Leaflet touches `window` at import).
 * Overlays are plain data props so pages never deal with Leaflet objects.
 */
export const MapView = dynamic(() => import("./map-view-inner").then((m) => m.MapViewInner), {
  ssr: false,
  loading: () => <div className="w-full rounded-2xl border border-ink-200/70 bg-ink-100 animate-pulse" style={{ height: 320 }} />,
});
