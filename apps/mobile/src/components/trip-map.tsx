import { useEffect, useMemo, useRef } from "react";
import { StyleSheet, Text, View } from "react-native";
import MapView, { Marker, Polyline } from "react-native-maps";
import type { LatLng } from "../lib/map";

export interface MapPin {
  id: string;
  lat: number;
  lng: number;
  kind: "pickup" | "dropoff" | "done";
  label?: string;
  title?: string;
  description?: string;
}

const PIN_COLOR = { pickup: "#16a34a", dropoff: "#ea580c", done: "#8d97b0" } as const;

/**
 * Route map for the driver app: pins (A/B or numbered stops), the road
 * polyline and the device's own position (native blue dot). Fits to the
 * overlays whenever `fitKey` changes.
 */
export function TripMap({
  pins,
  route,
  straight,
  fitKey,
  height = 240,
}: {
  pins: MapPin[];
  route: LatLng[];
  /** Route is a straight-line estimate (map provider unavailable) — drawn dashed. */
  straight?: boolean;
  fitKey: string;
  height?: number;
}) {
  const ref = useRef<MapView>(null);
  const coords = useMemo(
    () => [...pins.map((p) => ({ latitude: p.lat, longitude: p.lng })), ...route.map((p) => ({ latitude: p.lat, longitude: p.lng }))],
    [pins, route],
  );
  const first = coords[0];

  useEffect(() => {
    if (coords.length === 0) return;
    // Give the native view a frame to lay out before fitting.
    const t = setTimeout(() => {
      ref.current?.fitToCoordinates(coords, { edgePadding: { top: 48, right: 40, bottom: 48, left: 40 }, animated: true });
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey]);

  return (
    <View style={[styles.wrap, { height }]}>
      <MapView
        ref={ref}
        style={StyleSheet.absoluteFill}
        showsUserLocation
        showsMyLocationButton
        initialRegion={{
          latitude: first?.latitude ?? 10.7769,
          longitude: first?.longitude ?? 106.7009,
          latitudeDelta: 0.06,
          longitudeDelta: 0.06,
        }}
      >
        {route.length >= 2 && (
          <Polyline
            coordinates={route.map((p) => ({ latitude: p.lat, longitude: p.lng }))}
            strokeColor="#0b8c75"
            strokeWidth={4}
            lineDashPattern={straight ? [8, 8] : undefined}
          />
        )}
        {pins.map((p) => (
          <Marker key={p.id} coordinate={{ latitude: p.lat, longitude: p.lng }} title={p.title} description={p.description} anchor={{ x: 0.5, y: 1 }}>
            <View style={styles.pinWrap}>
              <View style={[styles.pin, { backgroundColor: PIN_COLOR[p.kind] }]}>
                <Text style={styles.pinText}>{p.label ?? (p.kind === "pickup" ? "A" : p.kind === "dropoff" ? "B" : "")}</Text>
              </View>
              <View style={[styles.pinTip, { borderTopColor: PIN_COLOR[p.kind] }]} />
            </View>
          </Marker>
        ))}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: 16, overflow: "hidden", borderWidth: 1, borderColor: "#d9dde8", backgroundColor: "#d9dde8" },
  pinWrap: { alignItems: "center" },
  pin: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
  pinText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  pinTip: { width: 0, height: 0, borderLeftWidth: 5, borderRightWidth: 5, borderTopWidth: 7, borderLeftColor: "transparent", borderRightColor: "transparent", marginTop: -1 },
});
