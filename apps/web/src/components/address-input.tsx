"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { Icon } from "@/components/ui";

export interface Place {
  address: string;
  lat: number;
  lng: number;
}

/**
 * Address field with provider-backed autocomplete (Goong/OSM via the API).
 * Falls back to manual lat/lng entry when the provider returns nothing.
 */
export function AddressInput({
  token,
  label,
  value,
  onChange,
  near,
  tone = "pickup",
}: {
  token: string | null;
  label: string;
  value: Place;
  onChange: (p: Place) => void;
  near?: { lat: number; lng: number };
  tone?: "pickup" | "dropoff";
}) {
  const [query, setQuery] = useState(value.address);
  const [options, setOptions] = useState<{ label: string; address: string; lat: number; lng: number }[]>([]);
  const [open, setOpen] = useState(false);
  const [manual, setManual] = useState(false);
  const lastPicked = useRef(value.address);

  // The parent may set the address from outside (map tap / marker drag / reverse geocoding).
  useEffect(() => {
    setQuery((q) => {
      if (q === value.address) return q;
      lastPicked.current = value.address;
      setOpen(false);
      return value.address;
    });
  }, [value.address]);

  useEffect(() => {
    if (!token || query.trim().length < 2 || query === lastPicked.current) {
      setOptions([]);
      return;
    }
    const t = setTimeout(() => {
      api
        .autocomplete(token, query, near)
        .then((res) => {
          setOptions(res);
          setOpen(res.length > 0);
        })
        .catch(() => setOptions([]));
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, token]);

  const pick = (o: { address: string; lat: number; lng: number }) => {
    lastPicked.current = o.address;
    setQuery(o.address);
    setOpen(false);
    onChange({ address: o.address, lat: o.lat, lng: o.lng });
  };

  const dot = tone === "pickup" ? "bg-emerald-500" : "bg-orange-500";

  return (
    <div className="relative">
      <label className="label">{label}</label>
      <div className="relative">
        <span className={`absolute left-3.5 top-1/2 -translate-y-1/2 h-2.5 w-2.5 rounded-full ring-4 ring-white ${dot}`} />
        <input
          className="input pl-9 pr-9"
          placeholder="Nhập địa chỉ hoặc chạm trên bản đồ"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            onChange({ ...value, address: e.target.value });
          }}
          onFocus={() => options.length > 0 && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          required
        />
        <Icon.pin className="h-4 w-4 absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-300" />
      </div>
      {open && (
        <ul className="absolute z-20 card p-1 w-full mt-1.5 max-h-64 overflow-auto text-sm shadow-[var(--shadow-float)]">
          {options.map((o, i) => (
            <li key={i} className="px-3 py-2 rounded-lg hover:bg-ink-50 cursor-pointer" onMouseDown={() => pick(o)}>
              <span className="font-medium text-ink-900">{o.label}</span>
              <span className="block text-xs text-ink-500 truncate">{o.address}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center gap-2 mt-1 text-[11px] text-ink-400">
        <span className="font-mono">
          {value.lat.toFixed(5)}, {value.lng.toFixed(5)}
        </span>
        <button type="button" className="hover:text-ink-700 underline underline-offset-2" onClick={() => setManual((m) => !m)}>
          {manual ? "ẩn toạ độ" : "nhập toạ độ"}
        </button>
      </div>
      {manual && (
        <div className="flex gap-2 mt-1.5">
          <input className="input py-1.5 text-sm" placeholder="Vĩ độ (lat)" value={value.lat} onChange={(e) => onChange({ ...value, lat: parseFloat(e.target.value) || 0 })} />
          <input className="input py-1.5 text-sm" placeholder="Kinh độ (lng)" value={value.lng} onChange={(e) => onChange({ ...value, lng: parseFloat(e.target.value) || 0 })} />
        </div>
      )}
    </div>
  );
}
