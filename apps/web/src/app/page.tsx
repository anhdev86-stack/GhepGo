"use client";

import Link from "next/link";
import { useAuth } from "@/contexts/auth-context";
import { Icon, LinkButton, LogoMark } from "@/components/ui";

const FEATURES = [
  {
    icon: Icon.users,
    title: "Ghép xe cùng hướng, rẻ hơn 25%",
    body: "Thuật toán ghép khách cùng tuyến trong thời gian thực, tối ưu thứ tự đón trả để không ai phải đi vòng quá 2 km.",
  },
  {
    icon: Icon.navigation,
    title: "Theo dõi tài xế từng giây",
    body: "Vị trí xe, lộ trình và điểm dừng cập nhật realtime trên bản đồ. Biết chính xác khi nào xe tới.",
  },
  {
    icon: Icon.wallet,
    title: "Thanh toán linh hoạt",
    body: "Ví GhepGo, VNPay, MoMo hoặc tiền mặt. Giá cước minh bạch, tính theo quãng đường thực tế.",
  },
  {
    icon: Icon.shield,
    title: "An toàn & hỗ trợ 24/7",
    body: "Xác thực số điện thoại, khu vực phục vụ rõ ràng, khiếu nại được xử lý và hoàn tiền trong ứng dụng.",
  },
];

const STEPS = [
  { n: "01", title: "Chọn điểm đón & trả", body: "Gõ địa chỉ hoặc chạm trên bản đồ. Giá và thời gian dự kiến hiện ngay." },
  { n: "02", title: "Chọn bao xe hay ghép xe", body: "Đi riêng cho nhanh, hoặc ghép để tiết kiệm. Hệ thống tự tìm nhóm cùng hướng." },
  { n: "03", title: "Theo dõi & thanh toán", body: "Xem xe tới trên bản đồ, đánh giá tài xế, thanh toán bằng ví hoặc tiền mặt." },
];

