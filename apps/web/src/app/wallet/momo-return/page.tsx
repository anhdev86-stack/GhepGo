"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
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
    <div className="bg-white p-6 rounded-lg border max-w-md mx-auto text-center">
      <p className="text-xs uppercase tracking-wide text-slate-400 mb-2">MoMo</p>
      {!result && !error && <p className="text-slate-600">Đang xác nhận giao dịch...</p>}
      {error && <p className="text-red-600">{error}</p>}
      {result && (
        <>
          <h1 className={`text-lg font-semibold ${result.ok ? "text-green-700" : "text-red-600"}`}>{result.message}</h1>
          {result.amount > 0 && <p className="text-3xl font-semibold my-3">{Number(result.amount).toLocaleString("vi-VN")} đ</p>}
          <p className="text-xs text-slate-500">Mã giao dịch: {result.txId ?? params.get("orderId")} · mã MoMo: {result.code}</p>
        </>
      )}
      <Link href="/wallet" className="inline-block mt-4 bg-blue-600 text-white rounded px-4 py-2">
        Về ví
      </Link>
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
