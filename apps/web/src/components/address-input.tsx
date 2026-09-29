"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

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
}: {
  token: string | null;
  label: string;
  value: Place;
  onChange: (p: Place) => void;
  near?: { lat: number; lng: number };
}) {
  const [query, setQuery] = useState(value.address);
  const [options, setOptions] = useState<{ label: string; address: string; lat: number; lng: number }[]>([]);
  const [open, setOpen] = useState(false);
  const [manual, setManual] = useState(false);
  const lastPicked = useRef(value.address);

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

  return (
    <div className="relative">
      <label className="text-sm text-slate-500">{label}</label>
      <input
        className="border rounded px-3 py-2 w-full"
        placeholder="Nhập địa chỉ..."
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          onChange({ ...value, address: e.target.value });
        }}
        onFocus={() => options.length > 0 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        required
      />
      {open && (
        <ul className="absolute z-10 bg-white border rounded shadow w-full mt-1 max-h-56 overflow-auto text-sm">
          {options.map((o, i) => (
            <li key={i} className="px-3 py-2 hover:bg-slate-100 cursor-pointer" onMouseDown={() => pick(o)}>
              <span className="font-medium">{o.label}</span>
              <span className="block text-xs text-slate-500 truncate">{o.address}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
        <span>
          {value.lat.toFixed(5)}, {value.lng.toFixed(5)}
        </span>
        <button type="button" className="underline" onClick={() => setManual((m) => !m)}>
          {manual ? "ẩn toạ độ" : "nhập toạ độ thủ công"}
        </button>
      </div>
      {manual && (
        <div className="flex gap-2 mt-1">
          <input
            className="border rounded px-3 py-1 w-1/2 text-sm"
            placeholder="Vĩ độ (lat)"
            value={value.lat}
            onChange={(e) => onChange({ ...value, lat: parseFloat(e.target.value) || 0 })}
          />
          <input
            className="border rounded px-3 py-1 w-1/2 text-sm"
            placeholder="Kinh độ (lng)"
            value={value.lng}
            onChange={(e) => onChange({ ...value, lng: parseFloat(e.target.value) || 0 })}
          />
        </div>
      )}
    </div>
  );
}
