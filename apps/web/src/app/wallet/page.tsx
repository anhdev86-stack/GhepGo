"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { api, ApiError } from "@/lib/api";

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

export default function WalletPage() {
  const { token, user, isLoading } = useAuth();
  const router = useRouter();
  const [wallet, setWallet] = useState<any | null>(null);
  const [txs, setTxs] = useState<any[]>([]);
  const [stats, setStats] = useState<any | null>(null);
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [amount, setAmount] = useState(100000);
  const [bankName, setBankName] = useState("");
  const [bankAccount, setBankAccount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [gateway, setGateway] = useState<"vnpay" | "mock" | null>(null);

  const load = useCallback(() => {
    if (!token || !user) return;
    api.wallet(token).then(setWallet).catch(() => {});
    api.walletGateway(token).then((g) => setGateway(g.gateway)).catch(() => {});
    api.walletTransactions(token).then(setTxs).catch(() => {});
    if (user.role === "DRIVER") {
      api.myDriverStats(token).then(setStats).catch(() => {});
      api.myWithdrawals(token).then(setWithdrawals).catch(() => {});
    }
  }, [token, user]);

  useEffect(() => {
    load();
  }, [load]);

  if (!isLoading && (!user || user.role === "ADMIN")) {
    if (typeof window !== "undefined") router.push("/login");
    return null;
  }

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    setBusy(true);
    try {
      await fn();
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Có lỗi xảy ra");
    } finally {
      setBusy(false);
    }
  };

  const topup = () =>
    run(async () => {
      const res = await api.topup(token!, amount);
      window.location.href = res.paymentUrl;
    });

  const withdraw = () =>
    run(async () => {
      await api.requestWithdrawal(token!, { amount, bankName, bankAccount });
      setBankName("");
      setBankAccount("");
    });

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">{user?.role === "DRIVER" ? "Thu nhập & ví" : "Ví GhepGo"}</h1>
      {error && <p className="text-red-600 text-sm">{error}</p>}

      <div className="bg-white p-4 rounded-lg border">
        <p className="text-sm text-slate-500">Số dư khả dụng</p>
        <p className="text-3xl font-semibold">{wallet ? vnd(wallet.balance) : "…"}</p>
        {wallet?.pendingTopups > 0 && <p className="text-xs text-orange-600 mt-1">{wallet.pendingTopups} giao dịch nạp đang chờ cổng thanh toán</p>}
        {user?.role === "DRIVER" && Number(wallet?.balance) < 0 && (
          <p className="text-xs text-red-600 mt-1">Bạn đang nợ phí nền tảng từ các chuyến tiền mặt; số dư sẽ được trừ vào thu nhập ví tiếp theo.</p>
        )}
      </div>

      {user?.role === "DRIVER" && stats && (
        <div className="bg-white p-4 rounded-lg border grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div><p className="text-slate-500">Chuyến 30 ngày</p><p className="text-lg font-medium">{stats.trips.completed}</p></div>
          <div><p className="text-slate-500">Doanh thu gộp</p><p className="text-lg font-medium">{vnd(stats.grossFare)}</p></div>
          <div><p className="text-slate-500">Thực nhận (sau {Math.round((wallet?.commissionRate ?? 0.2) * 100)}%)</p><p className="text-lg font-medium">{vnd(stats.netEarnings)}</p></div>
          <div><p className="text-slate-500">Giờ trực</p><p className="text-lg font-medium">{stats.onlineHours} h</p></div>
          <div><p className="text-slate-500">Tỷ lệ huỷ</p><p className="text-lg font-medium">{stats.trips.cancelRate}%</p></div>
          <div><p className="text-slate-500">Đánh giá</p><p className="text-lg font-medium">{stats.driver.ratingAvg} ★ ({stats.driver.ratingCount})</p></div>
          <div><p className="text-slate-500">Chuyến / giờ trực</p><p className="text-lg font-medium">{stats.tripsPerOnlineHour}</p></div>
          <div><p className="text-slate-500">Km đã chạy</p><p className="text-lg font-medium">{stats.distanceKm}</p></div>
        </div>
      )}

      <div className="bg-white p-4 rounded-lg border">
        {user?.role === "CUSTOMER" ? (
          <>
            <h2 className="font-medium mb-2">Nạp ví</h2>
            <div className="flex gap-2 flex-wrap items-center">
              {[50000, 100000, 200000, 500000].map((v) => (
                <button key={v} type="button" onClick={() => setAmount(v)} className={`px-3 py-1 rounded border text-sm ${amount === v ? "bg-blue-600 text-white" : ""}`}>
                  {v.toLocaleString("vi-VN")}
                </button>
              ))}
              <input type="number" className="border rounded px-2 py-1 w-32 text-sm" value={amount} min={10000} step={10000} onChange={(e) => setAmount(Number(e.target.value))} />
              <button onClick={topup} disabled={busy} className="bg-blue-600 text-white rounded px-3 py-1.5 text-sm disabled:opacity-50">
                {gateway === "vnpay" ? "Thanh toán qua VNPay" : "Thanh toán qua cổng"}
              </button>
            </div>
            <p className="text-xs text-slate-500 mt-2">
              {gateway === "vnpay"
                ? "Bạn sẽ được chuyển tới trang VNPay (sandbox) để thanh toán; số dư cập nhật ngay khi VNPay xác nhận."
                : "Chưa cấu hình VNPay nên đang dùng cổng thanh toán giả lập (chỉ dành cho dev)."}
            </p>
          </>
        ) : (
          <>
            <h2 className="font-medium mb-2">Rút tiền về tài khoản ngân hàng</h2>
            <div className="flex gap-2 flex-wrap">
              <input type="number" className="border rounded px-2 py-1 w-32 text-sm" value={amount} min={50000} step={10000} onChange={(e) => setAmount(Number(e.target.value))} />
              <input className="border rounded px-2 py-1 text-sm" placeholder="Ngân hàng" value={bankName} onChange={(e) => setBankName(e.target.value)} />
              <input className="border rounded px-2 py-1 text-sm" placeholder="Số tài khoản" value={bankAccount} onChange={(e) => setBankAccount(e.target.value)} />
              <button onClick={withdraw} disabled={busy || !bankName || !bankAccount} className="bg-blue-600 text-white rounded px-3 py-1.5 text-sm disabled:opacity-50">
                Gửi yêu cầu
              </button>
            </div>
            <p className="text-xs text-slate-500 mt-2">Tối thiểu 50.000 đ, mỗi lần một yêu cầu. Tiền được giữ ngay khi gửi và hoàn lại nếu bị từ chối.</p>
            {withdrawals.length > 0 && (
              <ul className="text-sm mt-3 divide-y">
                {withdrawals.map((w) => (
                  <li key={w.id} className="py-1 flex justify-between">
                    <span>{new Date(w.createdAt).toLocaleDateString("vi-VN")} · {w.bankName} {w.bankAccount}</span>
                    <span>{vnd(w.amount)} · {W_LABEL[w.status] ?? w.status}{w.note ? ` (${w.note})` : ""}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      <div className="bg-white p-4 rounded-lg border">
        <h2 className="font-medium mb-2">Lịch sử giao dịch</h2>
        {txs.length === 0 && <p className="text-sm text-slate-500">Chưa có giao dịch.</p>}
        <ul className="text-sm divide-y">
          {txs.map((t) => (
            <li key={t.id} className="py-1.5 flex justify-between gap-2">
              <span>
                <span className="font-medium">{TX_LABEL[t.type] ?? t.type}</span>
                {t.status !== "COMPLETED" && <span className="ml-1 text-xs text-orange-600">({t.status})</span>}
                <span className="block text-xs text-slate-500">{new Date(t.createdAt).toLocaleString("vi-VN")}{t.description ? ` · ${t.description}` : ""}</span>
              </span>
              <span className={`whitespace-nowrap ${Number(t.amount) < 0 ? "text-red-600" : "text-green-700"}`}>
                {Number(t.amount) > 0 ? "+" : ""}{vnd(t.amount)}
                <span className="block text-xs text-slate-400">dư {vnd(t.balanceAfter)}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
