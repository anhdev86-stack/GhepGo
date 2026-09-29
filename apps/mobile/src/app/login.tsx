import { useEffect, useState } from "react";
import { router } from "expo-router";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../contexts/auth-context";

export default function LoginScreen() {
  const { login } = useAuth();
  const [mode, setMode] = useState<"login" | "register" | "forgot">("login");
  const [step, setStep] = useState<"form" | "otp" | "password">("form");
  const [otpRequired, setOtpRequired] = useState(true);
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [verificationToken, setVerificationToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.authConfig().then((c) => setOtpRequired(c.otpRequired)).catch(() => {});
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  const purpose = mode === "register" ? "REGISTER" : "RESET_PASSWORD";

  const finishAuth = (auth: any) => {
    if (auth.user.role !== "DRIVER") {
      setError("Tài khoản này không phải tài xế");
      return;
    }
    login({ token: auth.accessToken, refreshToken: auth.refreshToken, user: auth.user });
    router.replace("/home");
  };

  const sendCode = async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await api.sendOtp(phone, purpose);
      setDevCode(res.devCode ?? null);
      setCooldown(res.resendAfterSecs);
      setCode("");
      setStep("otp");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Không gửi được mã");
    } finally {
      setLoading(false);
    }
  };

  const verifyCode = async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await api.verifyOtp(phone, code, purpose);
      if (mode === "register") {
        finishAuth(await api.register({ phone, password, fullName, role: "DRIVER", verificationToken: res.verificationToken }));
      } else {
        setVerificationToken(res.verificationToken);
        setPassword("");
        setStep("password");
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Mã không đúng");
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (m: "login" | "register" | "forgot") => {
    setMode(m);
    setStep("form");
    setError(null);
  };

  const onSubmit = async () => {
    setError(null);
    if (mode === "register" && otpRequired) return sendCode();
    if (mode === "forgot" && step === "form") return sendCode();
    setLoading(true);
    try {
      if (mode === "forgot" && step === "password" && verificationToken) {
        finishAuth(await api.resetPassword({ phone, verificationToken, newPassword: password }));
        return;
      }
      const auth =
        mode === "login"
          ? await api.login({ phone, password })
          : await api.register({ phone, password, fullName, role: "DRIVER" });
      finishAuth(auth);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Có lỗi xảy ra");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Text style={styles.title}>
        {mode === "login" ? "Đăng nhập tài xế" : mode === "register" ? "Đăng ký tài xế" : "Quên mật khẩu"}
      </Text>

      {step === "otp" ? (
        <>
          <Text style={styles.hint}>Nhập mã 6 số đã gửi qua SMS tới {phone}</Text>
          {devCode && <Text style={styles.devCode}>Dev (chưa cấu hình SMS): mã là {devCode}</Text>}
          <TextInput
            style={[styles.input, styles.codeInput]}
            placeholder="______"
            value={code}
            onChangeText={(t) => setCode(t.replace(/\D/g, "").slice(0, 6))}
            keyboardType="number-pad"
            maxLength={6}
          />
          {error && <Text style={styles.error}>{error}</Text>}
          <Pressable style={styles.button} onPress={verifyCode} disabled={loading || code.length !== 6}>
            <Text style={styles.buttonText}>{loading ? "Đang kiểm tra..." : "Xác nhận"}</Text>
          </Pressable>
          <Pressable onPress={sendCode} disabled={loading || cooldown > 0}>
            <Text style={[styles.switchText, cooldown > 0 && { color: "#94a3b8" }]}>
              {cooldown > 0 ? `Gửi lại sau ${cooldown}s` : "Gửi lại mã"}
            </Text>
          </Pressable>
          <Pressable onPress={() => setStep("form")}>
            <Text style={styles.switchText}>Đổi số điện thoại</Text>
          </Pressable>
        </>
      ) : (
        <>
          {step === "password" ? (
            <>
              <Text style={styles.hint}>Đã xác thực {phone}. Đặt mật khẩu mới:</Text>
              <TextInput style={styles.input} placeholder="Mật khẩu mới (≥ 6 ký tự)" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" />
            </>
          ) : (
            <>
              <TextInput style={styles.input} placeholder="Số điện thoại" value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoCapitalize="none" />
              {mode !== "forgot" && (
                <TextInput style={styles.input} placeholder="Mật khẩu" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" />
              )}
              {mode === "register" && (
                <TextInput style={styles.input} placeholder="Họ tên" value={fullName} onChangeText={setFullName} />
              )}
            </>
          )}

          {error && <Text style={styles.error}>{error}</Text>}

          <Pressable style={styles.button} onPress={onSubmit} disabled={loading}>
            <Text style={styles.buttonText}>
              {loading
                ? "Đang xử lý..."
                : mode === "login"
                  ? "Đăng nhập"
                  : mode === "register"
                    ? otpRequired ? "Nhận mã xác thực" : "Đăng ký"
                    : step === "password" ? "Đổi mật khẩu" : "Nhận mã xác thực"}
            </Text>
          </Pressable>

          {mode !== "login" && (
            <Pressable onPress={() => switchMode("login")}>
              <Text style={styles.switchText}>Đã có tài khoản? Đăng nhập</Text>
            </Pressable>
          )}
          {mode !== "register" && (
            <Pressable onPress={() => switchMode("register")}>
              <Text style={styles.switchText}>Chưa có tài khoản? Đăng ký</Text>
            </Pressable>
          )}
          {mode === "login" && (
            <Pressable onPress={() => switchMode("forgot")}>
              <Text style={[styles.switchText, { color: "#64748b" }]}>Quên mật khẩu?</Text>
            </Pressable>
          )}
        </>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#fff",
    gap: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: "600",
    marginBottom: 12,
    textAlign: "center",
  },
  input: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  error: {
    color: "#dc2626",
    fontSize: 13,
  },
  button: {
    backgroundColor: "#2563eb",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 8,
  },
  buttonText: {
    color: "#fff",
    fontWeight: "600",
  },
  switchText: {
    color: "#2563eb",
    textAlign: "center",
    marginTop: 8,
  },
  hint: {
    color: "#475569",
    fontSize: 13,
    textAlign: "center",
  },
  devCode: {
    backgroundColor: "#fefce8",
    borderColor: "#fde68a",
    borderWidth: 1,
    borderRadius: 6,
    padding: 8,
    fontSize: 12,
    textAlign: "center",
  },
  codeInput: {
    textAlign: "center",
    fontSize: 22,
    letterSpacing: 8,
  },
});
