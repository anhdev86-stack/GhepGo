import { useCallback, useEffect, useState } from "react";
import { Redirect } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../contexts/auth-context";

const TX_LABEL: Record<string, string> = {
  TOPUP: "Nạp ví",
  TRIP_PAYMENT: "Thanh toán chuyến",
  TRIP_EARNING: "Thu nhập chuyến",
  COMMISSION: "Phí nền tảng",
  WITHDRAWAL: "Rút tiền",
  REFUND: "Hoàn tiền",
  ADJUSTMENT: "Điều chỉnh",
};
const W_LABEL: Record<string, string> = { REQUESTED: "Chờ duyệt", APPROVED: "Đã duyệt", PAID: "Đã chuyển", REJECTED: "Từ chối" };
const vnd = (n: unknown) => Number(n).toLocaleString("vi-VN") + " đ";

export default function EarningsScreen() {
  const { token, user, isLoading } = useAuth();
  const [wallet, setWallet] = useState<any | null>(null);
  const [stats, setStats] = useState<any | null>(null);
  const [txs, setTxs] = useState<any[]>([]);
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [amount, setAmount] = useState("100000");
  const [bankName, setBankName] = useState("");
  const [bankAccount, setBankAccount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const [w, s, t, wd] = await Promise.all([
        api.wallet(token),
        api.myDriverStats(token),
        api.walletTransactions(token),
        api.myWithdrawals(token),
      ]);
      setWallet(w);
      setStats(s);
      setTxs(t);
      setWithdrawals(wd);
    } catch {
      // ignore
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  if (!isLoading && (!user || user.role !== "DRIVER")) {
    return <Redirect href="/login" />;
  }

  const withdraw = async () => {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      await api.requestWithdrawal(token, { amount: Number(amount), bankName, bankAccount });
      setBankName("");
      setBankAccount("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Có lỗi xảy ra");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.card}>
        <Text style={styles.muted}>Số dư ví</Text>
        <Text style={styles.balance}>{wallet ? vnd(wallet.balance) : "…"}</Text>
        {wallet && Number(wallet.balance) < 0 && (
          <Text style={styles.warn}>Đang nợ phí nền tảng từ chuyến tiền mặt; sẽ trừ vào thu nhập ví tiếp theo.</Text>
        )}
      </View>

      {stats && (
        <View style={[styles.card, styles.grid]}>
          {[
            ["Chuyến 30 ngày", stats.trips.completed],
            ["Doanh thu gộp", vnd(stats.grossFare)],
            ["Thực nhận", vnd(stats.netEarnings)],
            ["Giờ trực", `${stats.onlineHours} h`],
            ["Tỷ lệ huỷ", `${stats.trips.cancelRate}%`],
            ["Đánh giá", `${stats.driver.ratingAvg} ★ (${stats.driver.ratingCount})`],
          ].map(([label, value]) => (
            <View key={String(label)} style={styles.stat}>
              <Text style={styles.muted}>{label}</Text>
              <Text style={styles.statValue}>{String(value)}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Rút tiền</Text>
        <TextInput style={styles.input} keyboardType="numeric" placeholder="Số tiền (≥ 50.000)" value={amount} onChangeText={setAmount} />
        <TextInput style={styles.input} placeholder="Ngân hàng" value={bankName} onChangeText={setBankName} />
        <TextInput style={styles.input} placeholder="Số tài khoản" value={bankAccount} onChangeText={setBankAccount} />
        {error && <Text style={styles.error}>{error}</Text>}
        <Pressable style={styles.button} onPress={withdraw} disabled={busy || !bankName || !bankAccount}>
          <Text style={styles.buttonText}>{busy ? "Đang gửi..." : "Gửi yêu cầu rút tiền"}</Text>
        </Pressable>
        {withdrawals.map((w) => (
          <Text key={w.id} style={styles.muted}>
            {new Date(w.createdAt).toLocaleDateString("vi-VN")} · {vnd(w.amount)} · {W_LABEL[w.status] ?? w.status}
          </Text>
        ))}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Lịch sử giao dịch</Text>
        {txs.length === 0 && <Text style={styles.muted}>Chưa có giao dịch.</Text>}
        {txs.map((t) => (
          <View key={t.id} style={styles.txRow}>
            <View style={{ flex: 1 }}>
              <Text>{TX_LABEL[t.type] ?? t.type}</Text>
              <Text style={styles.muted}>{new Date(t.createdAt).toLocaleString("vi-VN")}</Text>
            </View>
            <Text style={{ color: Number(t.amount) < 0 ? "#dc2626" : "#15803d", fontWeight: "600" }}>
              {Number(t.amount) > 0 ? "+" : ""}
              {vnd(t.amount)}
            </Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 12, backgroundColor: "#f8fafc" },
  card: { backgroundColor: "#fff", borderRadius: 10, borderWidth: 1, borderColor: "#e2e8f0", padding: 14, gap: 8 },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  stat: { width: "50%", paddingVertical: 4 },
  statValue: { fontSize: 16, fontWeight: "600" },
  balance: { fontSize: 28, fontWeight: "700" },
  muted: { color: "#64748b", fontSize: 12 },
  warn: { color: "#b91c1c", fontSize: 12 },
  sectionTitle: { fontWeight: "600", fontSize: 15 },
  input: { borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  button: { backgroundColor: "#2563eb", borderRadius: 8, paddingVertical: 10, alignItems: "center" },
  buttonText: { color: "#fff", fontWeight: "600" },
  error: { color: "#dc2626", fontSize: 13 },
  txRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6, borderTopWidth: 1, borderTopColor: "#f1f5f9" },
});
