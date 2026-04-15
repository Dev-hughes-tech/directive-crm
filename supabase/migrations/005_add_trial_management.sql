-- ============================================================
-- Migration 005: Add trial management columns to profiles
-- ============================================================
-- Add trial_ends_at, full_name (if missing), and invited_by columns
-- for managing 7-day trial accounts and admin invitations.
-- ============================================================

-- Add columns to profiles table
alter table profiles add column if not exists trial_ends_at timestamptz;
alter table profiles add column if not exists full_name text;
alter table profiles add column if not exists invited_by uuid references auth.users(id) on delete set null;

-- Create index on trial_ends_at for efficient expiry checks
create index if not exists profiles_trial_ends_at_idx on profiles (trial_ends_at) where trial_ends_at is not null;

-- ============================================================
-- Manual SQL examples for admin use:
-- ============================================================
-- To manually grant a 7-day trial to an existing user:
-- UPDATE profiles SET role = 'trial', trial_ends_at = now() + interval '7 days'
-- WHERE email = 'chris.williams@example.com';
--
-- To invite a user via the admin panel (app/page.tsx):
-- 1. Go to Settings → User Management (admin only)
-- 2. Enter email, name "Chris Williams", role "Trial"
-- 3. Click "Invite User" — they'll receive an email invite
-- ============================================================
