"use client";

import Link from "next/link";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

/* ---------- Brand ---------- */

export function LogoMark({ size = 32, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" className={className} aria-hidden>
      <rect width="40" height="40" rx="11" fill="url(#gg-grad)" />
      <path d="M11 24.5c0-4.7 3.8-8.5 8.5-8.5h1.2" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" />
      <path d="M29 15.5c0 4.7-3.8 8.5-8.5 8.5h-1.2" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" />
      <circle cx="11" cy="24.5" r="3" fill="#fbbf24" />
      <circle cx="29" cy="15.5" r="3" fill="#fff" />
      <defs>
        <linearGradient id="gg-grad" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop stopColor="#0b8c75" />
          <stop offset="1" stopColor="#16ad90" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function Logo({ dark = false, size = 30 }: { dark?: boolean; size?: number }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark size={size} />
      <span className={`font-extrabold tracking-tight text-[1.2rem] ${dark ? "text-white" : "text-ink-900"}`}>
        Ghep<span className="text-brand-600">Go</span>
      </span>
    </span>
  );
}

/* ---------- Buttons ---------- */

type Variant = "primary" | "secondary" | "soft" | "ghost" | "danger" | "dark";
type Size = "sm" | "md" | "lg";

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  loading,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; loading?: boolean }) {
  return (
    <button className={`btn btn-${size} btn-${variant} ${className}`} disabled={rest.disabled || loading} {...rest}>
      {loading && <Spinner className="h-4 w-4" />}
      {children}
    </button>
  );
}

export function LinkButton({
  href,
  variant = "primary",
  size = "md",
  className = "",
  children,
}: {
  href: string;
  variant?: Variant;
  size?: Size;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={`btn btn-${size} btn-${variant} ${className}`}>
      {children}
    </Link>
  );
}

export function Spinner({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
      <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="4" strokeLinecap="round" className="opacity-90" />
    </svg>
  );
}

/* ---------- Forms ---------- */

export function Field({ label, hint, children, className = "" }: { label?: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      {label && <label className="label">{label}</label>}
      {children}
      {hint && <p className="mt-1 text-xs text-ink-500">{hint}</p>}
    </div>
  );
}

export function Input({ className = "", ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`input ${className}`} {...rest} />;
}

export function Select({ className = "", ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`input ${className}`} {...rest} />;
}

export function Textarea({ className = "", ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`input ${className}`} {...rest} />;
}

/** Pill-style single choice (trip type, payment method, amounts…). */
export function Segmented<T extends string | number>({
  value,
  onChange,
  options,
  className = "",
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode; hint?: string }[];
  className?: string;
}) {
  return (
    <div className={`grid gap-2 ${className}`} style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            onClick={() => onChange(o.value)}
            className={`rounded-xl border px-3 py-2.5 text-left text-sm transition ${
              active ? "border-brand-500 bg-brand-50 text-brand-800 ring-4 ring-brand-500/10" : "border-ink-200 bg-white text-ink-700 hover:border-ink-300"
            }`}
          >
            <span className="block font-semibold">{o.label}</span>
            {o.hint && <span className={`block text-xs mt-0.5 ${active ? "text-brand-700/80" : "text-ink-500"}`}>{o.hint}</span>}
          </button>
        );
      })}
    </div>
  );
}

/* ---------- Surfaces ---------- */

export function Card({ children, className = "", padded = true }: { children: ReactNode; className?: string; padded?: boolean }) {
  return <section className={`card ${padded ? "p-5 sm:p-6" : ""} ${className}`}>{children}</section>;
}

