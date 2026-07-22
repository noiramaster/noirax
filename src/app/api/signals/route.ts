import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  const { searchParams } = new URL(request.url);
  const tier = searchParams.get('tier');
  const limit = parseInt(searchParams.get('limit') || '50', 10);
  const resolved = searchParams.get('resolved') === 'true';

  let query = supabase.from('signals').select('*').order('created_at', { ascending: false }).limit(limit);
  if (tier) {
    query = query.eq('tier', tier);
  }
  if (resolved) {
    query = query.neq('resolved_result', 'pending');
  }

  const { data: signals, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ signals });
}
