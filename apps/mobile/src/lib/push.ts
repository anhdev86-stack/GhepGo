import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { router } from "expo-router";
import { api } from "./api";

// Show alerts even while the app is in the foreground.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/**
 * Obtains the Expo push token (physical devices only; Expo Go on Android
 * cannot receive remote pushes since SDK 53 — use a development build).
 */
export async function getExpoPushToken(): Promise<string | null> {
  if (!Device.isDevice) return null;
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "GhepGo",
      importance: Notifications.AndroidImportance.MAX,
      sound: "default",
    });
  }
  const { status: existing } = await Notifications.getPermissionsAsync();
  let status = existing;
  if (existing !== "granted") ({ status } = await Notifications.requestPermissionsAsync());
  if (status !== "granted") return null;
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  try {
    const { data } = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    return data;
  } catch {
    return null;
  }
}

function navigateFor(data: Record<string, unknown> | undefined) {
  const screen = data?.screen;
  if (screen === "wallet") router.push("/earnings");
  else if (screen === "group" && data?.groupId) router.push({ pathname: "/group/[id]", params: { id: String(data.groupId) } });
  else if (screen === "trip" && data?.tripId) router.push({ pathname: "/trip/[id]", params: { id: String(data.tripId) } });
  else router.push("/home");
}

/** Registers this device for pushes once signed in and routes notification taps. */
export function usePushRegistration(token: string | null) {
  const registered = useRef<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    getExpoPushToken().then((expoToken) => {
      if (cancelled || !expoToken || registered.current === expoToken) return;
      api
        .registerDevice(token, { kind: "EXPO", token: expoToken, platform: Platform.OS })
        .then(() => {
          registered.current = expoToken;
        })
        .catch(() => {});
    });
    const tapSub = Notifications.addNotificationResponseReceivedListener((resp) => {
      navigateFor(resp.notification.request.content.data as Record<string, unknown>);
    });
    // Cold start from a notification tap
    Notifications.getLastNotificationResponseAsync().then((resp) => {
      if (resp) navigateFor(resp.notification.request.content.data as Record<string, unknown>);
    });
    return () => {
      cancelled = true;
      tapSub.remove();
    };
  }, [token]);
}
