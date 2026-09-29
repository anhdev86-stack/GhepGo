"use client";

import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";
// Socket.io lives on the same origin as the REST API, namespace /realtime.
const WS_URL = API_URL.replace(/\/api\/?$/, "");

export const WS = {
  DRIVER_LOCATION: "driver:location",
  TRIP_NEW: "trip:new",
  TRIP_UPDATED: "trip:updated",
  GROUP_NEW: "group:new",
  GROUP_UPDATED: "group:updated",
  LOCATION_UPDATE: "location:update",
  SUBSCRIBE_TRIP: "subscribe:trip",
  SUBSCRIBE_GROUP: "subscribe:group",
} as const;

export interface DriverLocation {
  driverId: string;
  lat: number;
  lng: number;
  heading?: number;
  speed?: number;
  updatedAt: number;
}

/** One authenticated socket per page; reconnects automatically. */
export function useRealtime(token: string | null) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!token) return;
    const s = io(`${WS_URL}/realtime`, { auth: { token }, transports: ["websocket", "polling"] });
    // Expose the socket once it is actually usable (also keeps setState out of the effect body).
    s.on("connect", () => {
      setSocket(s);
      setConnected(true);
    });
    s.on("disconnect", () => setConnected(false));
    return () => {
      s.close();
      setSocket(null);
      setConnected(false);
    };
  }, [token]);

  return { socket, connected };
}

/** Subscribe to a socket event for the lifetime of the component. */
export function useSocketEvent<T = unknown>(socket: Socket | null, event: string, handler: (payload: T) => void) {
  const ref = useRef(handler);
  useEffect(() => {
    ref.current = handler;
  });
  useEffect(() => {
    if (!socket) return;
    const fn = (payload: T) => ref.current(payload);
    socket.on(event, fn);
    return () => {
      socket.off(event, fn);
    };
  }, [socket, event]);
}

/**
 * Streams the browser's GPS to the server while `enabled`. Falls back to
 * nothing when geolocation is unavailable (desktop without location).
 */
export function useDriverLocationStream(socket: Socket | null, enabled: boolean) {
  const [lastFix, setLastFix] = useState<{ lat: number; lng: number } | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);

  useEffect(() => {
    if (!socket || !enabled) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      const id = setTimeout(() => setGeoError("Trình duyệt không hỗ trợ định vị"), 0);
      return () => clearTimeout(id);
    }
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const payload = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          heading: pos.coords.heading ?? undefined,
          speed: pos.coords.speed ?? undefined,
        };
        setLastFix({ lat: payload.lat, lng: payload.lng });
        setGeoError(null);
        socket.emit(WS.LOCATION_UPDATE, payload);
      },
      (err) => setGeoError(err.message),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [socket, enabled]);

  return { lastFix, geoError };
}

/** Re-renders every `intervalMs` so "x giây trước" labels stay fresh. */
export function useNow(intervalMs = 5000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function mapsLink(lat: number, lng: number) {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}
