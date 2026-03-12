-- =============================================
-- motephon v2 Migration: delayed messages + user search
-- =============================================

-- メッセージに配信予定時刻カラム追加（NPC遅延返信用）
ALTER TABLE messages ADD COLUMN IF NOT EXISTS deliver_at TIMESTAMPTZ DEFAULT now();

-- deliver_at のインデックス
CREATE INDEX IF NOT EXISTS idx_messages_deliver_at ON messages(deliver_at);

-- RLSポリシー更新: deliver_at が現在時刻以降のメッセージは表示しない
DROP POLICY IF EXISTS "Users can view received messages" ON messages;
CREATE POLICY "Users can view received messages" ON messages
  FOR SELECT USING (
    deliver_at <= now() AND (
      receiver_email IN (SELECT virtual_email FROM users WHERE id = auth.uid())
      OR sender_email IN (SELECT virtual_email FROM users WHERE id = auth.uid())
    )
  );

-- ユーザー検索用: 全ユーザーの virtual_email と display_name を閲覧可能にする
-- (既存の "Users can view all users" ポリシーがあるので追加不要)
