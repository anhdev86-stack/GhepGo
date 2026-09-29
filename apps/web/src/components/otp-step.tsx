"use client";

import { useEffect, useState } from "react";
import { api, ApiError, type OtpPurpose } from "@/lib/api";
import { Alert, Button } from "@/components/ui";

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

  const digits = Array.from({ length: 6 }, (_, i) => code[i] ?? "");

  return (
    <form onSubmit={verify} className="flex flex-col gap-4">
      <div>
        <p className="font-semibold text-ink-900">Nhập mã xác thực</p>
        <p className="text-sm text-ink-500 mt-0.5">
          {sentTo ? (
            <>
              Mã 6 số đã gửi qua SMS tới <b className="text-ink-800">{sentTo}</b>.
            </>
          ) : (
            "Đang gửi mã xác thực..."
          )}
        </p>
      </div>
      {devCode && (
        <Alert tone="amber">
          Môi trường dev (chưa cấu hình SMS): mã của bạn là <b className="font-mono">{devCode}</b>
        </Alert>
      )}
      <label className="relative block cursor-text">
        <div className="grid grid-cols-6 gap-2">
          {digits.map((d, i) => (
            <span
              key={i}
              className={`h-12 rounded-xl border bg-white flex items-center justify-center text-xl font-semibold font-mono ${
                i === code.length ? "border-brand-500 ring-4 ring-brand-500/15" : "border-ink-200"
              }`}
            >
              {d}
            </span>
          ))}
        </div>
        <input
          className="absolute inset-0 opacity-0"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          autoFocus
          required
        />
      </label>
      {error && <Alert>{error}</Alert>}
      <Button type="submit" size="lg" loading={busy} disabled={code.length !== 6} className="w-full">
        Xác nhận
      </Button>
      <div className="flex justify-between text-sm">
        <button type="button" onClick={onBack} className="text-ink-500 hover:text-ink-800">
          Đổi số điện thoại
        </button>
        <button type="button" onClick={send} disabled={busy || cooldown > 0} className="link disabled:text-ink-400 disabled:no-underline">
          {cooldown > 0 ? `Gửi lại sau ${cooldown}s` : "Gửi lại mã"}
        </button>
      </div>
    </form>
  );
}
