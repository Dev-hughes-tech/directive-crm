-- ============================================================
-- DIRECTIVE CRM — Supabase Setup
-- Run this in your Supabase SQL Editor (supabase.com → project → SQL Editor)
-- ============================================================

-- 1. Create profiles table
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  role TEXT NOT NULL DEFAULT 'trial'
    CHECK (role IN ('admin','enterprise_manager','enterprise_rep','pro','plus','basic','trial')),
  company_name TEXT,
  plan_expires_at TIMESTAMPTZ,
  manager_id UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Enable Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Users can only read/write their own profile
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Admins can see all profiles
CREATE POLICY "Admins can view all profiles" ON profiles
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- 3. Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role)
  VALUES (NEW.id, NEW.email, 'trial')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ============================================================
-- SET YOURSELF AS ADMIN
-- Replace the email below with YOUR email address
-- ============================================================
UPDATE profiles
SET role = 'admin'
WHERE email = 'mazeratirecords@gmail.com';

-- If your account doesn't exist in profiles yet (sign up first), use this:
INSERT INTO profiles (id, email, role)
SELECT id, email, 'admin'
FROM auth.users
WHERE email = 'mazeratirecords@gmail.com'
ON CONFLICT (id) DO UPDATE SET role = 'admin';


-- ============================================================
-- VERIFY — Should show your account with role = 'admin'
-- ============================================================
SELECT id, email, role, created_at FROM profiles;
