import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/apiAuth';
import { getServiceSupabase } from '@/lib/supabase';

// Lists the authenticated user's exchange connections (metadata only — the
// encrypted key material is never selected, and the authenticated role cannot
// read those columns anyway, see migration 005).
export async function GET(request: NextRequest) {
  const user = await getUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from('exchange_connections')
    .select('id,exchange,key_hint,mode,profile,position_pct,daily_loss_limit_pct,max_positions,status,paused_reason,last_validation_error,legal_version,legal_accepted_at,created_at,updated_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ connections: data || [] });
}
