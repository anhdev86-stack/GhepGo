import { useCallback, useEffect, useMemo, useState } from "react";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { api, ApiError } from "../../lib/api";
import { useAuth } from "../../contexts/auth-context";
import { useRealtime, useSocketEvent, WS } from "../../lib/realtime";
import { TripMap, type MapPin } from "../../components/trip-map";
import { routePath, type LatLng } from "../../lib/map";

const GROUP_LABEL: Record<string, string> = {
  MATCHING: "Đang ghép khách",
  ASSIGNED: "Đã nhận, chuẩn bị đón",
  IN_PROGRESS: "Đang chạy",
  COMPLETED: "Hoàn thành",
  CANCELLED: "Đã huỷ",
};

export default function GroupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { token, user, isLoading } = useAuth();
  const { socket } = useRealtime(token);
  const [group, setGroup] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [groupRoute, setGroupRoute] = useState<{ key: string; polyline?: string } | null>(null);

  // Road route through the stops still ahead; refetched whenever the next stop changes.
  const remaining: LatLng[] = useMemo(
    () => (group ? group.stops.slice(group.currentStopIndex).map((s: any) => ({ lat: s.lat, lng: s.lng })) : []),
    [group],
  );
  const routeKey = remaining.map((p) => `${p.lat},${p.lng}`).join(";");
  useEffect(() => {
    if (!token || remaining.length < 2) return;
    let alive = true;
    api
      .routePoints(token, remaining)
      .then((r) => alive && setGroupRoute({ key: routeKey, polyline: r.polyline }))
      .catch(() => alive && setGroupRoute({ key: routeKey }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, routeKey]);
  const route = useMemo(() => routePath(groupRoute?.key === routeKey ? groupRoute.polyline : undefined, remaining), [groupRoute, routeKey, remaining]);
  const pins = useMemo<MapPin[]>(
    () =>
      group
        ? group.stops.map((s: any, i: number) => ({
            id: s.id,
            kind: i < group.currentStopIndex ? "done" : s.kind === "PICKUP" ? "pickup" : "dropoff",
            lat: s.lat,
            lng: s.lng,
            label: String(i + 1),
            title: `${i + 1}. ${s.kind === "PICKUP" ? "Đón" : "Trả"}`,
            description: s.address,
          }))
        : [],
    [group],
  );

  const load = useCallback(async () => {
    if (!token || !id) return;
    try {
      const groups = await api.myGroups(token);
      const g = groups.find((x) => x.id === id);
      if (g) setGroup(g);
      else if (group) router.replace("/home");
    } catch {
      // ignore transient errors
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, id]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 20000);
    return () => clearInterval(interval);
  }, [load]);

  useEffect(() => {
    if (socket && id) socket.emit(WS.SUBSCRIBE_GROUP, { groupId: id });
  }, [socket, id]);
  useSocketEvent(socket, WS.GROUP_UPDATED, load);
  useSocketEvent(socket, WS.TRIP_UPDATED, load);

  if (!isLoading && (!user || user.role !== "DRIVER")) {
    return <Redirect href="/login" />;
  }

  if (!group) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  const nextStop = group.stops[group.currentStopIndex];
  const customerOf = (tripId: string) => group.trips.find((t: any) => t.id === tripId)?.customer?.fullName ?? "";

  const advance = async () => {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await api.advanceGroup(token, group.id);
      setGroup(updated);
      if (updated.status === "COMPLETED") router.replace("/home");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Có lỗi xảy ra");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.status}>{GROUP_LABEL[group.status] ?? group.status}</Text>
      <Text style={styles.muted}>
        {group.trips.length} khách · {group.seatsUsed} ghế · {((group.totalDistanceMeters ?? 0) / 1000).toFixed(1)} km ·{" "}
        {group.trips.reduce((s: number, t: any) => s + Number(t.fare), 0).toLocaleString("vi-VN")} đ
      </Text>

      <TripMap pins={pins} route={route.points} straight={route.straight} fitKey={`${group.id}:${group.currentStopIndex}`} height={260} />

      <View style={styles.card}>
        {group.stops.map((s: any, i: number) => {
          const done = i < group.currentStopIndex;
          const current = i === group.currentStopIndex;
          return (
            <View key={s.id} style={[styles.stopRow, current && styles.stopCurrent]}>
              <Text style={[styles.stopIndex, done && styles.done]}>{i + 1}</Text>
              <View style={[styles.badge, { backgroundColor: s.kind === "PICKUP" ? "#dcfce7" : "#ffedd5" }]}>
                <Text style={{ color: s.kind === "PICKUP" ? "#15803d" : "#c2410c", fontSize: 11 }}>
                  {s.kind === "PICKUP" ? "Đón" : "Trả"}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.stopAddress, done && styles.done]}>{s.address}</Text>
                <Text style={styles.muted}>{customerOf(s.tripId)}</Text>
              </View>
            </View>
          );
        })}
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      {nextStop && (
        <Pressable style={styles.button} onPress={advance} disabled={busy}>
          <Text style={styles.buttonText}>
            {busy ? "Đang xử lý..." : `${nextStop.kind === "PICKUP" ? "Đã đón" : "Đã trả"} khách tại điểm ${group.currentStopIndex + 1}`}
          </Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 12, backgroundColor: "#f8fafc" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  status: { fontSize: 18, fontWeight: "700" },
  muted: { color: "#64748b", fontSize: 13 },
  card: { backgroundColor: "#fff", borderRadius: 10, borderWidth: 1, borderColor: "#e2e8f0", padding: 8 },
  stopRow: { flexDirection: "row", alignItems: "center", gap: 8, padding: 8, borderRadius: 8 },
  stopCurrent: { backgroundColor: "#eff6ff" },
  stopIndex: { width: 20, textAlign: "right", fontWeight: "600" },
  badge: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  stopAddress: { fontSize: 14 },
  done: { color: "#94a3b8", textDecorationLine: "line-through" },
  button: { backgroundColor: "#16a34a", borderRadius: 8, paddingVertical: 12, alignItems: "center" },
  buttonText: { color: "#fff", fontWeight: "600" },
  error: { color: "#dc2626", fontSize: 13 },
});
