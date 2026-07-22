-- NOIRAX Database Schema
-- Migration 003: Fundamental signals + dual TP/SL levels

-- Add fundamental_signals tags array
ALTER TABLE public.signals
  ADD COLUMN IF NOT EXISTS fundamental_signals TEXT[] DEFAULT '{}';

-- Add dual TP/SL columns for free vs premium differentiation
ALTER TABLE public.signals
  ADD COLUMN IF NOT EXISTS stop_loss_conservative DECIMAL(20, 8),
  ADD COLUMN IF NOT EXISTS take_profit_1_conservative DECIMAL(20, 8),
  ADD COLUMN IF NOT EXISTS stop_loss_optimized DECIMAL(20, 8),
  ADD COLUMN IF NOT EXISTS take_profit_1_optimized DECIMAL(20, 8),
  ADD COLUMN IF NOT EXISTS take_profit_2_optimized DECIMAL(20, 8),
  ADD COLUMN IF NOT EXISTS take_profit_3_optimized DECIMAL(20, 8);

-- Index for fundamental signals queries
CREATE INDEX IF NOT EXISTS idx_signals_fundamental ON public.signals USING GIN(fundamental_signals);
