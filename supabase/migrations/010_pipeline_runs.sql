-- NOIRAX Database Schema
-- Migration 010: persistent pipeline run log (self-monitoring)

CREATE TABLE IF NOT EXISTS public.pipeline_runs (
  id BIGSERIAL PRIMARY KEY,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  status VARCHAR(20) NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'ok', 'error')),
  signals_created INT NOT NULL DEFAULT 0,
  verified_count INT NOT NULL DEFAULT 0,
  pending_before INT NOT NULL DEFAULT 0,
  error_message TEXT,
  env_ok JSONB DEFAULT '{}',
  run_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_pipeline_runs_started ON public.pipeline_runs(started_at DESC);

ALTER TABLE public.pipeline_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Pipeline runs public read" ON public.pipeline_runs;
CREATE POLICY "Pipeline runs public read" ON public.pipeline_runs
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Service role manages pipeline runs" ON public.pipeline_runs;
CREATE POLICY "Service role manages pipeline runs" ON public.pipeline_runs
  FOR ALL USING (auth.role() = 'service_role');