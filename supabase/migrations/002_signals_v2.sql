-- NOIRAX Database Schema
-- Migration 002: Extended signal fields for v2

ALTER TABLE public.signals
  ADD COLUMN IF NOT EXISTS entry_price_min DECIMAL(20, 8),
  ADD COLUMN IF NOT EXISTS entry_price_max DECIMAL(20, 8),
  ADD COLUMN IF NOT EXISTS take_profit_1 DECIMAL(20, 8),
  ADD COLUMN IF NOT EXISTS take_profit_2 DECIMAL(20, 8),
  ADD COLUMN IF NOT EXISTS take_profit_3 DECIMAL(20, 8),
  ADD COLUMN IF NOT EXISTS risk_reward_ratio DECIMAL(10, 2),
  ADD COLUMN IF NOT EXISTS risk_level VARCHAR(10) CHECK (risk_level IN ('low', 'medium', 'high')),
  ADD COLUMN IF NOT EXISTS indicators_used TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS explanation_pt TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS explanation_fr TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS explanation_de TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS explanation_it TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS explanation_ar TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS slug VARCHAR(255) UNIQUE;

CREATE INDEX IF NOT EXISTS idx_signals_slug ON public.signals(slug);
CREATE INDEX IF NOT EXISTS idx_signals_coin ON public.signals(coin);

-- Drop old single entry/take_profit columns if they exist (non-destructive: keep them)
-- The new fields coexist; pipeline will populate the new ones
