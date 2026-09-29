"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";

const SW_PATH = "/sw.js";

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export type PushState = "unsupported" | "disabled" | "denied" | "prompt" | "subscribed" | "loading";

/**
 * Web Push subscription for the signed-in user. `enable()` asks for
 * permission, subscribes with the server's VAPID key and registers the
 * subscription with the API.
 */
export function useWebPush(token: string | null) {
  const [state, setState] = useState<PushState>("loading");

  const refresh = useCallback(async () => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setState("unsupported");
      return;
    }
    if (!token) return;
    try {
      const { publicKey } = await api.vapidPublicKey(token);
      if (!publicKey) {
        setState("disabled");
        return;
      }
      if (Notification.permission === "denied") {
        setState("denied");
        return;
      }
      const reg = await navigator.serviceWorker.register(SW_PATH);
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        // Re-register so the server has the latest subscription for this account.
        await api.registerDevice(token, { kind: "WEBPUSH", token: sub.endpoint, subscription: sub.toJSON() as Record<string, unknown>, platform: "web" });
        setState("subscribed");
      } else {
        setState("prompt");
      }
    } catch {
      setState("disabled");
    }
  }, [token]);

  useEffect(() => {
    const id = setTimeout(refresh, 0);
    return () => clearTimeout(id);
  }, [refresh]);

  const enable = useCallback(async () => {
    if (!token) return;
    setState("loading");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "prompt");
        return;
      }
      const { publicKey } = await api.vapidPublicKey(token);
      if (!publicKey) {
        setState("disabled");
        return;
      }
      const reg = await navigator.serviceWorker.register(SW_PATH);
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) });
      await api.registerDevice(token, { kind: "WEBPUSH", token: sub.endpoint, subscription: sub.toJSON() as Record<string, unknown>, platform: "web" });
      setState("subscribed");
    } catch {
      setState("disabled");
    }
  }, [token]);

  const disable = useCallback(async () => {
    if (!token) return;
    const reg = await navigator.serviceWorker.getRegistration(SW_PATH);
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await api.removeDevice(token, sub.endpoint).catch(() => {});
      await sub.unsubscribe();
    }
    setState("prompt");
  }, [token]);

  return { state, enable, disable };
}
