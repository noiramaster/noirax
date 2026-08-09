import { NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase';
import { HARD_CAPS, RISK_PROFILES } from '@/lib/trading';

// Public configuration for the /trading UI: commission rate (configurable via
// TRADING_COMMISSION_RATE env var or app_settings, never hardcoded), approval
// expiry, legal version and the hard caps the user must respect.
export async function GET() {
  const supabase = getServiceSupabase();

  let commissionRate: number | null = null;
  let approvalExpiryMinutes: number | null = null;
  let legalVersion = 'v2';

  try {
    const { data } = await supabase
      .from('app_settings')
      .select('key,value')
      .in('key', ['trading.commission_rate', 'trading.approval_expiry_minutes', 'trading.legal_version']);
    for (const row of data || []) {
      if (row.key === 'trading.commission_rate') commissionRate = parseFloat(row.value);
      if (row.key === 'trading.approval_expiry_minutes') approvalExpiryMinutes = parseInt(row.value, 10);
      if (row.key === 'trading.legal_version') legalVersion = row.value;
    }
  } catch {
    // Settings table unavailable — fall back to defaults below.
  }

  const envRate = process.env.TRADING_COMMISSION_RATE;
  const envExpiry = process.env.TRADING_APPROVAL_EXPIRY_MINUTES;

  return NextResponse.json({
    commissionRate: envRate ? parseFloat(envRate) : (commissionRate ?? 0.25),
    approvalExpiryMinutes: envExpiry ? parseInt(envExpiry, 10) : (approvalExpiryMinutes ?? 15),
    legalVersion,
    caps: HARD_CAPS,
    profiles: Object.fromEntries(
      Object.entries(RISK_PROFILES).map(([id, p]) => [id, {
        positionPct: p.positionPct,
        dailyLossLimitPct: p.dailyLossLimitPct,
        maxPositions: p.maxPositions,
      }])
    ),
  });
}
