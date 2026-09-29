import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "../contexts/auth-context";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="auto" />
        <Stack screenOptions={{ headerStyle: { backgroundColor: "#2563eb" }, headerTintColor: "#fff" }}>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="login" options={{ title: "Đăng nhập" }} />
          <Stack.Screen name="home" options={{ title: "GhepGo Tài xế" }} />
          <Stack.Screen name="trip/[id]" options={{ title: "Chi tiết chuyến" }} />
        </Stack>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
