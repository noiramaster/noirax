import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/apiAuth';
import { getServiceSupabase } from '@/lib/supabase';
import { logEvent } from '@/lib/trading/events';

// Declines a pending (confirmation-mode) trade: it is cancelled and will not
// be executed.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }
  const { id } = await params;
  const supabase = getServiceSupabase();

  const { data: trade } = await supabase
    .from('auto_trades')
    .select('id,connection_id,user_id')
    .eq('id', id)
    .eq('user_id', user.id)
    .eq('status', 'pending')
    .maybeSingle();
  if (!trade) {
    return NextResponse.json({ error: 'Pending trade not found or already decided.' }, { status: 404 });
  }

  await supabase.from('auto_trades').update({ status: 'cancelled', approval_expires_at: null }).eq('id', id);
  await logEvent({ user_id: user.id, connection_id: trade.connection_id, trade_id: id, event_type: 'confirmation_declined', message: 'user declined' });
  return NextResponse.json({ ok: true });
}
