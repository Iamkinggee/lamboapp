-- FILE: infra/aws/supabase_schema.sql
-- Run this in Supabase Dashboard → SQL Editor → New Query
-- Sets up all tables with Row Level Security (RLS)

-- ── PROFILES ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  email        TEXT NOT NULL UNIQUE,
  skill_level  TEXT NOT NULL DEFAULT 'beginner' CHECK (skill_level IN ('beginner','intermediate','advanced')),
  preferences  JSONB DEFAULT '{}',
  fcm_token    TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own profile"   ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

-- ── TRADES ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trades (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  signal_id   TEXT,
  pair        TEXT NOT NULL,
  direction   TEXT NOT NULL CHECK (direction IN ('BUY','SELL')),
  entry       NUMERIC NOT NULL,
  stop_loss   NUMERIC,
  take_profit NUMERIC,
  outcome     TEXT CHECK (outcome IN ('win','loss','pending','break_even')),
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE trades ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own trades" ON trades FOR ALL USING (auth.uid() = user_id);

-- ── CHAT MESSAGES ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chat_messages (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content    TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own chat" ON chat_messages FOR ALL USING (auth.uid() = user_id);

-- ── INDEXES ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_trades_user_id    ON trades(user_id);
CREATE INDEX IF NOT EXISTS idx_trades_created_at ON trades(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_user_id      ON chat_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_created_at   ON chat_messages(created_at ASC);