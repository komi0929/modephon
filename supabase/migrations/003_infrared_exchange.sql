-- =============================================
-- motephon v3 Migration: 赤外線通信（連絡先交換）
-- =============================================

-- 赤外線交換コードテーブル
CREATE TABLE IF NOT EXISTS infrared_exchanges (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  sender_email TEXT NOT NULL,
  sender_name TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  claimed_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_infrared_code ON infrared_exchanges(code);
CREATE INDEX IF NOT EXISTS idx_infrared_expires ON infrared_exchanges(expires_at);

-- RLS有効化
ALTER TABLE infrared_exchanges ENABLE ROW LEVEL SECURITY;

-- 誰でも読み書き可能（コードを知っている人だけがアクセスする前提）
CREATE POLICY "Anyone can create exchange codes" ON infrared_exchanges
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can view exchange codes" ON infrared_exchanges
  FOR SELECT USING (true);

CREATE POLICY "Anyone can claim exchange codes" ON infrared_exchanges
  FOR UPDATE USING (true);
