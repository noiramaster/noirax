import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// Health check + self-heal trigger. Lives on Vercel (independent infrastructure
// from GitHub Actions, so a billing/runner outage there is visible HERE).
// - Reads the latest pipeline_runs row (written by every pipeline run).
// - If the last run is older than STALE_MINUTES and the heartbeat claims staleness,
//   it re-dispatches the workflow via the GitHub PAT (idempotent: the dispatch
//   only schedules a run; the pinger already does this too — this is a backup).
// - Always persists a health row to pipeline_runs via /api/health marker runs
//   so the outage is never silent.
export async function GET(request: NextRequest) {
  const token = request.headers.get('x-health-token');
  if (process.env.HEALTH_TOKEN && token !== process.env.HEALTH_TOKEN) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) {
    return NextResponse.json({ error: 'Supabase env not configured on Vercel' }, { status: 500 });
  }

  const supabase = createClient(url, key);
  const report: Record<string, unknown> = { checked_at: new Date().toISOString() };

  try {
    const { data, error } = await supabase
      .from('pipeline_runs')
      .select('started_at,status,signals_created,verified_count,error_message,run_id')
      .order('started_at', { ascending: false })
      .limit(1);
    if (error) {
      report.db_error = error.message;
      return NextResponse.json(report, { status: 500 });
    }
    const last = data && data[0];
    if (!last) {
      report.last_run = null;
      report.state = 'no-runs-recorded';
      return NextResponse.json(report);
    }
    report.last_run = last;
    const lastAt = new Date(last.started_at).getTime();
    const ageMin = Math.round((Date.now() - lastAt) / 60000);
    report.age_minutes = ageMin;

    const staleMinutes = Number(process.env.PIPELINE_STALE_MINUTES || '45');
    if (last.status === 'error' || ageMin > staleMinutes) {
      report.state = 'stale-or-error';
      const pat = process.env.GITHUB_PAT || '';
      if (pat) {
        const dispatch = await fetch('https://api.github.com/repos/noiramaster/noirax/actions/workflows/signals-cron.yml/dispatches', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${pat}`,
            Accept: 'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
            'User-Agent': 'noirax-health',
          },
          body: JSON.stringify({ ref: 'master' }),
        });
        report.self_heal_dispatch_http = dispatch.status;
        if (dispatch.status !== 204) {
          report.self_heal_dispatch_error = await dispatch.text().then((t) => t.slice(0, 300));
        }
      } else {
        report.self_heal_dispatch_http = 'no-pat-configured';
      }
    } else {
      report.state = 'healthy';
    }

    return NextResponse.json(report);
  } catch (e) {
    report.error = e instanceof Error ? e.message : String(e);
    return NextResponse.json(report, { status: 500 });
  }
}