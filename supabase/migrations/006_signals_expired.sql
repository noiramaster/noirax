-- NOIRAX Database Schema
-- Migration 006: allow 'expired' as a signal resolution state.
-- Stale pending signals (older than SIGNALS_MAX_AGE_DAYS, default 7) are marked
-- 'expired' by the pipeline instead of lingering forever in the track record.

ALTER TABLE public.signals DROP CONSTRAINT IF EXISTS signals_resolved_result_check;
ALTER TABLE public.signals
  ADD CONSTRAINT signals_resolved_result_check
  CHECK (resolved_result IN ('win', 'loss', 'pending', 'expired'));
