"use client";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="ja">
      <body style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)",
        color: "#aaa",
        fontFamily: '"MisakiGothic", "ＭＳ ゴシック", monospace',
        textAlign: "center",
        padding: 24,
        gap: 12,
        margin: 0,
      }}>
        <div style={{ fontSize: 48, marginBottom: 8 }}>⚡</div>
        <div style={{ fontSize: 16, color: "#fff", fontWeight: "bold" }}>通信エラー</div>
        <div style={{ fontSize: 11, opacity: 0.6, lineHeight: 1.8 }}>
          ｻｰﾊﾞｰ接続に失敗しました<br />
          (500 Internal Error)
        </div>
        <button
          onClick={() => reset()}
          style={{
            marginTop: 16,
            fontSize: 10,
            border: "1px solid #444",
            borderRadius: 3,
            padding: "8px 16px",
            cursor: "pointer",
            color: "#6688cc",
            background: "transparent",
            fontFamily: "inherit",
          }}
        >
          🔄 再接続する
        </button>
        <div style={{ fontSize: 8, opacity: 0.3, marginTop: 16 }}>modephon</div>
      </body>
    </html>
  );
}
