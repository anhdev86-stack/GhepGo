"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { api, ApiError } from "@/lib/api";

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
    <div className="bg-white p-6 rounded-lg border max-w-md mx-auto text-center">
      <p className="text-xs uppercase tracking-wide text-slate-400 mb-2">Cổng thanh toán giả lập</p>
      <h1 className="text-lg font-semibold">Nạp ví GhepGo</h1>
      <p className="text-3xl font-semibold my-4">{amount.toLocaleString("vi-VN")} đ</p>
      <p className="text-xs text-slate-500 mb-4">Mã giao dịch: {txId}</p>
      {error && <p className="text-red-600 text-sm mb-2">{error}</p>}
      <div className="flex gap-2 justify-center">
        <button onClick={() => finish("SUCCESS")} disabled={busy} className="bg-green-600 text-white rounded px-4 py-2 disabled:opacity-50">
          Thanh toán thành công
        </button>
        <button onClick={() => finish("FAILED")} disabled={busy} className="bg-slate-500 text-white rounded px-4 py-2 disabled:opacity-50">
          Giả lập thất bại
        </button>
      </div>
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
