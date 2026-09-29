"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export interface LatLng {
  lat: number;
  lng: number;
}

export interface MapTiles {
  url: string;
  attribution: string;
  maxZoom: number;
}

/** Keyless default so the map renders even before /geo/provider answers. */
export const DEFAULT_TILES: MapTiles = {
  url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  maxZoom: 19,
};

/** Ho Chi Minh City centre — initial view before any data arrives. */
export const DEFAULT_CENTER: LatLng = { lat: 10.7769, lng: 106.7009 };

/**
 * Decodes a Google/OSRM "polyline5" string (what /geo/route and
 * trip.routePolyline carry) into coordinates.
 */
export function decodePolyline(encoded: string, precision = 5): LatLng[] {
  const factor = 10 ** precision;
  const out: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    out.push({ lat: lat / factor, lng: lng / factor });
  }
  return out;
}

/** Route geometry for drawing: decoded polyline, or straight segments through the waypoints. */
export function routePath(polyline: string | null | undefined, waypoints: LatLng[]): { points: LatLng[]; straight: boolean } {
  if (polyline) {
    const pts = decodePolyline(polyline);
    if (pts.length >= 2) return { points: pts, straight: false };
  }
  return { points: waypoints, straight: true };
}

let tilesCache: MapTiles | null = null;
let tilesPromise: Promise<MapTiles> | null = null;

/** Tile layer from the API (MAP_TILE_URL) — fetched once per page load, shared by every map. */
export function useMapTiles(token: string | null): MapTiles {
  const [tiles, setTiles] = useState<MapTiles>(tilesCache ?? DEFAULT_TILES);
  useEffect(() => {
    if (!token || tilesCache) return;
    tilesPromise ??= api
      .geoConfig(token)
      .then((c) => {
        tilesCache = c.tiles?.url ? c.tiles : DEFAULT_TILES;
        return tilesCache;
      })
      .catch(() => DEFAULT_TILES);
    let alive = true;
    tilesPromise.then((t) => alive && setTiles(t));
    return () => {
      alive = false;
    };
  }, [token]);
  return tiles;
}

/** "10.77690, 106.70090" — the fallback label when reverse geocoding finds nothing. */
export function coordLabel(p: LatLng) {
  return `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`;
}
