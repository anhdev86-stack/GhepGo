"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { MapView, type MapMarker, type MapPolyline } from "@/components/map-view";
import { routePath, useMapTiles, type LatLng } from "@/lib/map";
import type { DriverLocation } from "@/lib/realtime";

/**
 * Map for one trip: private (A → B with the stored road polyline) or shared
 * (numbered group stops, road route fetched for the remaining stops). The
 * driver's live position is drawn when known.
 */
export function TripMap({
  token,
  trip,
  group: groupProp,
  driverLocation,
  myLocation,
  height = 260,
}: {
  token: string | null;
  /** A trip (private, or shared with `trip.group`). */
  trip?: any;
  /** A carpool group on its own (driver view). */
  group?: any;
  driverLocation?: DriverLocation | null;
  myLocation?: LatLng | null;
  height?: number;
}) {
  const tiles = useMapTiles(token);
  const group = groupProp ?? trip?.group;
  const fitId = trip?.id ?? group?.id;
  const stops = useMemo<any[]>(() => group?.stops ?? [], [group?.stops]);
  const current = group?.currentStopIndex ?? 0;
  const [groupRoute, setGroupRoute] = useState<{ key: string; polyline?: string } | null>(null);

  // Shared trips have no stored geometry: ask the API for the road route through the remaining stops.
  const routeKey = stops.length ? stops.slice(current).map((s) => `${s.lat},${s.lng}`).join(";") : "";
  useEffect(() => {
    if (!token || !routeKey || routeKey.split(";").length < 2) return;
    let alive = true;
    api
      .routePoints(token, routeKey.split(";").map((s) => ({ lat: Number(s.split(",")[0]), lng: Number(s.split(",")[1]) })))
      .then((r) => alive && setGroupRoute({ key: routeKey, polyline: r.polyline }))
      .catch(() => alive && setGroupRoute({ key: routeKey }));
    return () => {
      alive = false;
    };
  }, [token, routeKey]);

  const markers = useMemo<MapMarker[]>(() => {
    const m: MapMarker[] = [];
    if (stops.length) {
      stops.forEach((s, i) => {
        const mine = !!trip && s.tripId === trip.id;
        m.push({
          id: s.id,
          kind: i < current ? "stop-done" : s.kind === "PICKUP" ? "pickup" : "dropoff",
          lat: s.lat,
          lng: s.lng,
          label: String(i + 1),
          title: `${i + 1}. ${s.kind === "PICKUP" ? "Đón" : "Trả"}${mine ? " (bạn)" : ""} · ${s.address}`,
        });
      });
    } else if (trip) {
      m.push({ id: "pickup", kind: "pickup", lat: trip.pickupLat, lng: trip.pickupLng, title: `Đón: ${trip.pickupAddress}` });
      m.push({ id: "dropoff", kind: "dropoff", lat: trip.dropoffLat, lng: trip.dropoffLng, title: `Trả: ${trip.dropoffAddress}` });
    }
    if (driverLocation) {
      m.push({ id: "driver", kind: "driver", lat: driverLocation.lat, lng: driverLocation.lng, heading: driverLocation.heading, title: "Tài xế" });
    }
    if (myLocation) m.push({ id: "me", kind: "me", lat: myLocation.lat, lng: myLocation.lng, title: "Vị trí của bạn" });
    return m;
  }, [stops, current, trip, driverLocation, myLocation]);

  const polylines = useMemo<MapPolyline[]>(() => {
    if (stops.length) {
      const remaining = stops.slice(current).map((s) => ({ lat: s.lat, lng: s.lng }));
      const done = stops.slice(0, current + 1).map((s) => ({ lat: s.lat, lng: s.lng }));
      const r = routePath(groupRoute?.key === routeKey ? groupRoute.polyline : undefined, remaining);
      const out: MapPolyline[] = [];
      if (done.length >= 2) out.push({ id: "done", points: done, color: "#94a3b8", dashed: true, weight: 3 });
      if (r.points.length >= 2) out.push({ id: "remaining", points: r.points, dashed: r.straight });
      return out;
    }
    if (!trip) return [];
    const r = routePath(trip.routePolyline, [
      { lat: trip.pickupLat, lng: trip.pickupLng },
      { lat: trip.dropoffLat, lng: trip.dropoffLng },
    ]);
    return [{ id: "route", points: r.points, dashed: r.straight }];
  }, [stops, current, groupRoute, routeKey, trip]);

  return <MapView tiles={tiles} markers={markers} polylines={polylines} fitKey={`${fitId}:${current}`} height={height} />;
}
