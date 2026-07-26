import { createClient } from '@supabase/supabase-js';

async function getStatus() {
  const gh = await fetch('https://raw.githubusercontent.com/noiramaster/noirax/master/pipeline/status.json', { next: { revalidate: 60 } });
  const statusData = gh.ok ? await gh.json() : null;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  );

  const [signalsRes, pipelineRes] = await Promise.all([
    supabase.from('signals').select('resolved_result'),
    fetch('https://api.github.com/repos/noiramaster/noirax/actions/runs?per_page=3&status=completed', {
      headers: { Authorization: `Bearer ${process.env.GITHUB_PAT || ''}` },
      next: { revalidate: 120 }
    }).then(r => r.json()).catch(() => ({ workflow_runs: [] })),
  ]);

  const signals = signalsRes.data || [];
  const runs = pipelineRes.workflow_runs || [];

  return { statusData, signals, runs };
}

export default async function StatusPage() {
  const { statusData, signals, runs } = await getStatus();

  const total = signals.length;
  const pending = signals.filter(s => s.resolved_result === 'pending').length;
  const wins = signals.filter(s => s.resolved_result === 'win').length;
  const losses = signals.filter(s => s.resolved_result === 'loss').length;

  const lastRun = runs[0];
  const recentOk = runs.filter((r: any) => r.conclusion === 'success').length;
  const recentFail = runs.filter((r: any) => r.conclusion === 'failure').length;
  const stale = statusData ? (Date.now() - new Date(statusData.last_run).getTime()) / 60000 > 70 : true;
  const proxyPct = statusData && (statusData.proxy_24h + statusData.real_24h) > 0
    ? Math.round(statusData.proxy_24h / (statusData.proxy_24h + statusData.real_24h) * 100) : 0;

  return (
    <div className="max-w-3xl mx-auto px-4 py-12 font-mono">
      <h1 className="text-3xl text-accent-green mb-6">&gt; System Status</h1>

      {/* Pipeline */}
      <Section title="Pipeline">
        <Row label="Last run" value={statusData?.last_run?.slice(0, 19) || 'Never'} ok={!stale} />
        <Row label="Status" value={stale ? 'STALE' : 'Running'} ok={!stale} />
        <Row label="Recent (last 3)" value={`${recentOk} ok / ${recentFail} failed`} ok={recentFail === 0} />
      </Section>

      {/* Signals */}
      <Section title="Signals">
        <Row label="Total" value={String(total)} ok={total > 0} />
        <Row label="Active (pending)" value={String(pending)} ok={pending >= 0} />
        <Row label="Wins" value={String(wins)} ok={wins > 0} />
        <Row label="Losses" value={String(losses)} ok={true} />
        <Row label="Win rate" value={wins + losses > 0 ? `${Math.round(wins / (wins + losses) * 100)}%` : 'N/A'} ok={wins + losses > 0} />
      </Section>

      {/* OHLC quality */}
      <Section title="Technical Analysis Quality (24h)">
        <Row label="Real OHLC used" value={String(statusData?.real_24h || 0)} ok={(statusData?.real_24h || 0) > 0} />
        <Row label="Proxy used" value={String(statusData?.proxy_24h || 0)} ok={(statusData?.proxy_24h || 0) < (statusData?.real_24h || 1)} />
        <Row label="Proxy ratio" value={`${proxyPct}%`} ok={proxyPct < 50} />
      </Section>

      {/* Recent errors */}
      {statusData?.errors?.length > 0 && (
        <Section title={`Recent Errors (last ${Math.min(statusData.errors.length, 5)})`}>
          {statusData.errors.slice(-5).reverse().map((e: any, i: number) => (
            <div key={i} className="text-xs text-accent-red mb-1">
              {e.time?.slice(0, 19)} — {e.error?.slice(0, 120)}
            </div>
          ))}
        </Section>
      )}

      {/* Links */}
      <Section title="Quick Links">
        <a href="/free" className="block text-xs text-accent-green hover:underline mb-1">&gt; Free Signals</a>
        <a href="/track-record" className="block text-xs text-accent-green hover:underline mb-1">&gt; Track Record</a>
        <a href="https://github.com/noiramaster/noirax/actions" className="block text-xs text-accent-green hover:underline">&gt; GitHub Actions</a>
      </Section>

      <div className="mt-8 text-xs text-muted">
        Auto-updates every 60s. Data from pipeline/status.json + Supabase.
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-border rounded p-4 mb-4">
      <h2 className="text-sm text-accent-green mb-3">&gt; {title}</h2>
      {children}
    </div>
  );
}

function Row({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="flex justify-between text-xs mb-1.5">
      <span className="text-muted">{label}</span>
      <span className={ok ? 'text-accent-green' : 'text-accent-red'}>{value}</span>
    </div>
  );
}