export default function Home() {
  const { user } = useAuth();
  const cta =
    user?.role === "CUSTOMER"
      ? { href: "/book", label: "Đặt xe ngay" }
      : user?.role === "DRIVER"
        ? { href: "/driver", label: "Vào bảng tài xế" }
        : user?.role === "ADMIN"
          ? { href: "/admin", label: "Vào trang quản trị" }
          : { href: "/login?mode=register", label: "Tạo tài khoản miễn phí" };

  return (
    <div>
      {/* Hero */}
      <section className="gradient-ink text-white -mt-16 pt-16">
        <div className="grid-bg">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-16 pb-20 sm:pt-24 sm:pb-28 grid lg:grid-cols-[1.1fr_1fr] gap-12 items-center">
            <div className="fade-up">
              <span className="inline-flex items-center gap-2 rounded-full bg-white/10 ring-1 ring-white/15 px-3 py-1 text-xs font-medium text-white/90">
                <span className="h-1.5 w-1.5 rounded-full bg-brand-400" />
                Đang hoạt động tại TP. Hồ Chí Minh
              </span>
              <h1 className="mt-5 text-4xl sm:text-5xl lg:text-[3.6rem] font-extrabold leading-[1.08] tracking-tight">
                Đi chung, đi nhanh,
                <br />
                <span className="text-brand-400">tiết kiệm hơn.</span>
              </h1>
              <p className="mt-5 text-lg text-white/75 max-w-xl">
                GhepGo ghép những hành khách cùng hướng lên một chuyến xe. Rẻ hơn bao xe tới 25%, vẫn đón tận nơi và theo dõi realtime.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <LinkButton href={cta.href} size="lg" className="bg-white text-ink-900 hover:bg-brand-50 shadow-[var(--shadow-float)]">
                  {cta.label}
                  <Icon.arrowRight className="h-5 w-5" />
                </LinkButton>
                {!user && (
                  <LinkButton href="/login" size="lg" className="bg-white/10 text-white ring-1 ring-white/20 hover:bg-white/15">
                    Đăng nhập
                  </LinkButton>
                )}
              </div>
              <dl className="mt-10 grid grid-cols-3 gap-4 max-w-md">
                {[
                  ["-25%", "giá xe ghép"],
                  ["< 2 km", "đi vòng tối đa"],
                  ["24/7", "hỗ trợ"],
                ].map(([v, l]) => (
                  <div key={l}>
                    <dt className="text-2xl font-bold">{v}</dt>
                    <dd className="text-xs text-white/60">{l}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <HeroIllustration />
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
        <p className="text-xs font-semibold uppercase tracking-wider text-brand-700">Vì sao chọn GhepGo</p>
        <h2 className="mt-2 text-3xl font-bold tracking-tight text-ink-900 max-w-2xl">Một nền tảng cho khách, tài xế và đội vận hành</h2>
        <div className="mt-10 grid sm:grid-cols-2 gap-5">
          {FEATURES.map((f) => (
            <div key={f.title} className="card p-6 hover:-translate-y-0.5 transition">
              <div className="h-11 w-11 rounded-xl bg-brand-50 text-brand-700 flex items-center justify-center">
                <f.icon className="h-6 w-6" />
              </div>
              <h3 className="mt-4 font-semibold text-ink-900 text-lg">{f.title}</h3>
              <p className="mt-1.5 text-ink-600 text-[15px] leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="bg-white border-y border-ink-200/60">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20 grid lg:grid-cols-[1fr_1.2fr] gap-10 items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-brand-700">Cách hoạt động</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-ink-900">Ba bước để lên xe</h2>
            <p className="mt-3 text-ink-600">Không cần gọi điện, không cần đoán giá. Mọi thứ hiện rõ trước khi bạn bấm đặt.</p>
            <div className="mt-6">
              <LinkButton href={user ? cta.href : "/login?mode=register"} variant="primary" size="lg">
                Bắt đầu ngay
              </LinkButton>
            </div>
          </div>
          <ol className="grid gap-4">
            {STEPS.map((s) => (
              <li key={s.n} className="flex gap-4 rounded-2xl border border-ink-200/70 p-5 bg-ink-50/40">
                <span className="text-brand-600 font-mono font-bold text-lg">{s.n}</span>
                <div>
                  <p className="font-semibold text-ink-900">{s.title}</p>
                  <p className="text-sm text-ink-600 mt-1">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Driver CTA */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
        <div className="gradient-brand rounded-3xl p-8 sm:p-12 text-white grid md:grid-cols-[1.4fr_1fr] gap-8 items-center overflow-hidden relative">
          <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/10" />
          <div className="absolute -right-4 bottom-0 h-40 w-40 rounded-full bg-white/10" />
          <div className="relative">
            <p className="text-xs font-semibold uppercase tracking-wider text-white/70">Dành cho tài xế</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight">Chạy nhiều khách hơn trên mỗi chuyến</h2>
            <p className="mt-3 text-white/80 max-w-lg">
              Nhận nhóm ghép đã tối ưu lộ trình, GPS chạy nền, thu nhập về ví ngay khi hoàn thành và rút về ngân hàng bất cứ lúc nào.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <LinkButton href="/login?mode=register&role=DRIVER" size="lg" className="bg-white text-brand-800 hover:bg-brand-50">
                Đăng ký làm tài xế
              </LinkButton>
            </div>
          </div>
          <ul className="relative grid gap-3 text-sm">
            {["Hoa hồng minh bạch 20%", "Ca làm việc & KPI theo thời gian thực", "Ứng dụng tài xế iOS / Android"].map((t) => (
              <li key={t} className="flex items-center gap-3 rounded-xl bg-white/10 ring-1 ring-white/15 px-4 py-3">
                <span className="h-6 w-6 rounded-full bg-white/20 flex items-center justify-center">
                  <Icon.check className="h-3.5 w-3.5" />
                </span>
                {t}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <p className="text-center text-xs text-ink-400 pb-8">
        <Link href="/login" className="link">Đăng nhập</Link> để đặt xe, nhận chuyến hoặc quản trị đội xe.
      </p>
    </div>
  );
}

/** Stylised "trip card on a map" — pure SVG/CSS, no assets. */
function HeroIllustration() {
  return (
    <div className="relative hidden lg:block fade-up" style={{ animationDelay: "120ms" }}>
      <div className="relative rounded-3xl bg-white/5 ring-1 ring-white/10 p-4 backdrop-blur-sm">
        <div className="rounded-2xl bg-[#1c2340] overflow-hidden relative h-[380px]">
          <svg viewBox="0 0 520 380" className="absolute inset-0 h-full w-full" aria-hidden>
            <defs>
              <pattern id="hg" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M40 0H0v40" fill="none" stroke="rgba(255,255,255,0.06)" />
              </pattern>
            </defs>
            <rect width="520" height="380" fill="url(#hg)" />
            <path d="M-20 300 C 120 280, 180 200, 300 180 S 480 120, 560 60" stroke="rgba(255,255,255,0.08)" strokeWidth="26" fill="none" strokeLinecap="round" />
            <path d="M60 -20 C 80 120, 200 160, 220 400" stroke="rgba(255,255,255,0.06)" strokeWidth="18" fill="none" />
            <path d="M80 300 C 160 270, 200 210, 300 190 S 440 140, 470 80" stroke="#16ad90" strokeWidth="5" fill="none" strokeLinecap="round" strokeDasharray="0" />
            <circle cx="80" cy="300" r="10" fill="#16ad90" stroke="#fff" strokeWidth="3" />
            <circle cx="300" cy="190" r="9" fill="#fbbf24" stroke="#fff" strokeWidth="3" />
            <circle cx="470" cy="80" r="10" fill="#ea580c" stroke="#fff" strokeWidth="3" />
            <g transform="translate(205 232) rotate(-30)">
              <circle r="15" fill="#fff" />
              <path d="M0 -8 L6 6 L0 3 L-6 6 Z" fill="#0b8c75" />
            </g>
          </svg>
          <div className="absolute left-5 top-5 rounded-xl bg-white text-ink-900 shadow-[var(--shadow-float)] px-4 py-3 text-sm w-60">
            <p className="text-[11px] text-ink-500">Tài xế đang tới</p>
            <p className="font-semibold">Nguyễn Văn An · 51H-123.45</p>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-xs text-ink-500">Toyota Vios · 4.9 ★</span>
              <span className="badge bg-brand-50 text-brand-800">3 phút</span>
            </div>
          </div>
          <div className="absolute right-5 bottom-5 rounded-xl bg-white text-ink-900 shadow-[var(--shadow-float)] px-4 py-3 text-sm w-64">
            <div className="flex items-center gap-2">
              <LogoMark size={22} />
              <p className="font-semibold">Xe ghép · 2 khách</p>
            </div>
            <div className="mt-2 flex items-end justify-between">
              <div>
                <p className="text-[11px] text-ink-500 line-through">61.200 đ</p>
                <p className="text-xl font-bold text-brand-700">45.900 đ</p>
              </div>
              <span className="badge bg-amber-50 text-amber-800">Tiết kiệm 25%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
