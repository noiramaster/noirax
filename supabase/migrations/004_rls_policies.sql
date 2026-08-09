-- NOIRAX RLS Policies
-- Enable RLS on all tables and define row-level security

-- signals: free signals public read, premium signals auth-only, service_role write
ALTER TABLE signals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Free signals public read" ON signals;
CREATE POLICY "Free signals public read" ON signals
  FOR SELECT USING (tier = 'free');

DROP POLICY IF EXISTS "Premium signals auth read" ON signals;
CREATE POLICY "Premium signals auth read" ON signals
  FOR SELECT USING (
    tier = 'premium'
    AND auth.role() = 'authenticated'
    AND EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.plan = 'premium'
    )
  );

DROP POLICY IF EXISTS "Signals service_role write" ON signals;
CREATE POLICY "Signals service_role write" ON signals
  FOR ALL USING (auth.role() = 'service_role');

-- users: each user reads/edits own row
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own" ON users;
CREATE POLICY "Users read own" ON users
  FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users update own" ON users;
CREATE POLICY "Users update own" ON users
  FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users service_role all" ON users;
CREATE POLICY "Users service_role all" ON users
  FOR ALL USING (auth.role() = 'service_role');

-- subscriptions_events: no public access, only service_role
ALTER TABLE subscriptions_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Subscriptions service_role all" ON subscriptions_events;
CREATE POLICY "Subscriptions service_role all" ON subscriptions_events
  FOR ALL USING (auth.role() = 'service_role');

-- affiliate_links: public read, service_role write
ALTER TABLE affiliate_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Affiliate public read" ON affiliate_links;
CREATE POLICY "Affiliate public read" ON affiliate_links
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Affiliate service_role write" ON affiliate_links;
CREATE POLICY "Affiliate service_role write" ON affiliate_links
  FOR ALL USING (auth.role() = 'service_role');

-- app_settings: no public access, only service_role
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "App settings service_role all" ON app_settings;
CREATE POLICY "App settings service_role all" ON app_settings
  FOR ALL USING (auth.role() = 'service_role');
