-- NOIRAX Database Schema
-- Migration 005: Auto-trading (exchange connections, commission tracking)

-- 1. Exchange connections (user API keys, encrypted at application layer)
CREATE TABLE IF NOT EXISTS public.exchange_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  exchange VARCHAR(30) NOT NULL,
  api_key_enc TEXT NOT NULL,
  api_secret_enc TEXT NOT NULL,
  key_hint VARCHAR(10) NOT NULL,
  mode VARCHAR(20) NOT NULL DEFAULT 'confirm' CHECK (mode IN ('auto', 'confirm')),
  profile VARCHAR(30) NOT NULL DEFAULT 'moderate'
    CHECK (profile IN ('conservative', 'moderate', 'aggressive', 'small_frequent', 'advanced')),
  position_pct DECIMAL(5, 2) NOT NULL DEFAULT 10,
  daily_loss_limit_pct DECIMAL(5, 2) NOT NULL DEFAULT 5,
  max_positions SMALLINT NOT NULL DEFAULT 5,
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'revoked')),
  paused_reason TEXT,
  last_validation_error TEXT,
  legal_version VARCHAR(10) NOT NULL DEFAULT 'v2',
  legal_accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, exchange)
);

CREATE INDEX IF NOT EXISTS idx_exchange_connections_user ON public.exchange_connections(user_id);

-- 2. Auto trades: execution + commission tracking (filled by the execution phase)
CREATE TABLE IF NOT EXISTS public.auto_trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  connection_id UUID REFERENCES public.exchange_connections(id) ON DELETE SET NULL,
  signal_id UUID REFERENCES public.signals(id) ON DELETE SET NULL,
  exchange VARCHAR(30) NOT NULL,
  symbol VARCHAR(40) NOT NULL,
  side VARCHAR(4) NOT NULL CHECK (side IN ('buy', 'sell')),
  entry_price DECIMAL(20, 8),
  exit_price DECIMAL(20, 8),
  quantity DECIMAL(20, 8),
  fees_paid DECIMAL(20, 8) NOT NULL DEFAULT 0,
  pnl_net DECIMAL(20, 8),
  commission_rate DECIMAL(5, 4) NOT NULL,
  commission_amount DECIMAL(20, 8),
  status VARCHAR(10) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  exchange_trade_ids TEXT[] DEFAULT '{}',
  opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auto_trades_user ON public.auto_trades(user_id, status);
CREATE INDEX IF NOT EXISTS idx_auto_trades_conn ON public.auto_trades(connection_id);

-- 3. Configurable settings (commission is NOT hardcoded)
INSERT INTO public.app_settings (key, value) VALUES
  ('trading.commission_rate', '0.25'),
  ('trading.approval_expiry_minutes', '15'),
  ('trading.legal_version', 'v2')
ON CONFLICT (key) DO NOTHING;

-- 4. Affiliate links seed (all 12 exchanges; update URLs with referral codes when available)
INSERT INTO public.affiliate_links (exchange, url, is_active) VALUES
  ('binance',   'https://www.binance.com/en/register', true),
  ('bybit',     'https://www.bybit.com/en-US/invite', true),
  ('okx',       'https://www.okx.com/join', true),
  ('kucoin',    'https://www.kucoin.com/ucenter/signup', true),
  ('kraken',    'https://www.kraken.com/sign-up', true),
  ('coinbase',  'https://www.coinbase.com/signup', true),
  ('mexc',      'https://www.mexc.com/register', true),
  ('gate',      'https://www.gate.io/signup', true),
  ('htx',       'https://www.htx.com/signup', true),
  ('bingx',     'https://bingx.com/invite', true),
  ('bitget',    'https://www.bitget.com/register', true),
  ('cryptocom', 'https://crypto.com/app/signup', true)
ON CONFLICT DO NOTHING;

-- 5. RLS: users manage their own connections; service role manages everything
ALTER TABLE public.exchange_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auto_trades ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own connections" ON public.exchange_connections;
CREATE POLICY "Users read own connections" ON public.exchange_connections
  FOR SELECT USING (auth.uid() = user_id OR auth.role() = 'service_role');

DROP POLICY IF EXISTS "Users update own connections" ON public.exchange_connections;
CREATE POLICY "Users update own connections" ON public.exchange_connections
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role manages connections" ON public.exchange_connections;
CREATE POLICY "Service role manages connections" ON public.exchange_connections
  FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Users read own trades" ON public.auto_trades;
CREATE POLICY "Users read own trades" ON public.auto_trades
  FOR SELECT USING (auth.uid() = user_id OR auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role manages trades" ON public.auto_trades;
CREATE POLICY "Service role manages trades" ON public.auto_trades
  FOR ALL USING (auth.role() = 'service_role');

-- Defense in depth: the encrypted columns are never readable/writable by the
-- authenticated role (only the application server with the service role).
REVOKE SELECT (api_key_enc, api_secret_enc) ON public.exchange_connections FROM authenticated;
REVOKE UPDATE (api_key_enc, api_secret_enc) ON public.exchange_connections FROM authenticated;

-- 6. Vault helper: reads EXCHANGE_MASTER_KEY from Supabase Vault.
--    The application falls back to the EXCHANGE_MASTER_KEY env var when Vault
--    is not configured. Only the service role can execute this function.
--    Vault must be enabled in the Supabase dashboard (Database -> Vault) for
--    the extension to exist; if it is not available yet, the rest of the
--    migration still applies and Vault is picked up automatically once enabled.
DO $$
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS vault;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'vault extension unavailable — enable it in the Supabase dashboard (Database -> Vault)';
  END;
END $$;

CREATE OR REPLACE FUNCTION public.get_exchange_master_key()
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE k TEXT;
BEGIN
  SELECT decrypted_secret INTO k
  FROM vault.decrypted_secrets
  WHERE name = 'exchange_master_key'
  LIMIT 1;
  RETURN k;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_exchange_master_key() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_exchange_master_key() TO service_role;
