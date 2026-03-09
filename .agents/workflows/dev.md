---
description: motephon開発ワークフロー - ビルド・テスト・デプロイの手順
---

// turbo-all

# motephon 開発ワークフロー

## 環境確認

1. dev serverが起動しているか確認

```powershell
npm run dev
```

## DB接続検証 (PowerShell)

1. usersテーブル確認:

```powershell
Invoke-RestMethod -Uri "https://qyryfgvijamhrigpwgua.supabase.co/rest/v1/users?select=id,virtual_email,display_name&limit=10" -Headers @{ "apikey" = $env:SUPABASE_SERVICE_ROLE_KEY; "Authorization" = "Bearer $env:SUPABASE_SERVICE_ROLE_KEY" } | ConvertTo-Json
```

2. messagesテーブル確認:

```powershell
Invoke-RestMethod -Uri "https://qyryfgvijamhrigpwgua.supabase.co/rest/v1/messages?select=id,sender_email,receiver_email,subject&limit=10&order=created_at.desc" -Headers @{ "apikey" = $env:SUPABASE_SERVICE_ROLE_KEY; "Authorization" = "Bearer $env:SUPABASE_SERVICE_ROLE_KEY" } | ConvertTo-Json
```

## ビルド＆プッシュ

1. TypeScriptチェック:

```powershell
npx tsc --noEmit
```

2. プロダクションビルド:

```powershell
npm run build
```

3. Git記録:

```powershell
git add -A; git commit -m "feat: [変更内容]"; git push
```

## SQLマイグレーション適用

Supabase Dashboard > SQL Editor で `supabase/migrations/` 内のSQLを実行。

## キー情報

- Supabase URL: `https://qyryfgvijamhrigpwgua.supabase.co`
- Supabase Anon Key: `.env.local` 参照
- Supabase Service Role Key: `.env.local` 参照
- Google API Key: `.env.local` 参照
