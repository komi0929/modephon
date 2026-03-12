import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "modephon - 写ﾒｰﾙ体験",
  description:
    "2000年代初頭の写メール体験を完全再現したP2Pメッセージングアプリ",
  manifest: "/manifest.json",
  icons: {
    icon: "/icon-512x512.png",
    apple: "/icon-512x512.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "modephon",
  },
  openGraph: {
    title: "modephon",
    description: "レトロ携帯写メール体験",
    type: "website",
    url: "https://modephon.vercel.app",
    images: [{ url: "/ogp.png", width: 1200, height: 630, alt: "modephon - 写メール体験" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "modephon",
    description: "2000年代初頭の写メール体験を完全再現",
    images: ["/ogp.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#4466cc",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <head>
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body>
        {children}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', () => {
                  navigator.serviceWorker.register('/sw.js').catch(() => {});
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
