import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// 6桁のワンタイムコード生成（数字のみ、覚えやすい）
function generateCode(): string {
  const chars = "0123456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// POST: 赤外線送信（コード発行）
export async function POST(request: NextRequest) {
  try {
    const { senderEmail, senderName } = await request.json();
    if (!senderEmail) {
      return NextResponse.json({ error: "Missing sender" }, { status: 400 });
    }

    const admin = getAdminClient();
    if (!admin) {
      // デモモード: ローカルコード生成
      return NextResponse.json({ code: generateCode(), expiresIn: 120 });
    }

    // 期限切れのコードを掃除
    await admin
      .from("infrared_exchanges")
      .delete()
      .lt("expires_at", new Date().toISOString());

    // 既存の未使用コードがあれば再利用
    const { data: existing } = await admin
      .from("infrared_exchanges")
      .select("code, expires_at")
      .eq("sender_email", senderEmail)
      .is("claimed_by", null)
      .gt("expires_at", new Date().toISOString())
      .limit(1);

    if (existing && existing.length > 0) {
      const remainingSec = Math.round(
        (new Date(existing[0].expires_at).getTime() - Date.now()) / 1000
      );
      return NextResponse.json({
        code: existing[0].code,
        expiresIn: remainingSec,
      });
    }

    // 新しいコードを発行（2分間有効）
    const code = generateCode();
    const expiresAt = new Date(Date.now() + 120000).toISOString(); // 2分

    const { error } = await admin.from("infrared_exchanges").insert({
      code,
      sender_email: senderEmail,
      sender_name: senderName || senderEmail.split("@")[0],
      expires_at: expiresAt,
    });

    if (error) {
      // コード衝突時はリトライ
      const retryCode = generateCode();
      await admin.from("infrared_exchanges").insert({
        code: retryCode,
        sender_email: senderEmail,
        sender_name: senderName || senderEmail.split("@")[0],
        expires_at: expiresAt,
      });
      return NextResponse.json({ code: retryCode, expiresIn: 120 });
    }

    return NextResponse.json({ code, expiresIn: 120 });
  } catch (error) {
    console.error("Infrared send error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// GET: 赤外線受信（コードで相手を検索）
export async function GET(request: NextRequest) {
  try {
    const code = request.nextUrl.searchParams.get("code");
    const receiverEmail = request.nextUrl.searchParams.get("receiver");

    if (!code) {
      return NextResponse.json({ error: "Missing code" }, { status: 400 });
    }

    const admin = getAdminClient();
    if (!admin) {
      return NextResponse.json({ error: "DB not available" }, { status: 503 });
    }

    // コードを検索（有効期限内 & 未使用）
    const { data } = await admin
      .from("infrared_exchanges")
      .select("*")
      .eq("code", code)
      .is("claimed_by", null)
      .gt("expires_at", new Date().toISOString())
      .limit(1);

    if (!data || data.length === 0) {
      return NextResponse.json({
        found: false,
        message: "コードが見つかりません。期限切れか、すでに使用済みです。",
      });
    }

    const exchange = data[0];

    // 自分自身のコードは使用不可
    if (exchange.sender_email === receiverEmail) {
      return NextResponse.json({
        found: false,
        message: "自分のコードは使えません",
      });
    }

    // クレーム（使用済みにする）
    await admin
      .from("infrared_exchanges")
      .update({ claimed_by: receiverEmail || "unknown" })
      .eq("id", exchange.id);

    return NextResponse.json({
      found: true,
      sender: {
        email: exchange.sender_email,
        name: exchange.sender_name,
      },
    });
  } catch (error) {
    console.error("Infrared receive error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
