import { NextRequest, NextResponse } from 'next/server';
import { runEngine } from '@/lib/trading/engine';

export const maxDuration = 60;

// Secured engine trigger. Called by an external pinger (cron-job.org) with the
// x-engine-token header matching the TRADING_ENGINE_TOKEN env var.
export async function POST(request: NextRequest) {
  const expected = process.env.TRADING_ENGINE_TOKEN;
  if (!expected) {
    return NextResponse.json({ error: 'Engine token not configured.' }, { status: 500 });
  }
  const provided = request.headers.get('x-engine-token');
  if (!provided || provided !== expected) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  }
  try {
    const report = await runEngine();
    return NextResponse.json(report);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'engine failed' }, { status: 500 });
  }
}
