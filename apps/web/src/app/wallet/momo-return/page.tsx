"use client";

import { Suspense, useEffect, useState } from "react";
import { Card, Icon, LinkButton, Spinner } from "@/components/ui";
import { useSearchParams } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

/** MoMo redirects here after checkout; the API verifies the signed query and reports the outcome. */
function MomoReturn() {
  const params = useSearchParams();
  const [result, setResult] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const query = params.toString();
    if (!query) return;
    fetch(`${API_URL}/wallet/momo/return?${query}`)
      .then((r) => r.json())
      .then(setResult)
      .catch(() => setError("Không kết nối được máy chủ"));
  }, [params]);

  return (
    <div className="max-w-md mx-auto">
      <Card className="text-center">
        <p className="text-xs uppercase tracking-wider text-ink-400">MoMo</p>
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
            <p className="text-xs text-ink-500 font-mono">Mã giao dịch: {result.txId ?? params.get("orderId")} · mã MoMo: {result.code}</p>
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

export default function MomoReturnPage() {
  return (
    <Suspense fallback={null}>
      <MomoReturn />
    </Suspense>
  );
}
