"use client";

import { Suspense, useEffect, useState } from "react";
import { Card, Icon, LinkButton, Spinner } from "@/components/ui";
import { useSearchParams } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

/**
 * VNPay redirects the customer here after checkout with the signed vnp_* query.
 * We forward that query to the API, which verifies the signature and reports
 * the outcome (and credits the wallet if the IPN has not arrived yet).
 */
function VnpayReturn() {
  const params = useSearchParams();
  const [result, setResult] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const query = params.toString();
    if (!query) return;
    fetch(`${API_URL}/wallet/vnpay/return?${query}`)
      .then((r) => r.json())
      .then(setResult)
      .catch(() => setError("Không kết nối được máy chủ"));
  }, [params]);

  return (
    <div className="max-w-md mx-auto">
      <Card className="text-center">
        <p className="text-xs uppercase tracking-wider text-ink-400">VNPay</p>
        {!result && !error && (
          <div className="py-8 flex flex-col items-center gap-3 text-ink-500">
            <Spinner className="h-6 w-6 text-brand-600" />
            Đang xác nhận giao dịch…
          </div>
        )}
        {error && <p className="text-red-600 py-6">{error}</p>}
        {result && (
          <>
            <div className={`mx-auto mt-4 h-14 w-14 rounded-full flex items-center justify-center ${result.ok ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"}`}>
              {result.ok ? <Icon.check className="h-7 w-7" /> : <Icon.x className="h-7 w-7" />}
            </div>
            <h1 className="mt-3 text-lg font-semibold text-ink-900">{result.message}</h1>
            {result.amount > 0 && <p className="text-4xl font-bold tracking-tight my-3 text-ink-900">{Number(result.amount).toLocaleString("vi-VN")} đ</p>}
            <p className="text-xs text-ink-500 font-mono">Mã giao dịch: {result.txId ?? params.get("vnp_TxnRef")} · mã VNPay: {result.code}</p>
          {!result.ok && result.code === "24" && <p className="text-sm text-ink-500 mt-2">Bạn đã huỷ giao dịch tại VNPay.</p>}
          </>
        )}
        <div className="mt-6">
          <LinkButton href="/wallet" size="lg">
            Về ví
          </LinkButton>
        </div>
      </Card>
    </div>
  );
}

export default function VnpayReturnPage() {
  return (
    <Suspense fallback={null}>
      <VnpayReturn />
    </Suspense>
  );
}
