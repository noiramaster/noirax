"""Apply Supabase migration via Management API."""
import requests
import sys
import json
import os

MANAGEMENT_TOKEN = os.environ.get("SUPABASE_MANAGEMENT_TOKEN", "")
PROJECT_REF = os.environ.get("SUPABASE_PROJECT_REF", "klmrxgtmywvebyowhtfn")
BASE_URL = f"https://api.supabase.com/v1/projects/{PROJECT_REF}/database/query"

def apply_migration(sql_file):
    with open(sql_file, "r") as f:
        sql = f.read()

    print(f"\n=== Applying {sql_file} ===")
    print(f"SQL length: {len(sql)} chars")

    resp = requests.post(
        BASE_URL,
        headers={
            "Authorization": f"Bearer {MANAGEMENT_TOKEN}",
            "Content-Type": "application/json",
        },
        json={"query": sql},
        timeout=120,
    )

    print(f"Status: {resp.status_code}")
    if resp.status_code == 200 or resp.status_code == 201:
        print("SUCCESS")
        if resp.text:
            print(f"Response: {resp.text[:500]}")
        return True
    else:
        print(f"FAILED: {resp.text[:500]}")
        return False

if __name__ == "__main__":
    files = sys.argv[1:] if len(sys.argv) > 1 else [
        "C:/Users/aissa/noirax/supabase/migrations/001_init.sql",
    ]
    all_ok = True
    for f in files:
        if not apply_migration(f):
            all_ok = False
            break
    sys.exit(0 if all_ok else 1)
