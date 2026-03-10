# motephon

2000年代初頭の写メール体験を完全再現したP2Pメッセージングアプリ。

## 技術スタック

- **Frontend**: Next.js 16 + TypeScript
- **Backend/DB**: Supabase (Auth + PostgreSQL)
- **AI**: Google Gemini API (NPC返信)

## セットアップ

```bash
npm install
cp .env.local.example .env.local  # 環境変数を設定
npm run dev
```

## 機能

- ガラケーUI (STN/TFT液晶エフェクト)
- トグル入力 (マルチタップ方式: あ→い→う)
- NPC写メール (☆ﾏｷ☆ / ★ＴＡＫＵ★)
- Supabase認証 + リアルタイムメッセージ
- Floyd-Steinbergディザリング画像処理
