import { useEffect, useState } from "react";
import { Redirect, router } from "expo-router";
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Linking } from "react-native";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../contexts/auth-context";
import { useDriverLocationStream, useRealtime, useSocketEvent, WS } from "../lib/realtime";
import { isBackgroundTrackingActive, startBackgroundTracking, stopBackgroundTracking, type BackgroundPermission } from "../lib/background-location";

export default function HomeScreen() {
  const { token, user, isLoading, logout } = useAuth();
  const { socket, connected } = useRealtime(token);
  const [unread, setUnread] = useState(0);

  const [vehicles, setVehicles] = useState<any[]>([]);
  const [available, setAvailable] = useState<any[]>([]);
  const [availableGroups, setAvailableGroups] = useState<any[]>([]);
  const [myGroups, setMyGroups] = useState<any[]>([]);
  const [status, setStatus] = useState<"OFFLINE" | "AVAILABLE" | "ON_TRIP">("OFFLINE");
  const [plateNumber, setPlateNumber] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [hotspots, setHotspots] = useState<any[]>([]);

  const { lastFix, geoError } = useDriverLocationStream(socket, status !== "OFFLINE");
  const [bgState, setBgState] = useState<BackgroundPermission | "off" | "error">("off");

  // Keep OS-level background tracking in sync with the on-duty status,
  // including when the status was changed from another device.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (status === "OFFLINE") {
          await stopBackgroundTracking();
          if (!cancelled) setBgState("off");
        } else if (!(await isBackgroundTrackingActive())) {
          const p = await startBackgroundTracking();
          if (!cancelled) setBgState(p);
        } else if (!cancelled) {
          setBgState("granted");
        }
      } catch {
        if (!cancelled) setBgState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status]);

  const refresh = async () => {
    if (!token) return;
    try {
      const [v, a, ag, mg] = await Promise.all([
        api.myVehicles(token),
        api.availableTrips(token),
        api.availableGroups(token),
        api.myGroups(token),
      ]);
      setVehicles(v);
      setAvailable(a);
      setAvailableGroups(ag);
      setMyGroups(mg);
      api.myHotspots(token, 3).then((r) => setHotspots(r.hotspots ?? [])).catch(() => setHotspots([]));
    } catch {
      // ignore transient polling errors
    }
  };

  useEffect(() => {
    if (!token) return;
    api.driverMe(token).then((d) => setStatus(d.status)).catch(() => {});
    refresh();
    // Realtime events trigger refreshes; the interval is only a fallback.
    const interval = setInterval(refresh, 20000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (!token) return;
    api.unreadCount(token).then((r) => setUnread(r.count)).catch(() => {});
  }, [token]);
  useSocketEvent(socket, WS.NOTIFICATION, () => setUnread((n) => n + 1));
  useSocketEvent(socket, WS.TRIP_NEW, refresh);
  useSocketEvent(socket, WS.TRIP_UPDATED, refresh);
  useSocketEvent(socket, WS.GROUP_NEW, refresh);
  useSocketEvent(socket, WS.GROUP_UPDATED, refresh);

  if (!isLoading && (!user || user.role !== "DRIVER")) {
    return <Redirect href="/login" />;
  }

  const onAddVehicle = async () => {
    if (!token) return;
    setError(null);
    try {
      await api.registerVehicle(token, { plateNumber, make, model });
      setPlateNumber("");
      setMake("");
      setModel("");
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Có lỗi xảy ra");
    }
  };

  const toggleStatus = async () => {
    if (!token) return;
    const nextStatus = status === "OFFLINE" ? "AVAILABLE" : "OFFLINE";
    try {
      await api.updateDriverStatus(token, nextStatus);
      setStatus(nextStatus);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Có lỗi xảy ra");
    }
  };

  const acceptTrip = async (tripId: string) => {
    if (!token) return;
    try {
      await api.acceptTrip(token, tripId);
      router.push({ pathname: "/trip/[id]", params: { id: tripId } });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Có lỗi xảy ra");
    }
  };

  const acceptGroup = async (groupId: string) => {
    if (!token) return;
    try {
      await api.acceptGroup(token, groupId);
      router.push({ pathname: "/group/[id]", params: { id: groupId } });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Có lỗi xảy ra");
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  return (
    <FlatList
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      ListHeaderComponent={
        <View style={{ gap: 16 }}>
          <View style={styles.card}>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text>
                  Trạng thái:{" "}
                  {status === "AVAILABLE" ? "Đang trực" : status === "ON_TRIP" ? "Đang chạy chuyến" : "Ngoại tuyến"}
                </Text>
                <Text style={styles.muted}>
                  {connected ? "Realtime: kết nối" : "Realtime: mất kết nối"} ·{" "}
                  {status === "OFFLINE"
                    ? "GPS tắt"
                    : lastFix
                      ? `GPS ${lastFix.lat.toFixed(4)}, ${lastFix.lng.toFixed(4)}`
                      : geoError ?? "Đang lấy GPS..."}
                </Text>
                {status !== "OFFLINE" && (
                  <Text style={[styles.muted, bgState !== "granted" && { color: "#c2410c" }]}>
                    {bgState === "granted"
                      ? "GPS nền: đang chạy (vẫn gửi vị trí khi tắt màn hình)"
                      : bgState === "foreground_only"
                        ? 'GPS nền: chưa cấp quyền "Luôn cho phép" — chỉ gửi vị trí khi mở app'
                        : bgState === "denied"
                          ? "GPS nền: bị từ chối quyền vị trí"
                          : bgState === "error"
                            ? "GPS nền: không khả dụng (cần development build, không chạy trên Expo Go)"
                            : "GPS nền: đang bật..."}
                  </Text>
                )}
              </View>
              <Pressable
                onPress={toggleStatus}
                disabled={status === "ON_TRIP"}
                style={[
                  styles.smallButton,
                  { backgroundColor: status === "OFFLINE" ? "#0b8c75" : "#667092", opacity: status === "ON_TRIP" ? 0.5 : 1 },
                ]}
              >
                <Text style={styles.buttonText}>{status === "OFFLINE" ? "Bắt đầu trực" : "Ngừng trực"}</Text>
              </Pressable>
            </View>
          </View>

          {status !== "OFFLINE" && myGroups.length === 0 && hotspots.length > 0 && (
            <View style={[styles.card, { borderColor: "#fde68a", backgroundColor: "#fffbeb" }]}>
              <Text style={styles.sectionTitle}>Điểm đông khách giờ này</Text>
              {hotspots.map((h, i) => (
                <Pressable
                  key={h.key}
                  style={styles.row}
                  onPress={() => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${h.lat},${h.lng}`)}
                >
                  <Text style={styles.itemText}>
                    {i + 1}. {h.distanceMeters != null ? `${(h.distanceMeters / 1000).toFixed(1)} km` : "—"} · {h.expectedRequests} yêu cầu/giờ
                    {h.undersupplied ? " · thiếu xe" : ""}
                  </Text>
                  <Text style={{ color: "#0b8c75", fontWeight: "600" }}>Chỉ đường</Text>
                </Pressable>
              ))}
              <Text style={styles.muted}>Ước lượng từ lịch sử đặt xe cùng khung giờ, xếp theo gần bạn.</Text>
            </View>
          )}

          {myGroups.length > 0 && (
            <View>
              <Text style={styles.sectionTitle}>Chuyến ghép đang thực hiện</Text>
              {myGroups.map((g) => (
                <Pressable
                  key={g.id}
                  style={styles.card}
                  onPress={() => router.push({ pathname: "/group/[id]", params: { id: g.id } })}
                >
                  <Text style={styles.itemText}>
                    {g.trips.length} khách · điểm dừng {g.currentStopIndex + 1}/{g.stops.length}
                  </Text>
                  <Text style={styles.muted}>
                    Tiếp theo: {g.stops[g.currentStopIndex]?.kind === "PICKUP" ? "Đón" : "Trả"} ·{" "}
                    {g.stops[g.currentStopIndex]?.address ?? "—"}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}

          {availableGroups.length > 0 && (
            <View>
              <Text style={styles.sectionTitle}>Nhóm xe ghép chờ tài xế</Text>
              {availableGroups.map((g) => (
                <View key={g.id} style={styles.card}>
                  <Text style={styles.itemText}>
                    {g.trips.length} khách · {g.seatsUsed} ghế · {((g.totalDistanceMeters ?? 0) / 1000).toFixed(1)} km ·{" "}
                    {g.trips.reduce((s: number, t: any) => s + Number(t.fare), 0).toLocaleString("vi-VN")} đ
                  </Text>
                  {g.stops.map((s: any, i: number) => (
                    <Text key={s.id} style={styles.muted}>
                      {i + 1}. {s.kind === "PICKUP" ? "Đón" : "Trả"} · {s.address}
                    </Text>
                  ))}
                  <Pressable style={[styles.button, { marginTop: 8 }]} onPress={() => acceptGroup(g.id)}>
                    <Text style={styles.buttonText}>Nhận nhóm chuyến</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          )}

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Xe của tôi</Text>
            {vehicles.length === 0 && <Text style={styles.muted}>Chưa có xe nào</Text>}
            {vehicles.map((v) => (
              <Text key={v.id} style={styles.itemText}>
                {v.plateNumber} — {v.make} {v.model}
              </Text>
            ))}

            <View style={{ gap: 8, marginTop: 8 }}>
              <TextInput
                style={styles.input}
                placeholder="Biển số"
                value={plateNumber}
                onChangeText={setPlateNumber}
              />
              <TextInput
                style={styles.input}
                placeholder="Hãng xe"
                value={make}
                onChangeText={setMake}
              />
              <TextInput
                style={styles.input}
                placeholder="Dòng xe"
                value={model}
                onChangeText={setModel}
              />
              <Pressable style={styles.button} onPress={onAddVehicle}>
                <Text style={styles.buttonText}>Thêm xe</Text>
              </Pressable>
            </View>
          </View>

          {error && <Text style={styles.error}>{error}</Text>}

          <Text style={styles.sectionTitle}>Chuyến bao xe khả dụng</Text>
          {available.length === 0 && (
            <Text style={styles.muted}>Không có chuyến nào đang chờ</Text>
          )}
        </View>
      }
      data={available}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <View style={styles.card}>
          <Text style={styles.itemText}>
            {item.pickupAddress} → {item.dropoffAddress}
          </Text>
          <Text style={styles.muted}>
            {(item.distanceMeters / 1000).toFixed(1)} km —{" "}
            {Number(item.fare).toLocaleString("vi-VN")} đ
          </Text>
          <Pressable style={[styles.button, { marginTop: 8 }]} onPress={() => acceptTrip(item.id)}>
            <Text style={styles.buttonText}>Nhận chuyến</Text>
          </Pressable>
        </View>
      )}
      ListFooterComponent={
        <View>
          <Pressable style={[styles.button, { marginTop: 8, backgroundColor: "#0d594d" }]} onPress={() => router.push("/earnings")}>
            <Text style={styles.buttonText}>Thu nhập & rút tiền</Text>
          </Pressable>
          <Pressable
            style={[styles.button, { marginTop: 8, backgroundColor: "#4d5678" }]}
            onPress={() => {
              setUnread(0);
              router.push("/notifications");
            }}
          >
            <Text style={styles.buttonText}>Thông báo{unread > 0 ? ` (${unread} mới)` : ""}</Text>
          </Pressable>
          <Pressable style={[styles.button, { marginTop: 8, backgroundColor: "#667092" }]} onPress={() => router.push("/complaints")}>
            <Text style={styles.buttonText}>Khiếu nại & hỗ trợ</Text>
          </Pressable>
          <Pressable onPress={logout} style={{ marginTop: 16 }}>
          <Text style={{ color: "#dc2626", textAlign: "center" }}>Đăng xuất</Text>
          </Pressable>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    gap: 12,
    backgroundColor: "#f6f7fb",
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#d9dde8",
    padding: 14,
    marginBottom: 12,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sectionTitle: {
    fontWeight: "600",
    fontSize: 15,
    marginBottom: 6,
  },
  itemText: {
    fontSize: 14,
  },
  muted: {
    color: "#667092",
    fontSize: 13,
  },
  input: {
    borderWidth: 1,
    borderColor: "#d9dde8",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  button: {
    backgroundColor: "#0b8c75",
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: "center",
  },
  smallButton: {
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  buttonText: {
    color: "#fff",
    fontWeight: "600",
  },
  error: {
    color: "#dc2626",
    fontSize: 13,
  },
});
