import { createClient } from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';
import type { User } from '@supabase/supabase-js';

// Extracts the Supabase session from the Authorization: Bearer header and
// returns the authenticated user, or null.
export async function getUserFromRequest(request: NextRequest): Promise<User | null> {
  const auth = request.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return null;
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  );
  const { data, error } = await supabase.auth.getUser(token);
  return error ? null : data.user;
}
