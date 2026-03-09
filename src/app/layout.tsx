import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "motephon - 写ﾒｰﾙ体験",
  description:
    "2000年代初頭のJ-Phone写メール体験を完全再現したP2Pメッセージングアプリ",
  openGraph: {
    title: "motephon",
    description: "レトロ携帯写メール体験",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body>{children}</body>
    </html>
  );
}
