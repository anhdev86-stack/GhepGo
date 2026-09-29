"use client";

import { useEffect, useState } from "react";
import { api, ApiError, type OtpPurpose } from "@/lib/api";

/**
 * Phone verification widget: sends a code, lets the user enter it, and hands
 * back the verification token that register / reset-password require.
 */
export function OtpStep({
  phone,
  purpose,
  onVerified,
  onBack,
}: {
  phone: string;
  purpose: OtpPurpose;
  onVerified: (verificationToken: string) => void;
  onBack: () => void;
}) {
  const [code, setCode] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.sendOtp(phone, purpose);
      setSentTo(res.phone);
      setDevCode(res.devCode ?? null);
      setCooldown(res.resendAfterSecs);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Không gửi được mã");
    } finally {
      setBusy(false);
    }
  };

  // Send the first code once on mount (deferred so no state is set synchronously in the effect).
  useEffect(() => {
    const id = setTimeout(send, 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.verifyOtp(phone, code, purpose);
      onVerified(res.verificationToken);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Mã không đúng");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={verify} className="flex flex-col gap-3">
      <p className="text-sm text-slate-600">
        {sentTo ? (
          <>
            Mã xác thực đã gửi tới <b>{sentTo}</b>. Nhập 6 số nhận được qua SMS.
          </>
        ) : (
          "Đang gửi mã xác thực..."
        )}
      </p>
      {devCode && (
        <p className="text-xs bg-yellow-50 border border-yellow-200 rounded p-2">
          Môi trường dev (chưa cấu hình SMS): mã của bạn là <b className="font-mono">{devCode}</b>
        </p>
      )}
      <input
        className="border rounded px-3 py-2 text-center text-lg tracking-[0.5em] font-mono"
        placeholder="______"
        inputMode="numeric"
        maxLength={6}
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
        autoFocus
        required
      />
      {error && <p className="text-red-600 text-sm">{error}</p>}
      <button type="submit" disabled={busy || code.length !== 6} className="bg-blue-600 text-white rounded px-3 py-2 disabled:opacity-50">
        {busy ? "Đang kiểm tra..." : "Xác nhận"}
      </button>
      <div className="flex justify-between text-sm">
        <button type="button" onClick={onBack} className="text-slate-500 underline">
          Đổi số điện thoại
        </button>
        <button type="button" onClick={send} disabled={busy || cooldown > 0} className="text-blue-600 underline disabled:text-slate-400 disabled:no-underline">
          {cooldown > 0 ? `Gửi lại sau ${cooldown}s` : "Gửi lại mã"}
        </button>
      </div>
    </form>
  );
}
