-- NOIRAX Database Schema
-- Migration 001: Initial schema

-- 1. Signals table
CREATE TABLE IF NOT EXISTS public.signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  coin VARCHAR(20) NOT NULL,
  exchange VARCHAR(20) NOT NULL DEFAULT 'binance',
  signal_type VARCHAR(4) NOT NULL CHECK (signal_type IN ('buy', 'sell')),
  confidence SMALLINT NOT NULL CHECK (confidence >= 0 AND confidence <= 100),
  explanation_es TEXT NOT NULL DEFAULT '',
  explanation_en TEXT NOT NULL DEFAULT '',
  tier VARCHAR(10) NOT NULL CHECK (tier IN ('free', 'premium')),
  entry_price DECIMAL(20, 8),
  stop_loss DECIMAL(20, 8),
  take_profit DECIMAL(20, 8),
  timeframe VARCHAR(10) NOT NULL DEFAULT '1h',
  resolved_at TIMESTAMPTZ,
  resolved_result VARCHAR(10) CHECK (resolved_result IN ('win', 'loss', 'pending')),
  resolved_price DECIMAL(20, 8)
);

CREATE INDEX idx_signals_tier ON public.signals(tier);
CREATE INDEX idx_signals_created_at ON public.signals(created_at DESC);
CREATE INDEX idx_signals_resolved ON public.signals(resolved_result);

-- 2. Users / extended profile (extends Supabase Auth)
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  plan VARCHAR(10) NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'premium')),
  stripe_customer_id VARCHAR(255),
  stripe_subscription_id VARCHAR(255),
  subscription_status VARCHAR(50),
  idioma_preferido VARCHAR(5) NOT NULL DEFAULT 'en',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_stripe_customer ON public.users(stripe_customer_id);
CREATE INDEX idx_users_plan ON public.users(plan);

-- 3. Subscription events (audit log)
CREATE TABLE IF NOT EXISTS public.subscriptions_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  event_type VARCHAR(100) NOT NULL,
  stripe_event_id VARCHAR(255) NOT NULL,
  data JSONB NOT NULL DEFAULT '{}',
  processed BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX idx_subscriptions_events_stripe_id ON public.subscriptions_events(stripe_event_id);

-- 4. Affiliate links (configurable without redeploy)
CREATE TABLE IF NOT EXISTS public.affiliate_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exchange VARCHAR(50) NOT NULL,
  url TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. App settings (configurable key-value store)
CREATE TABLE IF NOT EXISTS public.app_settings (
  key VARCHAR(100) PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insert default settings
INSERT INTO public.app_settings (key, value) VALUES
  ('signals_free_delay_minutes', '15'),
  ('signals_min_volume_24h_usd', '1000000'),
  ('signals_cron_interval', '15'),
  ('ai_provider', 'gemini')
ON CONFLICT (key) DO NOTHING;

-- Enable Row Level Security
ALTER TABLE public.signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies for signals
CREATE POLICY "Free signals are public" ON public.signals
  FOR SELECT
  USING (tier = 'free');

CREATE POLICY "Premium signals are visible to premium users" ON public.signals
  FOR SELECT
  USING (
    tier = 'premium' AND (
      auth.role() = 'authenticated' AND EXISTS (
        SELECT 1 FROM public.users
        WHERE users.id = auth.uid() AND users.plan = 'premium'
      )
    )
  );

CREATE POLICY "Service role can insert signals" ON public.signals
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role can update signals" ON public.signals
  FOR UPDATE
  USING (auth.role() = 'service_role');

-- RLS Policies for users
CREATE POLICY "Users can read own profile" ON public.users
  FOR SELECT
  USING (auth.uid() = id OR auth.role() = 'service_role');

CREATE POLICY "Service role can insert users" ON public.users
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role can update users" ON public.users
  FOR UPDATE
  USING (auth.role() = 'service_role');

-- RLS Policies for subscriptions_events
CREATE POLICY "Service role only for subscription events" ON public.subscriptions_events
  USING (auth.role() = 'service_role');

-- RLS Policies for affiliate_links
CREATE POLICY "Affiliate links are public for reading" ON public.affiliate_links
  FOR SELECT
  USING (true);

-- RLS Policies for app_settings
CREATE POLICY "App settings are public for reading" ON public.app_settings
  FOR SELECT
  USING (true);

-- Trigger to auto-create user profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, plan, idioma_preferido)
  VALUES (
    NEW.id,
    NEW.email,
    'free',
    COALESCE(NEW.raw_user_meta_data->>'idioma_preferido', 'en')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
