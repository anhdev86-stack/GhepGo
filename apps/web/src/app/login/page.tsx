"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { OtpStep } from "@/components/otp-step";

type Mode = "login" | "register" | "forgot";
type Step = "form" | "otp" | "password";

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();

  const [mode, setMode] = useState<Mode>("login");
  const [step, setStep] = useState<Step>("form");
  const [otpRequired, setOtpRequired] = useState(true);
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<"CUSTOMER" | "DRIVER">("CUSTOMER");
  const [verificationToken, setVerificationToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.authConfig().then((c) => setOtpRequired(c.otpRequired)).catch(() => {});
  }, []);

  const redirectByRole = (r: string) => {
    if (r === "DRIVER") router.push("/driver");
    else if (r === "ADMIN") router.push("/admin");
    else router.push("/book");
  };

  const switchMode = (m: Mode) => {
    setMode(m);
    setStep("form");
    setVerificationToken(null);
    setError(null);
  };

  const finishRegister = async (token?: string) => {
    setLoading(true);
    setError(null);
    try {
      const auth = await api.register({ phone, password, fullName, role, verificationToken: token });
      login(auth);
      redirectByRole(auth.user.role);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Có lỗi xảy ra");
      setStep("form");
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (mode === "login") {
      setLoading(true);
      try {
        const auth = await api.login({ phone, password });
        login(auth);
        redirectByRole(auth.user.role);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Có lỗi xảy ra");
      } finally {
        setLoading(false);
      }
      return;
    }
    if (mode === "register") {
      if (otpRequired) setStep("otp");
      else await finishRegister();
      return;
    }
    if (mode === "forgot") {
      if (step === "form") setStep("otp");
      else if (step === "password" && verificationToken) {
        setLoading(true);
        try {
          const auth = await api.resetPassword({ phone, verificationToken, newPassword: password });
          login(auth);
          redirectByRole(auth.user.role);
        } catch (err) {
          setError(err instanceof ApiError ? err.message : "Có lỗi xảy ra");
        } finally {
          setLoading(false);
        }
      }
    }
  };

  const title = mode === "login" ? "Đăng nhập" : mode === "register" ? "Đăng ký" : "Quên mật khẩu";

  return (
    <div className="max-w-sm mx-auto mt-8 bg-white p-6 rounded-lg border">
      <h1 className="text-xl font-semibold mb-4">{title}</h1>

      {step === "otp" ? (
        <OtpStep
          phone={phone}
          purpose={mode === "register" ? "REGISTER" : "RESET_PASSWORD"}
          onBack={() => setStep("form")}
          onVerified={(token) => {
            setVerificationToken(token);
            if (mode === "register") finishRegister(token);
            else {
              setPassword("");
              setStep("password");
            }
          }}
        />
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          {step === "password" ? (
            <>
              <p className="text-sm text-green-700">Đã xác thực {phone}. Đặt mật khẩu mới:</p>
              <input className="border rounded px-3 py-2" type="password" placeholder="Mật khẩu mới (≥ 6 ký tự)" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} required autoFocus />
            </>
          ) : (
            <>
              <input className="border rounded px-3 py-2" placeholder="Số điện thoại" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required />
              {mode !== "forgot" && (
                <input className="border rounded px-3 py-2" type="password" placeholder="Mật khẩu" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} required />
              )}
              {mode === "register" && (
                <>
                  <input className="border rounded px-3 py-2" placeholder="Họ tên" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
                  <select className="border rounded px-3 py-2" value={role} onChange={(e) => setRole(e.target.value as "CUSTOMER" | "DRIVER")}>
                    <option value="CUSTOMER">Khách hàng</option>
                    <option value="DRIVER">Tài xế</option>
                  </select>
                  {otpRequired && <p className="text-xs text-slate-500">Chúng tôi sẽ gửi mã xác thực qua SMS tới số này.</p>}
                </>
              )}
            </>
          )}

          {error && <p className="text-red-600 text-sm">{error}</p>}

          <button type="submit" disabled={loading} className="bg-blue-600 text-white rounded px-3 py-2 disabled:opacity-50">
            {loading
              ? "Đang xử lý..."
              : mode === "login"
                ? "Đăng nhập"
                : mode === "register"
                  ? otpRequired ? "Nhận mã xác thực" : "Đăng ký"
                  : step === "password" ? "Đổi mật khẩu" : "Nhận mã xác thực"}
          </button>
        </form>
      )}

      <div className="mt-4 text-sm text-center flex flex-col gap-1">
        {mode !== "login" && (
          <button onClick={() => switchMode("login")} className="text-blue-600">Đã có tài khoản? Đăng nhập</button>
        )}
        {mode !== "register" && (
          <button onClick={() => switchMode("register")} className="text-blue-600">Chưa có tài khoản? Đăng ký</button>
        )}
        {mode === "login" && (
          <button onClick={() => switchMode("forgot")} className="text-slate-500">Quên mật khẩu?</button>
        )}
      </div>
    </div>
  );
}
