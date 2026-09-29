import { useEffect, useState } from "react";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { api, ApiError } from "../../lib/api";
import { useAuth } from "../../contexts/auth-context";

const STATUS_LABEL: Record<string, string> = {
  REQUESTED: "Đang tìm tài xế",
  ASSIGNED: "Đã phân công",
  ACCEPTED: "Đã nhận",
  EN_ROUTE_TO_PICKUP: "Đang tới điểm đón",
  IN_PROGRESS: "Đang di chuyển",
  COMPLETED: "Hoàn thành",
  CANCELLED: "Đã huỷ",
};

const NEXT_ACTION: Record<string, { next: string; label: string }> = {
  ACCEPTED: { next: "EN_ROUTE_TO_PICKUP", label: "Bắt đầu tới điểm đón" },
  EN_ROUTE_TO_PICKUP: { next: "IN_PROGRESS", label: "Đã đón khách, bắt đầu chuyến" },
  IN_PROGRESS: { next: "COMPLETED", label: "Hoàn thành chuyến" },
};

export default function TripDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { token, user, isLoading } = useAuth();
  const [trip, setTrip] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!token || !id) return;
    try {
      const t = await api.tripById(token, id);
      setTrip(t);
    } catch {
      // ignore transient polling errors
    }
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 4000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, id]);

  if (!isLoading && (!user || user.role !== "DRIVER")) {
    return <Redirect href="/login" />;
  }

  if (!trip) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  const advance = async () => {
    if (!token || !id) return;
    const action = NEXT_ACTION[trip.status];
    if (!action) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await api.updateTripStatus(token, id, action.next);
      setTrip(updated);
      if (updated.status === "COMPLETED") {
        await load();
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Có lỗi xảy ra");
    } finally {
      setBusy(false);
    }
  };

  const action = NEXT_ACTION[trip.status];

  return (
    <View style={styles.container}>
      <Text style={styles.status}>{STATUS_LABEL[trip.status] ?? trip.status}</Text>

      <View style={styles.card}>
        <Text style={styles.label}>Điểm đón</Text>
        <Text style={styles.value}>{trip.pickupAddress}</Text>
        <Text style={styles.label}>Điểm trả</Text>
        <Text style={styles.value}>{trip.dropoffAddress}</Text>
        <Text style={styles.label}>Khách hàng</Text>
        <Text style={styles.value}>{trip.customer?.fullName ?? "-"}</Text>
        <Text style={styles.label}>Giá cước</Text>
        <Text style={styles.value}>{Number(trip.fare).toLocaleString("vi-VN")} đ</Text>
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      {action && (
        <Pressable style={styles.button} onPress={advance} disabled={busy}>
          <Text style={styles.buttonText}>{busy ? "Đang xử lý..." : action.label}</Text>
        </Pressable>
      )}

      {trip.status === "COMPLETED" && trip.payment?.method === "CASH" && trip.payment?.status === "PENDING" && (
        <Pressable
          style={[styles.button, { backgroundColor: "#f97316" }]}
          disabled={busy}
          onPress={async () => {
            if (!token) return;
            setBusy(true);
            try {
              await api.confirmCash(token, trip.id);
              router.replace("/home");
            } catch (err) {
              setError(err instanceof ApiError ? err.message : "Có lỗi xảy ra");
            } finally {
              setBusy(false);
            }
          }}
        >
          <Text style={styles.buttonText}>Đã thu tiền mặt {Number(trip.fare).toLocaleString("vi-VN")} đ</Text>
        </Pressable>
      )}
      {["COMPLETED", "CANCELLED", "IN_PROGRESS"].includes(trip.status) && (
        <Pressable onPress={() => router.push({ pathname: "/complaints", params: { tripId: trip.id } })}>
          <Text style={{ color: "#64748b", textAlign: "center", textDecorationLine: "underline" }}>Báo cáo sự cố / khiếu nại</Text>
        </Pressable>
      )}
      {trip.status === "COMPLETED" && trip.payment?.status === "PAID" && (
        <Pressable style={[styles.button, { backgroundColor: "#64748b" }]} onPress={() => router.replace("/home")}>
          <Text style={styles.buttonText}>Về trang chính</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    gap: 12,
    backgroundColor: "#f8fafc",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  status: {
    fontSize: 18,
    fontWeight: "700",
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 14,
    gap: 4,
  },
  label: {
    color: "#64748b",
    fontSize: 12,
    marginTop: 6,
  },
  value: {
    fontSize: 15,
  },
  button: {
    backgroundColor: "#16a34a",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
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
