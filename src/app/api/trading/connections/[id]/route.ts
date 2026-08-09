import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/apiAuth';
import { getServiceSupabase } from '@/lib/supabase';
import { HARD_CAPS, RISK_PROFILES } from '@/lib/trading';

// Updates (mode/profile/limits/pause-resume) or revokes one of the user's
// connections. All limit values are re-clamped server-side against the hard
// caps — the client can never exceed them, even in advanced mode.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }
  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const supabase = getServiceSupabase();
  const { data: conn, error: findError } = await supabase
    .from('exchange_connections')
    .select('id,exchange')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (findError || !conn) {
    return NextResponse.json({ error: 'Connection not found.' }, { status: 404 });
  }

  const clamp = (v: unknown, min: number, max: number, fallback: number): number => {
    const n = typeof v === 'number' && isFinite(v) ? v : Number(v ?? NaN);
    if (!isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  };

  const update: Record<string, unknown> = {};

  if (body.mode === 'auto' || body.mode === 'confirm') update.mode = body.mode;

  if (typeof body.profile === 'string') {
    const profile = body.profile as string;
    const preset = profile in RISK_PROFILES ? (RISK_PROFILES as Record<string, { positionPct: number; dailyLossLimitPct: number; maxPositions: number }>)[profile] : undefined;
    if (preset) {
      update.profile = profile;
      update.position_pct = preset.positionPct;
      update.daily_loss_limit_pct = preset.dailyLossLimitPct;
      update.max_positions = preset.maxPositions;
    } else if (profile === 'advanced') {
      update.profile = 'advanced';
      update.position_pct = clamp(body.positionPct, 1, HARD_CAPS.maxPositionPct, 10);
      update.daily_loss_limit_pct = clamp(body.dailyLossLimitPct, HARD_CAPS.dailyLossMinPct, HARD_CAPS.dailyLossMaxPct, 5);
      update.max_positions = clamp(body.maxPositions, 1, HARD_CAPS.maxPositions, 5);
    }
  }

  // Pause / resume with a visible reason (also used by the daily-loss brake in
  // the future execution phase).
  if (body.status === 'paused' || body.status === 'active') {
    update.status = body.status;
    update.paused_reason = body.status === 'paused' ? String(body.pausedReason || 'Paused by user') : null;
  }

  const { data: updated, error } = await supabase
    .from('exchange_connections')
    .update({ ...update, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id)
    .select('id,exchange,key_hint,mode,profile,position_pct,daily_loss_limit_pct,max_positions,status,paused_reason,last_validation_error,legal_version,updated_at')
    .single();

  if (error || !updated) {
    return NextResponse.json({ error: error?.message || 'Update failed.' }, { status: 500 });
  }
  return NextResponse.json({ connection: updated });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }
  const { id } = await params;

  const supabase = getServiceSupabase();
  const { data: conn } = await supabase
    .from('exchange_connections')
    .select('id')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!conn) {
    return NextResponse.json({ error: 'Connection not found.' }, { status: 404 });
  }

  const { error } = await supabase.from('exchange_connections').delete().eq('id', id).eq('user_id', user.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
