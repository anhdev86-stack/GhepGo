"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { OtpStep } from "@/components/otp-step";
import { Alert, Button, Field, Icon, Input, Logo, Segmented } from "@/components/ui";

type Mode = "login" | "register" | "forgot";
type Step = "form" | "otp" | "password";

function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const params = useSearchParams();

  const [mode, setMode] = useState<Mode>(params.get("mode") === "register" ? "register" : "login");
  const [step, setStep] = useState<Step>("form");
  const [otpRequired, setOtpRequired] = useState(true);
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<"CUSTOMER" | "DRIVER">(params.get("role") === "DRIVER" ? "DRIVER" : "CUSTOMER");
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

  const title = mode === "login" ? "Chào mừng trở lại" : mode === "register" ? "Tạo tài khoản" : "Khôi phục mật khẩu";
  const subtitle =
    mode === "login"
      ? "Đăng nhập bằng số điện thoại để đặt xe hoặc nhận chuyến."
      : mode === "register"
        ? "Chỉ mất một phút. Chúng tôi xác thực số điện thoại qua SMS."
        : "Nhập số điện thoại đã đăng ký, chúng tôi sẽ gửi mã xác thực.";

  return (
    <div className="min-h-[calc(100vh-4rem)] grid lg:grid-cols-[1.05fr_1fr]">
      {/* Brand panel */}
      <aside className="hidden lg:flex gradient-ink text-white relative overflow-hidden">
        <div className="grid-bg absolute inset-0" />
        <div className="relative m-auto max-w-md px-10 py-16">
          <Logo dark size={36} />
          <h2 className="mt-8 text-3xl font-bold leading-tight tracking-tight">Ghép đúng người, đúng tuyến, đúng giờ.</h2>
          <p className="mt-4 text-white/70">
            Một tài khoản cho cả khách hàng và tài xế. Đặt xe riêng, ghép xe tiết kiệm, theo dõi realtime và thanh toán trong ứng dụng.
          </p>
          <ul className="mt-8 space-y-3 text-sm">
            {[
              ["Giá minh bạch", "Tính theo quãng đường thực tế, hiện trước khi đặt"],
              ["Ghép xe thông minh", "Đi vòng tối đa 2 km, rẻ hơn 25%"],
              ["An toàn", "Xác thực SMS, khiếu nại và hoàn tiền trong app"],
            ].map(([t, d]) => (
              <li key={t} className="flex gap-3">
                <span className="mt-0.5 h-5 w-5 rounded-full bg-brand-500/30 ring-1 ring-brand-400/50 flex items-center justify-center">
                  <Icon.check className="h-3 w-3 text-brand-300" />
                </span>
                <span>
                  <span className="font-semibold">{t}</span>
                  <span className="text-white/60"> · {d}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </aside>

      {/* Form */}
      <div className="flex items-center justify-center px-4 py-10 sm:py-16">
        <div className="w-full max-w-md fade-up">
          <div className="lg:hidden mb-8">
            <Logo />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-ink-900">{title}</h1>
          <p className="mt-1.5 text-ink-500">{subtitle}</p>

          <div className="card mt-8 p-6 sm:p-8">
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
              <form onSubmit={onSubmit} className="flex flex-col gap-4">
                {step === "password" ? (
                  <>
                    <Alert tone="green">Đã xác thực {phone}. Đặt mật khẩu mới cho tài khoản.</Alert>
                    <Field label="Mật khẩu mới">
                      <Input type="password" placeholder="Ít nhất 6 ký tự" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} required autoFocus />
                    </Field>
                  </>
                ) : (
                  <>
                    {mode === "register" && (
                      <Segmented
                        value={role}
                        onChange={setRole}
                        options={[
                          { value: "CUSTOMER", label: "Tôi là khách", hint: "Đặt xe, ghép xe" },
                          { value: "DRIVER", label: "Tôi là tài xế", hint: "Nhận chuyến, thu nhập" },
                        ]}
                      />
                    )}
                    <Field label="Số điện thoại">
                      <div className="relative">
                        <Icon.phone className="h-4.5 w-4.5 absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" />
                        <Input className="pl-10" placeholder="09xx xxx xxx" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required />
                      </div>
                    </Field>
                    {mode === "register" && (
                      <Field label="Họ và tên">
                        <Input placeholder="Nguyễn Văn A" autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
                      </Field>
                    )}
                    {mode !== "forgot" && (
                      <Field label="Mật khẩu">
                        <Input
                          type="password"
                          placeholder="Ít nhất 6 ký tự"
                          autoComplete={mode === "login" ? "current-password" : "new-password"}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          minLength={6}
                          required
                        />
                      </Field>
                    )}
                    {mode === "register" && otpRequired && <p className="text-xs text-ink-500 -mt-1">Chúng tôi sẽ gửi mã xác thực 6 số qua SMS tới số này.</p>}
                  </>
                )}

                {error && <Alert>{error}</Alert>}

                <Button type="submit" size="lg" loading={loading} className="w-full mt-1">
                  {mode === "login"
                    ? "Đăng nhập"
                    : mode === "register"
                      ? otpRequired
                        ? "Nhận mã xác thực"
                        : "Tạo tài khoản"
                      : step === "password"
                        ? "Đổi mật khẩu"
                        : "Nhận mã xác thực"}
                </Button>
              </form>
            )}
          </div>

          <div className="mt-6 text-sm text-center text-ink-600 flex flex-col gap-2">
            {mode !== "login" && (
              <button onClick={() => switchMode("login")}>
                Đã có tài khoản? <span className="link">Đăng nhập</span>
              </button>
            )}
            {mode !== "register" && (
              <button onClick={() => switchMode("register")}>
                Chưa có tài khoản? <span className="link">Đăng ký miễn phí</span>
              </button>
            )}
            {mode === "login" && (
              <button onClick={() => switchMode("forgot")} className="text-ink-500 hover:text-ink-800">
                Quên mật khẩu?
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <LoginPage />
    </Suspense>
  );
}
