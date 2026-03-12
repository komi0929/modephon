import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { NPC_GYARU, NPC_GYARUO } from "@/lib/npcCharacters";
import { createClient } from "@supabase/supabase-js";

const genAI = process.env.GOOGLE_API_KEY
  ? new GoogleGenerativeAI(process.env.GOOGLE_API_KEY)
  : null;

// サーバーサイドでDB直接操作用のSupabaseクライアント
function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function POST(request: NextRequest) {
  try {
    const { npcEmail, userMessage, senderEmail } = await request.json();

    // Find NPC
    const npc =
      npcEmail === NPC_GYARU.email
        ? NPC_GYARU
        : npcEmail === NPC_GYARUO.email
        ? NPC_GYARUO
        : null;

    if (!npc) {
      return NextResponse.json(
        { error: "Unknown NPC" },
        { status: 400 }
      );
    }

    // Generate reply
    let reply: string;

    if (genAI) {
      try {
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
        const prompt = `${npc.systemPrompt}\n\n---\nユーザーからのメール:\n${userMessage}\n\n上記のメールに対して、キャラクターとして返信してください。200文字以内で。`;
        const result = await model.generateContent(prompt);
        reply = result.response.text();
      } catch (aiError) {
        console.error("Gemini API error:", aiError);
        reply = getFallbackReply(npcEmail);
      }
    } else {
      reply = getFallbackReply(npcEmail);
    }

    // 10分後に配信されるようにDB直接INSERT（deliver_at付き）
    const admin = getAdminClient();
    if (admin && senderEmail) {
      const delayMs = 600000; // 10分
      const jitter = delayMs * 0.2;
      const actualDelay = delayMs - jitter + Math.random() * jitter * 2;
      const deliverAt = new Date(Date.now() + actualDelay).toISOString();

      await admin.from("messages").insert({
        sender_email: npc.email,
        receiver_email: senderEmail,
        subject: `Re: ${userMessage.slice(0, 20)}`,
        body: reply,
        is_read: false,
        deliver_at: deliverAt,
      });

      return NextResponse.json({ reply, persisted: true, deliver_at: deliverAt });
    }

    // DBなしの場合はクライアント側で処理
    return NextResponse.json({ reply, persisted: false });
  } catch (error) {
    console.error("NPC API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

function getFallbackReply(npcEmail: string): string {
  const isGyaru = npcEmail === NPC_GYARU.email;
  const fallbackReplies = isGyaru
    ? [
        `ぇ～ﾏﾁﾞで!?\nｳｹﾙんだけどww\n\nまたﾒｰﾙしてねぇ♪\n(^_^)v☆`,
        `ぉ返事ｷﾀ━(≧∇≦)━!!\nﾁｮｰ嬉しぃ～♪\n\nぁたしも今\n渋谷にぃるょ～\n(*^o^*)`,
        `ﾏﾁﾞﾏﾁﾞ!?\nそれﾔﾊﾞくなぃ!?\nwww\n\nﾌﾟﾘ撮ってくるね♪\n(^_-)☆`,
      ]
    : [
        `ﾏﾁﾞかょ～!!\nｳｹﾙww\n\nまたﾒｰﾙ\nしてこいよ～!\n('-'*)`,
        `ｵｯｽ!!\n返事ﾄﾞｰﾓ!!\n\nﾁｮｰいい感じ\nじゃね!?\n(\`・ω・´)`,
        `ﾔﾍﾞｰ!!\nそれﾏﾁﾞ最高!!\nwww\n\n俺も今から\n出かけるし!\n(^-^)`,
      ];
  return fallbackReplies[Math.floor(Math.random() * fallbackReplies.length)];
}
