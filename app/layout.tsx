import type { Metadata, Viewport } from "next";
import Image from "next/image";
import Link from "next/link";

import { ServiceWorkerRegister } from "@/app/components/ServiceWorkerRegister";

import "./globals.css";

export const metadata: Metadata = {
  title: "FRC 9470 Pit Preflight",
  description: "Mobile pit management and match preflight workflow for Team 9470.",
  applicationName: "9470 Pit",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "9470 Pit"
  },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" }
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    shortcut: ["/icon-192.png"]
  }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#d12630"
};

export default function RootLayout({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <html lang="en" >
      <body>
        <div className="nav">
          <div className="nav-inner">
            <Link className="brand" href="/">
              <Image src="/9470-logo.png" alt="Team 9470 logo" width={40} height={40} className="brand-logo" />
              <span className="brand-text">
                FRC <strong>9470</strong> Pit
              </span>
            </Link>
            <div className="nav-links">
              <Link className="nav-link" href="/">
                Dashboard
              </Link>
              <Link className="nav-link" href="/history">
                History
              </Link>
              <Link className="nav-link" href="/settings">
                Settings
              </Link>
            </div>
          </div>
        </div>
        <main>{children}</main>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
