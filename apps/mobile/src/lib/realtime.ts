import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import * as Location from "expo-location";

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3001/api";
const WS_URL = BASE_URL.replace(/\/api\/?$/, "");

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

export function useRealtime(token: string | null) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!token) return;
    const s = io(`${WS_URL}/realtime`, { auth: { token }, transports: ["websocket"] });
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

export function useSocketEvent<T = unknown>(
  socket: Socket | null,
  event: string,
  handler: (payload: T) => void,
) {
  const ref = useRef(handler);
  ref.current = handler;
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
 * Streams device GPS to the server every few seconds / ~20 m while enabled.
 * Foreground only for now; background tracking needs a config plugin and
 * store permissions and is left for a later phase.
 */
export function useDriverLocationStream(socket: Socket | null, enabled: boolean) {
  const [lastFix, setLastFix] = useState<{ lat: number; lng: number } | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);

  useEffect(() => {
    if (!socket || !enabled) return;
    let sub: Location.LocationSubscription | null = null;
    let cancelled = false;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setGeoError("Chưa cấp quyền định vị");
        return;
      }
      if (cancelled) return;
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 4000, distanceInterval: 20 },
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
      );
    })().catch((err) => setGeoError(String(err?.message ?? err)));

    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [socket, enabled]);

  return { lastFix, geoError };
}
