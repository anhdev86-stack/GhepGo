"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { api, ApiError } from "@/lib/api";
import { Alert, Button, Card, LogoMark } from "@/components/ui";

/**
 * Stand-in for the VNPay/Momo hosted checkout page. It asks the API to sign
 * the IPN exactly like the real gateway would, then posts the callback.
 * Real gateways call `/wallet/topup/callback` server-to-server; this page
 * only exists so the dev flow is clickable end to end.
 */
function MockCheckout() {
  const params = useSearchParams();
  const router = useRouter();
  const { token } = useAuth();
  const txId = params.get("txId") ?? "";
  const amount = Number(params.get("amount") ?? 0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const finish = async (result: "SUCCESS" | "FAILED") => {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const gatewayRef = `MOCK-${Date.now()}`;
      const { signature } = await api.mockSign(token, { txId, result, gatewayRef });
      await api.topupCallback({ txId, result, gatewayRef, signature });
      router.push("/wallet");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Có lỗi xảy ra");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-md mx-auto">
      <Card className="text-center">
        <p className="text-xs uppercase tracking-wider text-ink-400">Cổng thanh toán giả lập</p>
        <div className="mt-4 flex justify-center">
          <LogoMark size={44} />
        </div>
        <h1 className="mt-3 text-lg font-semibold text-ink-900">Nạp ví GhepGo</h1>
        <p className="text-4xl font-bold tracking-tight text-ink-900 my-4">{amount.toLocaleString("vi-VN")} đ</p>
        <p className="text-xs text-ink-500 font-mono">Mã giao dịch: {txId}</p>
        {error && <Alert className="mt-3">{error}</Alert>}
        <div className="mt-6 grid gap-2">
          <Button size="lg" onClick={() => finish("SUCCESS")} loading={busy}>
            Thanh toán thành công
          </Button>
          <Button size="lg" variant="secondary" onClick={() => finish("FAILED")} disabled={busy}>
            Giả lập thất bại
          </Button>
        </div>
        <p className="mt-4 text-xs text-ink-400">Trang này chỉ tồn tại ở môi trường phát triển. VNPay/MoMo gọi IPN server-to-server.</p>
      </Card>
    </div>
  );
}

export default function MockCheckoutPage() {
  return (
    <Suspense fallback={null}>
      <MockCheckout />
    </Suspense>
  );
}
