-- NOIRAX Database Schema
-- Migration 008: per-user paper trading (simulated money, no real exchange)
-- Paper orders must persist across engine runs (each Vercel invocation is a
-- fresh process), so the paper exchange is database-backed.

CREATE TABLE IF NOT EXISTS public.paper_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES public.exchange_connections(id) ON DELETE CASCADE,
  symbol VARCHAR(40) NOT NULL,
  side VARCHAR(4) NOT NULL CHECK (side IN ('buy', 'sell')),
  kind VARCHAR(10) NOT NULL CHECK (kind IN ('entry', 'sl', 'tp')),
  limit_price DECIMAL(20, 8) NOT NULL,
  quantity DECIMAL(20, 8) NOT NULL,
  filled_quantity DECIMAL(20, 8) NOT NULL DEFAULT 0,
  avg_price DECIMAL(20, 8) NOT NULL DEFAULT 0,
  status VARCHAR(10) NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'filled', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_paper_orders_conn ON public.paper_orders(connection_id, created_at);

ALTER TABLE public.paper_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages paper orders" ON public.paper_orders;
CREATE POLICY "Service role manages paper orders" ON public.paper_orders
  FOR ALL USING (auth.role() = 'service_role');
