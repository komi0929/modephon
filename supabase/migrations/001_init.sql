-- =============================================
-- motephon Database Schema
-- =============================================

-- ユーザーテーブル
CREATE TABLE IF NOT EXISTS users (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  virtual_email TEXT UNIQUE NOT NULL,
  display_name TEXT,
  is_npc BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- メッセージテーブル
CREATE TABLE IF NOT EXISTS messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_email TEXT NOT NULL,
  receiver_email TEXT NOT NULL,
  subject TEXT DEFAULT '',
  body TEXT DEFAULT '',
  image_url TEXT,
  image_size_kb INTEGER,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_messages_receiver ON messages(receiver_email);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_email);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(virtual_email);

-- RLS有効化
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- RLSポリシー: ユーザー
CREATE POLICY "Users can view all users" ON users
  FOR SELECT USING (true);

CREATE POLICY "Users can update own profile" ON users
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON users
  FOR INSERT WITH CHECK (auth.uid() = id);

-- RLSポリシー: メッセージ
CREATE POLICY "Users can view received messages" ON messages
  FOR SELECT USING (
    receiver_email IN (SELECT virtual_email FROM users WHERE id = auth.uid())
    OR sender_email IN (SELECT virtual_email FROM users WHERE id = auth.uid())
  );

CREATE POLICY "Users can send messages" ON messages
  FOR INSERT WITH CHECK (
    sender_email IN (SELECT virtual_email FROM users WHERE id = auth.uid())
  );

CREATE POLICY "Users can mark messages as read" ON messages
  FOR UPDATE USING (
    receiver_email IN (SELECT virtual_email FROM users WHERE id = auth.uid())
  );

-- NPCアカウント初期データ
INSERT INTO users (id, virtual_email, display_name, is_npc)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'maki@j-phone.ne.jp', '☆ﾏｷ☆', true),
  ('00000000-0000-0000-0000-000000000002', 'takuya@j-phone.ne.jp', '★ＴＡＫＵ★', true)
ON CONFLICT (virtual_email) DO NOTHING;

-- リアルタイム有効化
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
