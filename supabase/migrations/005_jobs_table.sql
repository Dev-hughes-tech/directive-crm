-- Migration 005: Jobs, Insurance Claims, Job Photos tables
-- Run in Supabase SQL editor: https://supabase.com/dashboard/project/smvnidiybgdkbhzbldph/sql

-- ── JOBS ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS jobs (
  id                  TEXT PRIMARY KEY,
  owner_id            UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  property_id         TEXT,
  client_id           TEXT,
  proposal_id         TEXT,
  stage               TEXT NOT NULL DEFAULT 'sold',
  title               TEXT NOT NULL DEFAULT '',
  address             TEXT NOT NULL DEFAULT '',
  owner_name          TEXT,
  contract_amount     NUMERIC(12,2),
  contract_signed_at  TIMESTAMPTZ,
  permit_number       TEXT,
  permit_applied_at   TIMESTAMPTZ,
  permit_approved_at  TIMESTAMPTZ,
  scheduled_date      DATE,
  crew_lead           TEXT,
  crew_members        TEXT[]  NOT NULL DEFAULT '{}',
  started_at          TIMESTAMPTZ,
  completed_at        TIMESTAMPTZ,
  invoice_number      TEXT,
  invoice_sent_at     TIMESTAMPTZ,
  amount_collected    NUMERIC(12,2),
  collected_at        TIMESTAMPTZ,
  notes               TEXT    NOT NULL DEFAULT '',
  photos              JSONB   NOT NULL DEFAULT '[]',
  insurance           JSONB,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "jobs_owner_all" ON jobs
  USING (
    owner_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'enterprise_manager')
    )
  )
  WITH CHECK (
    owner_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'enterprise_manager')
    )
  );

-- Enterprise reps can read/write jobs owned by their manager's org
CREATE POLICY "jobs_enterprise_rep" ON jobs
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN profiles mgr ON mgr.id = p.manager_id
      WHERE p.id = auth.uid()
        AND p.role = 'enterprise_rep'
        AND mgr.id = jobs.owner_id
    )
  );

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_jobs_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER jobs_updated_at
  BEFORE UPDATE ON jobs
  FOR EACH ROW EXECUTE FUNCTION update_jobs_updated_at();

-- ── INDEXES ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS jobs_owner_id_idx   ON jobs(owner_id);
CREATE INDEX IF NOT EXISTS jobs_stage_idx       ON jobs(stage);
CREATE INDEX IF NOT EXISTS jobs_property_id_idx ON jobs(property_id);
CREATE INDEX IF NOT EXISTS jobs_created_at_idx  ON jobs(created_at DESC);
