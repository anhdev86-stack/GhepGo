import { AppState } from "react-native";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import AsyncStorage from "@react-native-async-storage/async-storage";

export const BACKGROUND_LOCATION_TASK = "ghepgo-driver-location";
const AUTH_STORAGE_KEY = "ghepgo_driver_auth";
const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3001/api";

/**
 * Background task: receives batched fixes from the OS even when the app is
 * in the background / screen off, and posts the newest one to the API over
 * HTTP (the socket is not available in the background). While the app is
 * in the foreground the socket stream in useDriverLocationStream is used
 * instead, so we skip here to avoid double sends.
 *
 * Must be defined at module scope and imported from the root layout so it is
 * registered before the OS wakes the app for a location update.
 */
TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
  if (error || !data) return;
  if (AppState.currentState === "active") return;
  const { locations } = data as { locations: Location.LocationObject[] };
  const latest = locations[locations.length - 1];
  if (!latest) return;
  try {
    const raw = await AsyncStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return;
    const { token } = JSON.parse(raw) as { token: string };
    await fetch(`${BASE_URL}/drivers/me/location`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        lat: latest.coords.latitude,
        lng: latest.coords.longitude,
        heading: latest.coords.heading ?? undefined,
        speed: latest.coords.speed ?? undefined,
      }),
    });
  } catch {
    // network hiccup: the next fix will retry
  }
});

export type BackgroundPermission = "granted" | "foreground_only" | "denied";

export async function requestBackgroundPermission(): Promise<BackgroundPermission> {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== "granted") return "denied";
  const bg = await Location.requestBackgroundPermissionsAsync();
  return bg.status === "granted" ? "granted" : "foreground_only";
}

export async function isBackgroundTrackingActive() {
  try {
    return await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
  } catch {
    return false;
  }
}

/** Starts OS-level location updates (Android foreground service / iOS background mode). */
export async function startBackgroundTracking(): Promise<BackgroundPermission> {
  const permission = await requestBackgroundPermission();
  if (permission !== "granted") return permission;
  if (await isBackgroundTrackingActive()) return permission;
  await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
    accuracy: Location.Accuracy.High,
    timeInterval: 5000,
    distanceInterval: 25,
    deferredUpdatesInterval: 10000,
    pausesUpdatesAutomatically: false,
    activityType: Location.ActivityType.AutomotiveNavigation,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: "GhepGo đang trực",
      notificationBody: "Vị trí của bạn được chia sẻ với khách hàng trong lúc trực.",
      notificationColor: "#2563eb",
      killServiceOnDestroy: false,
    },
  });
  return permission;
}

export async function stopBackgroundTracking() {
  if (await isBackgroundTrackingActive()) {
    await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
  }
}
