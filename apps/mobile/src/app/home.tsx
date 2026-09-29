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
import { api, ApiError } from "../lib/api";
import { useAuth } from "../contexts/auth-context";

export default function HomeScreen() {
  const { token, user, isLoading, logout } = useAuth();

  const [vehicles, setVehicles] = useState<any[]>([]);
  const [available, setAvailable] = useState<any[]>([]);
  const [status, setStatus] = useState<"OFFLINE" | "AVAILABLE">("OFFLINE");
  const [plateNumber, setPlateNumber] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = async () => {
    if (!token) return;
    try {
      const [v, a] = await Promise.all([api.myVehicles(token), api.availableTrips(token)]);
      setVehicles(v);
      setAvailable(a);
    } catch {
      // ignore transient polling errors
    }
  };

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 4000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

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
    const nextStatus = status === "AVAILABLE" ? "OFFLINE" : "AVAILABLE";
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
              <Text>Trạng thái: {status === "AVAILABLE" ? "Đang trực" : "Ngoại tuyến"}</Text>
              <Pressable
                onPress={toggleStatus}
                style={[styles.smallButton, { backgroundColor: status === "AVAILABLE" ? "#64748b" : "#16a34a" }]}
              >
                <Text style={styles.buttonText}>
                  {status === "AVAILABLE" ? "Ngừng trực" : "Bắt đầu trực"}
                </Text>
              </Pressable>
            </View>
          </View>

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

          <Text style={styles.sectionTitle}>Chuyến khả dụng</Text>
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
        <Pressable onPress={logout} style={{ marginTop: 16 }}>
          <Text style={{ color: "#dc2626", textAlign: "center" }}>Đăng xuất</Text>
        </Pressable>
      }
    />
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    gap: 12,
    backgroundColor: "#f8fafc",
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
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
    color: "#64748b",
    fontSize: 13,
  },
  input: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  button: {
    backgroundColor: "#2563eb",
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
  },
  smallButton: {
    borderRadius: 6,
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
