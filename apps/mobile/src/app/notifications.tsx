import { useCallback, useEffect, useState } from "react";
import { Redirect, router } from "expo-router";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { api } from "../lib/api";
import { useAuth } from "../contexts/auth-context";
import { useRealtime, useSocketEvent, WS } from "../lib/realtime";

export default function NotificationsScreen() {
  const { token, user, isLoading } = useAuth();
  const { socket } = useRealtime(token);
  const [items, setItems] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      setItems(await api.notifications(token));
    } catch {
      // ignore
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);
  useSocketEvent<any>(socket, WS.NOTIFICATION, (n) => setItems((prev) => [{ ...n, readAt: null }, ...prev]));

  if (!isLoading && (!user || user.role !== "DRIVER")) return <Redirect href="/login" />;

  const open = async (n: any) => {
    if (token && !n.readAt) {
      api.markNotificationRead(token, n.id).catch(() => {});
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)));
    }
    const d = n.data ?? {};
    if (d.screen === "wallet") router.push("/earnings");
    else if (d.screen === "group" && d.groupId) router.push({ pathname: "/group/[id]", params: { id: d.groupId } });
    else if (d.tripId) router.push({ pathname: "/trip/[id]", params: { id: d.tripId } });
    else router.push("/home");
  };

  return (
    <FlatList
      contentContainerStyle={styles.container}
      data={items}
      keyExtractor={(n) => n.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      ListHeaderComponent={
        items.some((n) => !n.readAt) ? (
          <Pressable onPress={async () => { if (token) await api.markAllNotificationsRead(token).catch(() => {}); setItems((p) => p.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() }))); }}>
            <Text style={styles.link}>Đánh dấu tất cả đã đọc</Text>
          </Pressable>
        ) : null
      }
      ListEmptyComponent={<Text style={styles.muted}>Chưa có thông báo.</Text>}
      renderItem={({ item }) => (
        <Pressable style={[styles.card, !item.readAt && styles.unread]} onPress={() => open(item)}>
          <Text style={styles.title}>{item.title}</Text>
          <Text style={styles.body}>{item.body}</Text>
          <Text style={styles.muted}>{new Date(item.createdAt).toLocaleString("vi-VN")}</Text>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 8, backgroundColor: "#f8fafc", flexGrow: 1 },
  card: { backgroundColor: "#fff", borderRadius: 10, borderWidth: 1, borderColor: "#e2e8f0", padding: 12, marginBottom: 8, gap: 2 },
  unread: { borderColor: "#93c5fd", backgroundColor: "#eff6ff" },
  title: { fontWeight: "600" },
  body: { color: "#334155", fontSize: 13 },
  muted: { color: "#64748b", fontSize: 12 },
  link: { color: "#2563eb", textAlign: "right", marginBottom: 8 },
});
