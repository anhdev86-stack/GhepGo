import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "../contexts/auth-context";
import { usePushRegistration } from "../lib/push";

function PushRegistrar() {
  const { token } = useAuth();
  usePushRegistration(token);
  return null;
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <PushRegistrar />
        <StatusBar style="auto" />
        <Stack screenOptions={{ headerStyle: { backgroundColor: "#2563eb" }, headerTintColor: "#fff" }}>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="login" options={{ title: "Đăng nhập" }} />
          <Stack.Screen name="home" options={{ title: "GhepGo Tài xế" }} />
          <Stack.Screen name="trip/[id]" options={{ title: "Chi tiết chuyến" }} />
          <Stack.Screen name="group/[id]" options={{ title: "Chuyến ghép" }} />
          <Stack.Screen name="earnings" options={{ title: "Thu nhập" }} />
          <Stack.Screen name="notifications" options={{ title: "Thông báo" }} />
        </Stack>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
