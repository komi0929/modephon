-- =============================================
-- motephon v4 Migration: contacts + invitations
-- =============================================

-- 連絡先テーブル（ユーザーごとのアドレス帳）
CREATE TABLE IF NOT EXISTS contacts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_email TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  contact_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(owner_email, contact_email)
);

-- 招待リンクテーブル
CREATE TABLE IF NOT EXISTS invitations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  inviter_email TEXT NOT NULL,
  inviter_name TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  claimed_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_contacts_owner ON contacts(owner_email);
CREATE INDEX IF NOT EXISTS idx_contacts_pair ON contacts(owner_email, contact_email);
CREATE INDEX IF NOT EXISTS idx_invitations_code ON invitations(code);
CREATE INDEX IF NOT EXISTS idx_invitations_expires ON invitations(expires_at);

-- RLS有効化
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

-- contacts RLSポリシー
CREATE POLICY "Users can view own contacts" ON contacts
  FOR SELECT USING (
    owner_email IN (SELECT virtual_email FROM users WHERE id = auth.uid())
  );

CREATE POLICY "Users can add contacts" ON contacts
  FOR INSERT WITH CHECK (
    owner_email IN (SELECT virtual_email FROM users WHERE id = auth.uid())
  );

CREATE POLICY "Users can delete contacts" ON contacts
  FOR DELETE USING (
    owner_email IN (SELECT virtual_email FROM users WHERE id = auth.uid())
  );

-- invitations RLSポリシー（誰でも作成・閲覧可能、コードで認証）
CREATE POLICY "Anyone can create invitations" ON invitations
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can view invitations" ON invitations
  FOR SELECT USING (true);

CREATE POLICY "Anyone can claim invitations" ON invitations
  FOR UPDATE USING (true);
