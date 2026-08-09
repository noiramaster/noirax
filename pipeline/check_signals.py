"""Check signals in Supabase after pipeline run."""
import os

from supabase import create_client

url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "https://klmrxgtmywvebyowhtfn.supabase.co")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

if not key:
    raise SystemExit("SUPABASE_SERVICE_ROLE_KEY not set — refusing to run without credentials")

client = create_client(url, key)
result = client.table("signals").select("id,coin,signal_type,tier,confidence,created_at,fundamental_signals").order("created_at", desc=True).limit(10).execute()
print(f"Total signals found: {len(result.data)}")
for s in result.data:
    fund = s.get("fundamental_signals", [])
    print(f"  {s['coin']} | {s['signal_type']} | {s['tier']} | {s['confidence']}% | fund={fund} | {s['created_at']}")
