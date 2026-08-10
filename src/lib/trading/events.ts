// Trading event log + alerting. Every execution outcome (success, rejection,
// brake trigger, engine error) is written to trading_events; critical events
// also trigger an email alert (Resend) so the operator can watch the first
// week of real trading closely.

import { getServiceSupabase } from '@/lib/supabase';

export type EventLevel = 'info' | 'warn' | 'error' | 'critical';

export interface EventInput {
  user_id?: string;
  connection_id?: string;
  trade_id?: string;
  event_type: string;
  level?: EventLevel;
  message?: string;
  meta?: Record<string, unknown>;
}

const ALERT_COOLDOWN_MS = 10 * 60 * 1000; // max 1 email per event type per 10 min

async function lastAlertAgo(eventType: string): Promise<number> {
  try {
    const { data } = await getServiceSupabase()
      .from('trading_events')
      .select('created_at')
      .eq('event_type', `${eventType}:alert`)
      .order('created_at', { ascending: false })
      .limit(1);
    if (!data || data.length === 0) return Infinity;
    return Date.now() - new Date(data[0].created_at).getTime();
  } catch {
    return Infinity;
  }
}

export async function logEvent(input: EventInput): Promise<void> {
  try {
    await getServiceSupabase().from('trading_events').insert({
      user_id: input.user_id ?? null,
      connection_id: input.connection_id ?? null,
      trade_id: input.trade_id ?? null,
      event_type: input.event_type,
      level: input.level ?? 'info',
      message: input.message ?? '',
      meta: input.meta ?? {},
    });
  } catch (e) {
    console.error('trading_events insert failed', e);
  }
}

export async function alertOperator(eventType: string, message: string, meta?: Record<string, unknown>): Promise<void> {
  await logEvent({ event_type: `${eventType}:alert`, level: 'critical', message, meta });
  const ago = await lastAlertAgo(eventType);
  if (ago < ALERT_COOLDOWN_MS) return;

  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.TRADING_ALERT_EMAIL || 'aissa1millon@gmail.com';
  if (!apiKey) {
    console.error(`[TRADING-ALERT] (no RESEND_API_KEY) ${eventType}: ${message}`);
    return;
  }
  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'NOIRAX Trading Monitor <onboarding@resend.dev>',
        to: [to],
        subject: `NOIRAX Trading: ${eventType}`,
        text: `${message}\n\n${meta ? JSON.stringify(meta, null, 2) : ''}`,
      }),
    });
    if (!resp.ok) {
      console.error(`[TRADING-ALERT] resend HTTP ${resp.status}: ${await resp.text()}`);
    }
  } catch (e) {
    console.error('[TRADING-ALERT] send failed', e);
  }
}
