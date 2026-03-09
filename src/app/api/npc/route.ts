import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { NPC_GYARU, NPC_GYARUO } from "@/lib/npcCharacters";

const genAI = process.env.GOOGLE_API_KEY
  ? new GoogleGenerativeAI(process.env.GOOGLE_API_KEY)
  : null;

export async function POST(request: NextRequest) {
  try {
    const { npcEmail, userMessage } = await request.json();

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

    // Try Gemini API
    if (genAI) {
      try {
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
        const prompt = `${npc.systemPrompt}\n\n---\nユーザーからのメール:\n${userMessage}\n\n上記のメールに対して、キャラクターとして返信してください。200文字以内で。`;

        const result = await model.generateContent(prompt);
        const reply = result.response.text();

        return NextResponse.json({ reply });
      } catch (aiError) {
        console.error("Gemini API error:", aiError);
        // Fall through to fallback
      }
    }

    // Fallback replies
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

    const reply =
      fallbackReplies[Math.floor(Math.random() * fallbackReplies.length)];

    return NextResponse.json({ reply });
  } catch (error) {
    console.error("NPC API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
