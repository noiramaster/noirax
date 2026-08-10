-- NOIRAX Database Schema
-- Migration 007: Real order execution (engine, protections, audit, dedupe)

-- 1. Connections: testnet/paper flag
ALTER TABLE public.exchange_connections
  ADD COLUMN IF NOT EXISTS testnet BOOLEAN NOT NULL DEFAULT false;

-- 2. auto_trades: extend for execution lifecycle
ALTER TABLE public.auto_trades DROP CONSTRAINT IF EXISTS auto_trades_status_check;
ALTER TABLE public.auto_trades
  ADD CONSTRAINT auto_trades_status_check
  CHECK (status IN ('pending', 'open', 'closed', 'cancelled', 'expired', 'failed'));

ALTER TABLE public.auto_trades
  ADD COLUMN IF NOT EXISTS approval_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS entry_sl_price DECIMAL(20, 8),
  ADD COLUMN IF NOT EXISTS entry_tp_prices DECIMAL(20, 8)[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS mode VARCHAR(20),
  ADD COLUMN IF NOT EXISTS closed_reason VARCHAR(20),
  ADD COLUMN IF NOT EXISTS exec_error TEXT,
  ADD COLUMN IF NOT EXISTS symbol_base VARCHAR(20),
  ADD COLUMN IF NOT EXISTS testnet BOOLEAN NOT NULL DEFAULT false;

-- 3. Trading events: audit log + alert source
CREATE TABLE IF NOT EXISTS public.trading_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  connection_id UUID,
  trade_id UUID,
  event_type VARCHAR(50) NOT NULL,
  level VARCHAR(10) NOT NULL DEFAULT 'info' CHECK (level IN ('info', 'warn', 'error', 'critical')),
  message TEXT,
  meta JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_trading_events_created ON public.trading_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trading_events_type ON public.trading_events(event_type, created_at DESC);

-- 4. Executed signals: dedupe so each user executes each signal at most once
CREATE TABLE IF NOT EXISTS public.executed_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  signal_id UUID NOT NULL,
  connection_id UUID,
  trade_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, signal_id)
);

-- 5. RLS
ALTER TABLE public.trading_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.executed_signals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own events" ON public.trading_events;
CREATE POLICY "Users read own events" ON public.trading_events
  FOR SELECT USING (auth.uid() = user_id OR auth.role() = 'service_role');
DROP POLICY IF EXISTS "Service role manages events" ON public.trading_events;
CREATE POLICY "Service role manages events" ON public.trading_events
  FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role manages executed signals" ON public.executed_signals;
CREATE POLICY "Service role manages executed signals" ON public.executed_signals
  FOR ALL USING (auth.role() = 'service_role');

-- 6. Engine configuration (env vars override these)
INSERT INTO public.app_settings (key, value) VALUES
  ('trading.engine_enabled', 'true'),
  ('trading.safety_mode', 'true'),
  ('trading.safety_max_pct', '3'),
  ('trading.safety_trade_count', '10'),
  ('trading.safety_days', '7'),
  ('trading.execution_tolerance_pct', '1.0')
ON CONFLICT (key) DO NOTHING;
