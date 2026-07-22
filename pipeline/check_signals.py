"""Check signals in Supabase after pipeline run."""
from supabase import create_client

url = "https://klmrxgtmywvebyowhtfn.supabase.co"
key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtsbXJ4Z3RteXd2ZWJ5b3dodGZuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NDYyODgzOCwiZXhwIjoyMTAwMjA0ODM4fQ.mqREELuNaNPlfMU_MLu1f1G9MV8hq8qxzPXxorKMAEI"

client = create_client(url, key)
result = client.table("signals").select("id,coin,signal_type,tier,confidence,created_at,fundamental_signals").order("created_at", desc=True).limit(10).execute()
print(f"Total signals found: {len(result.data)}")
for s in result.data:
    fund = s.get("fundamental_signals", [])
    print(f"  {s['coin']} | {s['signal_type']} | {s['tier']} | {s['confidence']}% | fund={fund} | {s['created_at']}")
