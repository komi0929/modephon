import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// POST: 招待コード発行（24時間有効）
export async function POST(request: NextRequest) {
  try {
    const { inviterEmail, inviterName } = await request.json();
    if (typeof inviterEmail !== "string" || inviterEmail.length > 100) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const admin = getAdminClient();
    if (!admin) {
      // デモモード
      const code = randomUUID().slice(0, 8);
      return NextResponse.json({ code, url: `${request.nextUrl.origin}?invite=${code}` });
    }

    // 期限切れの招待を掃除
    await admin.from("invitations").delete().lt("expires_at", new Date().toISOString());

    // 既存の未使用招待があれば再利用
    const { data: existing } = await admin
      .from("invitations")
      .select("code, expires_at")
      .eq("inviter_email", inviterEmail)
      .is("claimed_by", null)
      .gt("expires_at", new Date().toISOString())
      .limit(1);

    if (existing && existing.length > 0) {
      const code = existing[0].code;
      return NextResponse.json({ code, url: `${request.nextUrl.origin}?invite=${code}` });
    }

    // 新しい招待コードを発行（24時間有効）
    const code = randomUUID().slice(0, 8);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    await admin.from("invitations").insert({
      code,
      inviter_email: inviterEmail,
      inviter_name: inviterName || inviterEmail.split("@")[0],
      expires_at: expiresAt,
    });

    return NextResponse.json({ code, url: `${request.nextUrl.origin}?invite=${code}` });
  } catch {
    console.error("Invite create error");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// GET: 招待コード検証 + 相互連絡先登録
export async function GET(request: NextRequest) {
  try {
    const code = request.nextUrl.searchParams.get("code");
    const claimerEmail = request.nextUrl.searchParams.get("claimer");
    const claimerName = request.nextUrl.searchParams.get("claimerName");

    if (!code || typeof code !== "string") {
      return NextResponse.json({ error: "Invalid code" }, { status: 400 });
    }

    const admin = getAdminClient();
    if (!admin) {
      return NextResponse.json({ error: "DB not available" }, { status: 503 });
    }

    // コードを検索（有効期限内 & 未使用）
    const { data } = await admin
      .from("invitations")
      .select("*")
      .eq("code", code)
      .is("claimed_by", null)
      .gt("expires_at", new Date().toISOString())
      .limit(1);

    if (!data || data.length === 0) {
      return NextResponse.json({
        valid: false,
        message: "招待リンクが見つかりません。期限切れか、すでに使用済みです。",
      });
    }

    const invitation = data[0];

    // claimerEmailがある場合は相互連絡先登録
    if (claimerEmail) {
      // 自分自身の招待は無効
      if (invitation.inviter_email === claimerEmail) {
        return NextResponse.json({ valid: false, message: "自分の招待リンクは使えません" });
      }

      // 招待を使用済みにする
      await admin
        .from("invitations")
        .update({ claimed_by: claimerEmail })
        .eq("id", invitation.id);

      // 相互連絡先登録（inviter → claimer）
      await admin.from("contacts").upsert({
        owner_email: invitation.inviter_email,
        contact_email: claimerEmail,
        contact_name: claimerName || claimerEmail.split("@")[0],
      }, { onConflict: "owner_email,contact_email" });

      // 相互連絡先登録（claimer → inviter）
      await admin.from("contacts").upsert({
        owner_email: claimerEmail,
        contact_email: invitation.inviter_email,
        contact_name: invitation.inviter_name || invitation.inviter_email.split("@")[0],
      }, { onConflict: "owner_email,contact_email" });

      return NextResponse.json({
        valid: true,
        claimed: true,
        inviter: {
          email: invitation.inviter_email,
          name: invitation.inviter_name,
        },
      });
    }

    // claimerEmailなし → 検証のみ
    return NextResponse.json({
      valid: true,
      claimed: false,
      inviter: {
        email: invitation.inviter_email,
        name: invitation.inviter_name,
      },
    });
  } catch {
    console.error("Invite verify error");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
