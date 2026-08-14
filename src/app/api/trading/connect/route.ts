import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/apiAuth';
import { getServiceSupabase } from '@/lib/supabase';
import { encryptSecretAsync } from '@/lib/exchangeCrypto';
import { getAdapter, getExchangeInfo } from '@/lib/exchanges';
import { HARD_CAPS, LEGAL_VERSION, RISK_PROFILES, DEFAULT_MODE, DEFAULT_PROFILE } from '@/lib/trading';

// Connects a user's exchange API key. Keys are AES-256-GCM encrypted at the
// application layer before storage; only key_hint (last 4 chars) is ever shown
// back to the user. Credentials are never logged, never returned, and the
// authenticated role cannot even read the encrypted columns (see migration 005).
export async function POST(request: NextRequest) {
  const user = await getUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const exchange = String(body.exchange || '');
  const apiKey = String(body.apiKey || '').trim();
  const apiSecret = String(body.apiSecret || '').trim();
  const passphrase = body.passphrase ? String(body.passphrase).trim() : undefined;

  // Paper mode: no exchange, no keys — simulated 10,000 USDT.
  const isPaper = exchange === 'paper';
  if (!isPaper && !getExchangeInfo(exchange)) {
    return NextResponse.json({ error: `Unsupported exchange: ${exchange}` }, { status: 400 });
  }
  if (!isPaper && (!apiKey || !apiSecret)) {
    return NextResponse.json({ error: 'API Key and API Secret are required.' }, { status: 400 });
  }
  if (!isPaper && (apiKey.length < 8 || apiSecret.length < 8)) {
    return NextResponse.json({ error: 'API Key and API Secret look too short — double-check them.' }, { status: 400 });
  }

  if (body.legalAccepted !== true) {
    return NextResponse.json({ error: 'You must accept the risk notice before connecting.' }, { status: 400 });
  }

  // --- Mode & risk profile (server-side validation against hard caps) ---
  const mode = body.mode === 'auto' ? 'auto' : body.mode === 'confirm' ? 'confirm' : DEFAULT_MODE;
  const profileRaw = String(body.profile || '');
  const preset = profileRaw in RISK_PROFILES ? (RISK_PROFILES as Record<string, { positionPct: number; dailyLossLimitPct: number; maxPositions: number }>)[profileRaw] : undefined;
  const profile = preset ? profileRaw : (profileRaw === 'advanced' ? 'advanced' : DEFAULT_PROFILE);

  const clamp = (v: unknown, min: number, max: number, fallback: number): number => {
    const n = typeof v === 'number' && isFinite(v) ? v : Number(v ?? NaN);
    if (!isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  };

  let positionPct = preset ? preset.positionPct : clamp(body.positionPct, 1, HARD_CAPS.maxPositionPct, 10);
  let dailyLossLimitPct = preset ? preset.dailyLossLimitPct : clamp(body.dailyLossLimitPct, HARD_CAPS.dailyLossMinPct, HARD_CAPS.dailyLossMaxPct, 5);
  let maxPositions = preset ? preset.maxPositions : clamp(body.maxPositions, 1, HARD_CAPS.maxPositions, 5);

  if (profile === 'advanced') {
    positionPct = clamp(body.positionPct, 1, HARD_CAPS.maxPositionPct, 10);
    dailyLossLimitPct = clamp(body.dailyLossLimitPct, HARD_CAPS.dailyLossMinPct, HARD_CAPS.dailyLossMaxPct, 5);
    maxPositions = clamp(body.maxPositions, 1, HARD_CAPS.maxPositions, 5);
  }

  const supabase = getServiceSupabase();

  const { data: existing } = await supabase
    .from('exchange_connections')
    .select('id')
    .eq('user_id', user.id)
    .eq('exchange', exchange)
    .maybeSingle();
  if (existing) {
    return NextResponse.json(
      { error: `You already have a connection for ${exchange}. Disconnect it first or manage it from the dashboard.` },
      { status: 409 }
    );
  }

  // --- Encrypt before anything touches the database (paper mode skips keys) ---
  let keyEnc = 'paper';
  let secretEnc = 'paper';
  if (!isPaper) {
    try {
      keyEnc = await encryptSecretAsync(apiKey);
      secretEnc = await encryptSecretAsync(apiSecret);
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : 'Encryption key not configured.' },
        { status: 500 }
      );
    }
  }

  // --- Credential validation (real per-exchange signing; never blocks saving) ---
  let validationError: string | null = null;
  const adapter = isPaper ? undefined : getAdapter(exchange);
  if (adapter) {
    try {
      const result = await adapter.testConnection(apiKey, apiSecret, passphrase);
      if (!result.ok) {
        validationError = result.error || 'Credential validation failed.';
      }
    } catch {
      validationError = 'Credential validation could not be completed.';
    }
  }

  const { data: created, error } = await supabase
    .from('exchange_connections')
    .insert({
      user_id: user.id,
      exchange,
      api_key_enc: keyEnc,
      api_secret_enc: secretEnc,
      key_hint: isPaper ? 'PAPER' : apiKey.slice(-4),
      mode,
      profile,
      position_pct: positionPct,
      daily_loss_limit_pct: dailyLossLimitPct,
      max_positions: maxPositions,
      status: 'active',
      last_validation_error: validationError,
      legal_version: LEGAL_VERSION,
    })
    .select('id,exchange,key_hint,mode,profile,position_pct,daily_loss_limit_pct,max_positions,status,last_validation_error,legal_version,created_at')
    .single();

  if (error || !created) {
    return NextResponse.json({ error: error?.message || 'Failed to save connection.' }, { status: 500 });
  }

  return NextResponse.json({ connection: created, validationNote: validationError }, { status: 201 });
}