export function CardTitle({ children, action, description }: { children: ReactNode; action?: ReactNode; description?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 mb-4">
      <div>
        <h2 className="text-[15px] font-semibold text-ink-900">{children}</h2>
        {description && <p className="text-sm text-ink-500 mt-0.5">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function PageHeader({ title, description, action, eyebrow }: { title: ReactNode; description?: ReactNode; action?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
      <div>
        {eyebrow && <p className="text-xs font-semibold uppercase tracking-wider text-brand-700 mb-1">{eyebrow}</p>}
        <h1 className="text-2xl sm:text-[1.75rem] font-bold tracking-tight text-ink-900">{title}</h1>
        {description && <p className="text-ink-500 mt-1 text-sm sm:text-[15px]">{description}</p>}
      </div>
      {action && <div className="flex items-center gap-2">{action}</div>}
    </div>
  );
}

export type Tone = "brand" | "green" | "amber" | "red" | "blue" | "slate" | "violet";
const TONE: Record<Tone, string> = {
  brand: "bg-brand-50 text-brand-800 ring-1 ring-brand-200",
  green: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  amber: "bg-amber-50 text-amber-800 ring-1 ring-amber-200",
  red: "bg-red-50 text-red-700 ring-1 ring-red-200",
  blue: "bg-sky-50 text-sky-800 ring-1 ring-sky-200",
  slate: "bg-ink-100 text-ink-600 ring-1 ring-ink-200",
  violet: "bg-violet-50 text-violet-700 ring-1 ring-violet-200",
};

export function Badge({ tone = "slate", children, dot, className = "" }: { tone?: Tone; children: ReactNode; dot?: boolean; className?: string }) {
  return (
    <span className={`badge ${TONE[tone]} ${className}`}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

export function Stat({ label, value, hint, tone = "slate", icon }: { label: ReactNode; value: ReactNode; hint?: ReactNode; tone?: Tone; icon?: ReactNode }) {
  return (
    <div className="card p-4 flex items-start gap-3">
      {icon && <div className={`h-10 w-10 shrink-0 rounded-xl flex items-center justify-center ${TONE[tone]}`}>{icon}</div>}
      <div className="min-w-0">
        <p className="text-xs font-medium text-ink-500">{label}</p>
        <p className="text-xl font-bold text-ink-900 mt-0.5 truncate">{value}</p>
        {hint && <p className="text-xs text-ink-500 mt-0.5">{hint}</p>}
      </div>
    </div>
  );
}

export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: ReactNode; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="text-center py-10 px-4">
      <div className="mx-auto h-12 w-12 rounded-2xl bg-ink-100 text-ink-500 flex items-center justify-center mb-3">{icon ?? <Icon.inbox className="h-6 w-6" />}</div>
      <p className="font-semibold text-ink-800">{title}</p>
      {description && <p className="text-sm text-ink-500 mt-1 max-w-sm mx-auto">{description}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function Alert({ tone = "red", children, className = "" }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <div className={`rounded-xl px-3.5 py-2.5 text-sm ${TONE[tone]} ${className}`}>{children}</div>;
}

export function Avatar({ name, size = 36, className = "" }: { name?: string | null; size?: number; className?: string }) {
  const initials = (name ?? "?")
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-800 font-semibold ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {initials || "?"}
    </span>
  );
}

/** Live status pill for the realtime socket. */
export function LiveDot({ connected, label }: { connected: boolean; label?: string }) {
  return (
    <span className={`badge ${connected ? TONE.green : TONE.slate}`}>
      <span className="relative flex h-2 w-2">
        <span className={`h-2 w-2 rounded-full ${connected ? "bg-emerald-500 pulse-dot" : "bg-ink-400"}`} />
      </span>
      {label ?? (connected ? "Trực tiếp" : "Mất kết nối")}
    </span>
  );
}

/** Pickup → dropoff addresses with the dotted route line. */
export function RouteLine({ pickup, dropoff, className = "" }: { pickup: string; dropoff: string; className?: string }) {
  return (
    <div className={`relative pl-6 text-sm ${className}`}>
      <span className="absolute left-[7px] top-2.5 bottom-2.5 w-px border-l-2 border-dashed border-ink-200" />
      <p className="relative py-0.5 text-ink-800">
        <span className="absolute -left-6 top-1.5 h-3 w-3 rounded-full bg-emerald-500 ring-4 ring-white" />
        {pickup}
      </p>
      <p className="relative py-0.5 mt-1 text-ink-800">
        <span className="absolute -left-6 top-1.5 h-3 w-3 rounded-full bg-orange-500 ring-4 ring-white" />
        {dropoff}
      </p>
    </div>
  );
}

/* ---------- Icons (inline, stroke) ---------- */

type IconProps = { className?: string };
const base = (path: ReactNode) =>
  function IconCmp({ className = "h-5 w-5" }: IconProps) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
        {path}
      </svg>
    );
  };

export const Icon = {
  car: base(
    <>
      <path d="M5 17h14M6 17l1.5-5h9L18 17M6 17v2M18 17v2" />
      <path d="M7.5 12 9 8h6l1.5 4" />
    </>,
  ),
  users: base(
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <path d="M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-5-6.3" />
    </>,
  ),
  wallet: base(
    <>
      <rect x="3" y="6" width="18" height="13" rx="3" />
      <path d="M3 10h18M16 14.5h2" />
    </>,
  ),
  map: base(
    <>
      <path d="m3 6 6-2 6 2 6-2v14l-6 2-6-2-6 2z" />
      <path d="M9 4v14M15 6v14" />
    </>,
  ),
  pin: base(
    <>
      <path d="M12 21s-6-5.3-6-11a6 6 0 0 1 12 0c0 5.7-6 11-6 11z" />
      <circle cx="12" cy="10" r="2.2" />
    </>,
  ),
  bell: base(
    <>
      <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </>,
  ),
  check: base(<path d="m5 12 4.5 4.5L19 7" />),
  x: base(<path d="M6 6l12 12M18 6 6 18" />),
  arrowRight: base(
    <>
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </>,
  ),
  clock: base(
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>,
  ),
  star: base(<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z" />),
  shield: base(<path d="M12 3 4 6v6c0 5 3.4 8 8 9 4.6-1 8-4 8-9V6z" />),
  bolt: base(<path d="M13 2 4 14h7l-1 8 9-12h-7z" />),
  inbox: base(
    <>
      <path d="M3 13h5l1.5 2h5L16 13h5" />
      <path d="M5 5h14l2 8v6H3v-6z" />
    </>,
  ),
  route: base(
    <>
      <circle cx="6" cy="18" r="2.5" />
      <circle cx="18" cy="6" r="2.5" />
      <path d="M8.5 18H14a3 3 0 0 0 0-6h-4a3 3 0 0 1 0-6h5.5" />
    </>,
  ),
  chart: base(
    <>
      <path d="M4 20V4M4 20h16" />
      <path d="M8 16v-5M12 16V8M16 16v-3" />
    </>,
  ),
  menu: base(<path d="M4 7h16M4 12h16M4 17h16" />),
  phone: base(<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" />),
  logout: base(
    <>
      <path d="M10 17l5-5-5-5" />
      <path d="M15 12H3M12 3h7v18h-7" />
    </>,
  ),
  alert: base(
    <>
      <path d="M12 3 2 20h20z" />
      <path d="M12 9v5M12 17h.01" />
    </>,
  ),
  navigation: base(<path d="m3 11 18-8-8 18-2-8z" />),
  refresh: base(
    <>
      <path d="M20 12a8 8 0 1 1-2.3-5.7" />
      <path d="M20 4v5h-5" />
    </>,
  ),
  layers: base(
    <>
      <path d="m12 3 9 5-9 5-9-5z" />
      <path d="m3 13 9 5 9-5" />
    </>,
  ),
};
