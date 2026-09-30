"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { api, ApiError, type Gateway } from "@/lib/api";
import { Alert, Badge, Button, Card, CardTitle, EmptyState, Field, Icon, Input, LogoMark, PageHeader, Stat, type Tone } from "@/components/ui";

const TX_LABEL: Record<string, string> = {
  TOPUP: "Nạp ví",
  TRIP_PAYMENT: "Thanh toán chuyến",
  TRIP_EARNING: "Thu nhập chuyến",
  COMMISSION: "Phí nền tảng",
  WITHDRAWAL: "Rút tiền",
  REFUND: "Hoàn tiền",
  ADJUSTMENT: "Điều chỉnh",
};
const W_STATUS: Record<string, { label: string; tone: Tone }> = {
  REQUESTED: { label: "Chờ duyệt", tone: "amber" },
  APPROVED: { label: "Đã duyệt", tone: "blue" },
  PAID: { label: "Đã chuyển", tone: "green" },
  REJECTED: { label: "Từ chối", tone: "red" },
};
const GATEWAY_LABEL: Record<Gateway, string> = { vnpay: "VNPay", momo: "MoMo", mock: "Cổng giả lập" };
const vnd = (n: unknown) => Number(n).toLocaleString("vi-VN") + " đ";
const QUICK = [50000, 100000, 200000, 500000];

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
  const [gateway, setGateway] = useState<Gateway | null>(null);
  const [gateways, setGateways] = useState<Gateway[]>([]);

  const load = useCallback(() => {
    if (!token || !user) return;
    api.wallet(token).then(setWallet).catch(() => {});
    api
      .walletGateway(token)
      .then((g) => {
        setGateways(g.available);
        setGateway((cur) => cur ?? g.gateway);
      })
      .catch(() => {});
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
      const res = await api.topup(token!, amount, gateway ?? undefined);
      window.location.href = res.paymentUrl;
    });

  const withdraw = () =>
    run(async () => {
      await api.requestWithdrawal(token!, { amount, bankName, bankAccount });
      setBankName("");
      setBankAccount("");
    });

  const isDriver = user?.role === "DRIVER";
  const negative = Number(wallet?.balance) < 0;

  return (
    <div>
      <PageHeader title={isDriver ? "Thu nhập & ví" : "Ví GhepGo"} description={isDriver ? "Thu nhập về ví ngay khi hoàn thành chuyến; rút về ngân hàng bất cứ lúc nào." : "Nạp ví để thanh toán không tiền mặt, trừ tự động khi hoàn thành chuyến."} />
      {error && <Alert className="mb-4">{error}</Alert>}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] items-start">
        <div className="flex flex-col gap-5">
          {/* Balance card */}
          <div className="gradient-ink rounded-3xl p-6 sm:p-7 text-white relative overflow-hidden">
            <div className="absolute -right-10 -top-10 h-44 w-44 rounded-full bg-brand-500/20" />
            <div className="relative flex items-start justify-between">
              <div>
                <p className="text-xs uppercase tracking-wider text-white/60">Số dư khả dụng</p>
                <p className={`mt-2 text-4xl font-bold tracking-tight ${negative ? "text-amber-300" : ""}`}>{wallet ? vnd(wallet.balance) : "…"}</p>
                <p className="mt-2 text-sm text-white/60">{user?.fullName} · {user?.phone}</p>
              </div>
              <LogoMark size={40} className="opacity-90" />
            </div>
            {wallet?.pendingTopups > 0 && <p className="relative mt-4 text-xs text-amber-200">{wallet.pendingTopups} giao dịch nạp đang chờ cổng thanh toán xác nhận.</p>}
            {isDriver && negative && <p className="relative mt-4 text-xs text-amber-200">Bạn đang nợ phí nền tảng từ các chuyến tiền mặt; số dư sẽ được trừ vào thu nhập ví tiếp theo.</p>}
          </div>

          {isDriver && stats && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Stat label="Chuyến 30 ngày" value={stats.trips.completed} tone="brand" />
              <Stat label="Doanh thu gộp" value={vnd(stats.grossFare)} tone="blue" />
              <Stat label={`Thực nhận (sau ${Math.round((wallet?.commissionRate ?? 0.2) * 100)}%)`} value={vnd(stats.netEarnings)} tone="green" />
              <Stat label="Giờ trực" value={`${stats.onlineHours} h`} tone="amber" />
              <Stat label="Tỷ lệ huỷ" value={`${stats.trips.cancelRate}%`} />
              <Stat label="Đánh giá" value={`${stats.driver.ratingAvg} ★`} hint={`${stats.driver.ratingCount} lượt`} />
              <Stat label="Chuyến / giờ trực" value={stats.tripsPerOnlineHour} />
              <Stat label="Km đã chạy" value={stats.distanceKm} />
            </div>
          )}

          <Card>
            <CardTitle>Lịch sử giao dịch</CardTitle>
            {txs.length === 0 && <EmptyState icon={<Icon.wallet className="h-6 w-6" />} title="Chưa có giao dịch" />}
            <ul className="divide-y divide-ink-100">
              {txs.map((t) => {
                const neg = Number(t.amount) < 0;
                return (
                  <li key={t.id} className="py-3 flex items-center gap-3">
                    <span className={`h-9 w-9 shrink-0 rounded-xl flex items-center justify-center ${neg ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600"}`}>
                      {neg ? <Icon.arrowRight className="h-4 w-4 rotate-45" /> : <Icon.arrowRight className="h-4 w-4 -rotate-135" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="font-medium text-ink-900">
                        {TX_LABEL[t.type] ?? t.type}
                        {t.status !== "COMPLETED" && <Badge tone="amber" className="ml-2">{t.status}</Badge>}
                      </span>
                      <span className="block text-xs text-ink-500 truncate">
                        {new Date(t.createdAt).toLocaleString("vi-VN")}
                        {t.description ? ` · ${t.description}` : ""}
                      </span>
                    </span>
                    <span className="text-right shrink-0">
                      <span className={`block font-semibold ${neg ? "text-red-600" : "text-emerald-700"}`}>
                        {neg ? "" : "+"}
                        {vnd(t.amount)}
                      </span>
                      <span className="text-[11px] text-ink-400">dư {vnd(t.balanceAfter)}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>

        <div className="flex flex-col gap-5">
          {!isDriver ? (
            <Card>
              <CardTitle description="Chọn số tiền và cổng thanh toán.">Nạp ví</CardTitle>
              <div className="grid grid-cols-4 gap-2">
                {QUICK.map((v) => (
                  <button key={v} type="button" onClick={() => setAmount(v)} className={`rounded-xl border px-2 py-2.5 text-sm font-semibold transition ${amount === v ? "border-brand-500 bg-brand-50 text-brand-800 ring-4 ring-brand-500/10" : "border-ink-200 text-ink-700 hover:border-ink-300"}`}>
                    {v / 1000}k
                  </button>
                ))}
              </div>
              <Field label="Hoặc số tiền khác" className="mt-3">
                <div className="relative">
                  <Input type="number" value={amount} min={10000} step={10000} onChange={(e) => setAmount(Number(e.target.value))} className="pr-10" />
                  <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-sm text-ink-400">đ</span>
                </div>
              </Field>
              {gateways.length > 1 && (
                <Field label="Cổng thanh toán" className="mt-3">
                  <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${gateways.length}, minmax(0,1fr))` }}>
                    {gateways.map((g) => (
                      <button key={g} type="button" onClick={() => setGateway(g)} className={`rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${gateway === g ? "border-brand-500 bg-brand-50 text-brand-800 ring-4 ring-brand-500/10" : "border-ink-200 text-ink-700 hover:border-ink-300"}`}>
                        {GATEWAY_LABEL[g]}
                      </button>
                    ))}
                  </div>
                </Field>
              )}
              <Button onClick={topup} loading={busy} disabled={!gateway} size="lg" className="w-full mt-4">
                {gateway ? `Nạp ${vnd(amount)} qua ${GATEWAY_LABEL[gateway]}` : "Đang tải cổng thanh toán…"}
              </Button>
              <p className="text-xs text-ink-500 mt-3">
                {gateway === "vnpay" && "Bạn sẽ được chuyển tới trang VNPay; số dư cập nhật ngay khi VNPay xác nhận."}
                {gateway === "momo" && "Bạn sẽ được chuyển tới MoMo (quét QR hoặc mở app); số dư cập nhật ngay khi MoMo xác nhận."}
                {gateway === "mock" && "Cổng thanh toán giả lập, chỉ dành cho môi trường phát triển."}
              </p>
            </Card>
          ) : (
            <Card>
              <CardTitle description="Tối thiểu 50.000 đ, mỗi lần một yêu cầu. Tiền được giữ ngay khi gửi và hoàn lại nếu bị từ chối.">Rút tiền về ngân hàng</CardTitle>
              <div className="grid gap-3">
                <Field label="Số tiền">
                  <div className="relative">
                    <Input type="number" value={amount} min={50000} step={10000} onChange={(e) => setAmount(Number(e.target.value))} className="pr-10" />
                    <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-sm text-ink-400">đ</span>
                  </div>
                </Field>
                <Field label="Ngân hàng">
                  <Input placeholder="Vietcombank" value={bankName} onChange={(e) => setBankName(e.target.value)} />
                </Field>
                <Field label="Số tài khoản">
                  <Input placeholder="0123456789" inputMode="numeric" value={bankAccount} onChange={(e) => setBankAccount(e.target.value)} />
                </Field>
                <Button onClick={withdraw} loading={busy} disabled={!bankName || !bankAccount} size="lg" className="w-full">
                  Gửi yêu cầu rút {vnd(amount)}
                </Button>
              </div>
              {withdrawals.length > 0 && (
                <ul className="mt-4 pt-4 border-t border-ink-100 divide-y divide-ink-100 text-sm">
                  {withdrawals.map((w) => {
                    const st = W_STATUS[w.status] ?? { label: w.status, tone: "slate" as Tone };
                    return (
                      <li key={w.id} className="py-2.5 flex items-center justify-between gap-2">
                        <span className="min-w-0">
                          <span className="block text-ink-800">{vnd(w.amount)} · {w.bankName} {w.bankAccount}</span>
                          <span className="text-xs text-ink-500">
                            {new Date(w.createdAt).toLocaleDateString("vi-VN")}
                            {w.note ? ` · ${w.note}` : ""}
                          </span>
                        </span>
                        <Badge tone={st.tone}>{st.label}</Badge>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
