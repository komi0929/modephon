import Link from "next/link";

export default function NotFound() {
  return (
    <div style={{
      minHeight: "100dvh",
      display: "flex",
      flexDirection: "column" as const,
      alignItems: "center",
      justifyContent: "center",
      background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)",
      color: "#aaa",
      fontFamily: '"MisakiGothic", "ＭＳ ゴシック", monospace',
      textAlign: "center" as const,
      padding: 24,
      gap: 12,
    }}>
      <div style={{ fontSize: 48, marginBottom: 8 }}>📵</div>
      <div style={{ fontSize: 16, color: "#fff", fontWeight: "bold" }}>圏外</div>
      <div style={{ fontSize: 11, opacity: 0.6, lineHeight: 1.8 }}>
        ﾍﾟｰｼﾞが見つかりません<br />
        (404 Not Found)
      </div>
      <div style={{
        marginTop: 16,
        fontSize: 10,
        border: "1px solid #444",
        borderRadius: 3,
        padding: "8px 16px",
        cursor: "pointer",
        color: "#6688cc",
      }}>
        <Link href="/" style={{ color: "inherit", textDecoration: "none" }}>📱 ﾄｯﾌﾟへ戻る</Link>
      </div>
      <div style={{ fontSize: 8, opacity: 0.3, marginTop: 16 }}>modephon</div>
    </div>
  );
}
