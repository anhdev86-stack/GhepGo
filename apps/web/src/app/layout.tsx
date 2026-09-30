import type { Metadata, Viewport } from "next";
import { Be_Vietnam_Pro, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/contexts/auth-context";
import { AppShell } from "@/components/app-shell";

const brandFont = Be_Vietnam_Pro({
  variable: "--font-brand",
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

const monoFont = JetBrains_Mono({
  variable: "--font-brand-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "GhepGo – Đặt xe & ghép xe thông minh", template: "%s · GhepGo" },
  description: "Đặt xe riêng hoặc ghép xe cùng hướng, tiết kiệm tới 25%. Theo dõi tài xế realtime, thanh toán ví, VNPay, MoMo.",
  applicationName: "GhepGo",
};

export const viewport: Viewport = {
  themeColor: "#0b8c75",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="vi" className={`${brandFont.variable} ${monoFont.variable}`}>
      <body className="min-h-screen antialiased">
        <AuthProvider>
          <AppShell>{children}</AppShell>
        </AuthProvider>
      </body>
    </html>
  );
}
