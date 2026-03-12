import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    return NextResponse.json({ users: [] });
  }

  const admin = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const query = request.nextUrl.searchParams.get("q") || "";

  // 4桁数字検索 → virtual_email部分一致
  const searchEmail = query ? `${query}@motephon.ne.jp` : "";

  if (searchEmail) {
    // 完全一致検索
    const { data } = await admin
      .from("users")
      .select("virtual_email, display_name, is_npc")
      .eq("virtual_email", searchEmail)
      .limit(1);

    return NextResponse.json({ users: data || [] });
  }

  // 全ユーザー一覧（NPC除外、最新20件）
  const { data } = await admin
    .from("users")
    .select("virtual_email, display_name, is_npc")
    .eq("is_npc", false)
    .order("created_at", { ascending: false })
    .limit(20);

  return NextResponse.json({ users: data || [] });
}
