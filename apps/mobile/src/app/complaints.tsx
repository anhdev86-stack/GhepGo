import { useCallback, useEffect, useState } from "react";
import { Redirect, useLocalSearchParams } from "expo-router";
import { FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../contexts/auth-context";

const CATEGORY_LABEL: Record<string, string> = {
  CUSTOMER_BEHAVIOR: "Thái độ khách hàng",
  ROUTE: "Lộ trình",
  FARE: "Giá cước",
  SAFETY: "An toàn",
  LOST_ITEM: "Quên đồ",
  PAYMENT: "Thanh toán",
  OTHER: "Khác",
  DRIVER_BEHAVIOR: "Thái độ tài xế",
};
const STATUS_LABEL: Record<string, string> = { OPEN: "Mới", IN_REVIEW: "Đang xử lý", RESOLVED: "Đã giải quyết", REJECTED: "Từ chối" };
const DRIVER_CATEGORIES = ["CUSTOMER_BEHAVIOR", "FARE", "SAFETY", "PAYMENT", "LOST_ITEM", "OTHER"];

export default function ComplaintsScreen() {
  const { token, user, isLoading } = useAuth();
  const params = useLocalSearchParams<{ tripId?: string; id?: string }>();
  const [items, setItems] = useState<any[]>([]);
  const [selected, setSelected] = useState<string | null>(params.id ?? null);
  const [detail, setDetail] = useState<any | null>(null);
  const [category, setCategory] = useState("OTHER");
  const [description, setDescription] = useState("");
  const [msg, setMsg] = useState("");
  const [creating, setCreating] = useState(!!params.tripId);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      setItems(await api.myComplaints(token));
    } catch {
      // ignore
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!token || !selected) {
      setDetail(null);
      return;
    }
    api.complaint(token, selected).then(setDetail).catch(() => setDetail(null));
  }, [token, selected]);

  if (!isLoading && (!user || user.role !== "DRIVER")) return <Redirect href="/login" />;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Có lỗi xảy ra");
    } finally {
      setBusy(false);
    }
  };

  if (creating && params.tripId) {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.sectionTitle}>Báo cáo sự cố cho chuyến</Text>
        <View style={styles.chips}>
          {DRIVER_CATEGORIES.map((c) => (
            <Pressable key={c} onPress={() => setCategory(c)} style={[styles.chip, category === c && styles.chipOn]}>
              <Text style={category === c ? styles.chipTextOn : undefined}>{CATEGORY_LABEL[c]}</Text>
            </Pressable>
          ))}
        </View>
        <TextInput style={[styles.input, { minHeight: 100 }]} multiline placeholder="Mô tả sự việc (ít nhất 10 ký tự)" value={description} onChangeText={setDescription} />
        {error && <Text style={styles.error}>{error}</Text>}
        <Pressable
          style={styles.button}
          disabled={busy || description.trim().length < 10}
          onPress={() =>
            run(async () => {
              const c = await api.createComplaint(token!, { tripId: params.tripId!, category, description: description.trim() });
              setCreating(false);
              setDescription("");
              setSelected(c.id);
              await load();
            })
          }
        >
          <Text style={styles.buttonText}>{busy ? "Đang gửi..." : "Gửi khiếu nại"}</Text>
        </Pressable>
        <Pressable onPress={() => setCreating(false)}>
          <Text style={styles.link}>Huỷ</Text>
        </Pressable>
      </ScrollView>
    );
  }

  if (selected && detail) {
    const closed = ["RESOLVED", "REJECTED"].includes(detail.status);
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <Pressable onPress={() => setSelected(null)}>
          <Text style={styles.link}>← Danh sách</Text>
        </Pressable>
        <View style={styles.card}>
          <Text style={styles.title}>{CATEGORY_LABEL[detail.category] ?? detail.category} · {STATUS_LABEL[detail.status]}</Text>
          <Text style={styles.muted}>{detail.trip.pickupAddress} → {detail.trip.dropoffAddress}</Text>
          <Text style={styles.body}>{detail.description}</Text>
          {detail.refundAmount ? <Text style={{ color: "#15803d" }}>Đã hoàn {Number(detail.refundAmount).toLocaleString("vi-VN")} đ cho khách.</Text> : null}
        </View>
        {detail.messages.map((m: any) => {
          const mine = m.author.id === user?.id;
          return (
            <View key={m.id} style={[styles.msg, mine ? styles.msgMine : m.author.role === "ADMIN" ? styles.msgAdmin : styles.msgOther]}>
              <Text style={[styles.muted, mine && { color: "#dbeafe" }]}>{m.author.fullName}{m.author.role === "ADMIN" ? " · GhepGo" : ""}</Text>
              <Text style={mine ? { color: "#fff" } : undefined}>{m.body}</Text>
            </View>
          );
        })}
        {error && <Text style={styles.error}>{error}</Text>}
        {!closed && (
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TextInput style={[styles.input, { flex: 1 }]} placeholder="Nhập tin nhắn..." value={msg} onChangeText={setMsg} />
            <Pressable
              style={[styles.button, { paddingHorizontal: 14 }]}
              disabled={busy || !msg.trim()}
              onPress={() =>
                run(async () => {
                  setDetail(await api.complaintMessage(token!, selected, msg.trim()));
                  setMsg("");
                })
              }
            >
              <Text style={styles.buttonText}>Gửi</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    );
  }

  return (
    <FlatList
      contentContainerStyle={styles.container}
      data={items}
      keyExtractor={(c) => c.id}
      ListEmptyComponent={<Text style={styles.muted}>Chưa có khiếu nại nào. Bạn có thể báo cáo sự cố từ chi tiết chuyến đã kết thúc.</Text>}
      renderItem={({ item }) => (
        <Pressable style={styles.card} onPress={() => setSelected(item.id)}>
          <Text style={styles.title}>{CATEGORY_LABEL[item.category] ?? item.category} · {STATUS_LABEL[item.status]}</Text>
          <Text style={styles.muted}>{item.trip.pickupAddress} → {item.trip.dropoffAddress}</Text>
          <Text style={styles.muted}>
            {item.reporter.id !== user?.id ? `${item.reporter.fullName} khiếu nại về bạn · ` : ""}
            {new Date(item.createdAt).toLocaleDateString("vi-VN")} · {item._count.messages} tin nhắn
          </Text>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 10, backgroundColor: "#f8fafc", flexGrow: 1 },
  card: { backgroundColor: "#fff", borderRadius: 10, borderWidth: 1, borderColor: "#e2e8f0", padding: 12, gap: 4, marginBottom: 8 },
  title: { fontWeight: "600" },
  body: { color: "#334155", marginTop: 4 },
  muted: { color: "#64748b", fontSize: 12 },
  sectionTitle: { fontWeight: "600", fontSize: 16 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 16, paddingHorizontal: 10, paddingVertical: 5 },
  chipOn: { backgroundColor: "#2563eb", borderColor: "#2563eb" },
  chipTextOn: { color: "#fff" },
  input: { borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: "#fff" },
  button: { backgroundColor: "#2563eb", borderRadius: 8, paddingVertical: 10, alignItems: "center" },
  buttonText: { color: "#fff", fontWeight: "600" },
  link: { color: "#2563eb" },
  error: { color: "#dc2626", fontSize: 13 },
  msg: { maxWidth: "85%", borderRadius: 10, padding: 10, gap: 2 },
  msgMine: { alignSelf: "flex-end", backgroundColor: "#2563eb" },
  msgAdmin: { alignSelf: "flex-start", backgroundColor: "#fefce8", borderWidth: 1, borderColor: "#fde68a" },
  msgOther: { alignSelf: "flex-start", backgroundColor: "#e2e8f0" },
});
