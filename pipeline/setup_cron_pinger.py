"""Set up the NOIRAX pipeline pinger cronjob on cron-job.org via its REST API.

Creates (or updates) a cron job that calls GitHub's workflow_dispatch endpoint
every 10 minutes, so the signal pipeline runs reliably. GitHub's own `schedule`
event is best-effort and frequently drops 10-minute intervals, so this external
pinger is the reliable trigger.

NO SECRETS ARE STORED IN THIS FILE:
  - cron-job.org API key : env var CRONJOB_API_KEY, or you will be prompted
                           (it is never written to disk by this script).
  - GitHub PAT           : env var GITHUB_PAT, or read from the existing
                           .env.local (gitignored) as GITHUB_PAT.

Usage (PowerShell):
    $env:CRONJOB_API_KEY = "your-cron-job-org-api-key"
    python pipeline/setup_cron_pinger.py

You can omit the env var and the script will prompt for the API key instead.
"""

import getpass
import json
import os
import sys
import time

import requests

ENDPOINT = "https://api.cron-job.org"
REPO = "noiramaster/noirax"
WORKFLOW = "signals-cron.yml"
DISPATCH_URL = f"https://api.github.com/repos/{REPO}/actions/workflows/{WORKFLOW}/dispatches"
JOB_TITLE = "NOIRAX pipeline pinger"

HERE = os.path.dirname(os.path.abspath(__file__))
ENV_LOCAL = os.path.join(os.path.dirname(HERE), ".env.local")


def load_env_local(path: str) -> dict:
    """Parse a simple KEY=VALUE env file (no shell semantics needed here)."""
    env = {}
    try:
        with open(path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip().strip('"').strip("'")
    except FileNotFoundError:
        pass
    return env


def get_github_pat() -> str:
    pat = os.environ.get("GITHUB_PAT", "").strip()
    if pat:
        return pat
    env = load_env_local(ENV_LOCAL)
    pat = env.get("GITHUB_PAT", "").strip()
    if pat:
        return pat
    print("ERROR: GitHub PAT not found.")
    print("Set GITHUB_PAT (env var) or add GITHUB_PAT=... to .env.local and re-run.")
    sys.exit(1)


def get_cronjob_api_key() -> str:
    key = os.environ.get("CRONJOB_API_KEY", "").strip()
    if key:
        return key
    key = getpass.getpass("cron-job.org API key (console -> Settings -> API): ")
    if not key.strip():
        print("ERROR: no API key provided.")
        sys.exit(1)
    return key.strip()


def cronjob_api(method: str, path: str, api_key: str, payload: dict | None = None) -> tuple[int, dict]:
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    resp = requests.request(method, f"{ENDPOINT}{path}", headers=headers,
                            data=json.dumps(payload) if payload is not None else None, timeout=30)
    try:
        body = resp.json()
    except ValueError:
        body = {}
    return resp.status_code, body


def find_existing_job(api_key: str):
    status, data = cronjob_api("GET", "/jobs", api_key)
    if status != 200:
        return None, status, data
    for job in data.get("jobs", []):
        if job.get("title") == JOB_TITLE:
            return job, status, data
    return None, status, data


def build_job_config(pat: str) -> dict:
    return {
        "enabled": True,
        "title": JOB_TITLE,
        "saveResponses": True,
        "url": DISPATCH_URL,
        "requestMethod": 1,  # 1 = POST
        "schedule": {
            "timezone": "UTC",
            "expiresAt": 0,
            "hours": [-1],
            "mdays": [-1],
            "minutes": [0, 10, 20, 30, 40, 50],
            "months": [-1],
            "wdays": [-1],
        },
        "extendedData": {
            "headers": {
                "Authorization": f"Bearer {pat}",
                "Accept": "application/vnd.github.v3+json",
                "Content-Type": "application/json",
            },
            "body": json.dumps({"ref": "master"}),
        },
        "notification": {
            "onFailure": True,
            "onFailureCount": 3,
            "onSuccess": True,
            "onDisable": True,
            "onSslCertExpiry": True,
            "onSslCertExpirySeconds": 604800,
        },
    }


def test_dispatch_directly(pat: str) -> tuple[int, str]:
    """Replicate the exact request the cronjob will make, to verify it works."""
    resp = requests.post(
        DISPATCH_URL,
        headers={
            "Authorization": f"Bearer {pat}",
            "Accept": "application/vnd.github.v3+json",
            "Content-Type": "application/json",
        },
        data=json.dumps({"ref": "master"}),
        timeout=30,
    )
    return resp.status_code, resp.text


def main() -> None:
    print("=" * 60)
    print("NOIRAX pipeline pinger setup (cron-job.org REST API)")
    print("=" * 60)

    api_key = get_cronjob_api_key()
    pat = get_github_pat()
    print(f"Using GitHub PAT from: {'env GITHUB_PAT' if os.environ.get('GITHUB_PAT') else '.env.local'}")
    print(f"Dispatch URL: {DISPATCH_URL}")

    # 1. Check for an existing job with the same title (idempotent re-runs).
    existing, status, data = find_existing_job(api_key)
    if status != 200:
        print(f"ERROR: could not list cron-job.org jobs (HTTP {status}): {json.dumps(data)[:200]}")
        sys.exit(1)

    config = build_job_config(pat)

    if existing:
        job_id = existing.get("jobId")
        print(f"\nFound existing job '{JOB_TITLE}' (jobId={job_id}) — updating it.")
        status, data = cronjob_api("PATCH", f"/jobs/{job_id}", api_key, {"job": config})
        action = "UPDATED"
    else:
        print(f"\nNo existing job — creating '{JOB_TITLE}'.")
        status, data = cronjob_api("PUT", "/jobs", api_key, {"job": config})
        if status == 200:
            job_id = data.get("jobId")
        else:
            job_id = None
        action = "CREATED"

    if status != 200 or not job_id:
        print(f"ERROR: job {action.lower()} failed (HTTP {status}): {json.dumps(data)[:300]}")
        sys.exit(1)

    print(f"\n[OK] Job {action}: jobId={job_id}, every 10 minutes (UTC), POST {DISPATCH_URL[:80]}...")

    # 2. Verify the GitHub dispatch works with these credentials (direct call).
    print("\nTest run: dispatching workflow_dispatch directly with the same headers/body...")
    gh_status, gh_body = test_dispatch_directly(pat)
    if gh_status == 204:
        print(f"[OK] GitHub workflow_dispatch returned HTTP 204 (success) — pipeline triggered.")
    else:
        print(f"[WARN] GitHub workflow_dispatch returned HTTP {gh_status} (not 204).")
        print(f"      Body: {gh_body[:300]}")
        print("      The cronjob is created, but the trigger may fail on schedule. Fix auth/ref first.")

    # 3. Optional: ask cron-job.org to run the job now and confirm via history.
    run_status, run_data = cronjob_api("POST", f"/jobs/{job_id}/run", api_key)
    if run_status in (200, 202):
        print(f"\n[OK] cron-job.org accepted an immediate run (HTTP {run_status}).")
        print("Polling execution history for the GitHub response code...")
        for attempt in range(12):  # up to ~60s
            time.sleep(5)
            h_status, h_data = cronjob_api("GET", f"/jobs/{job_id}/history", api_key)
            items = h_data.get("history", []) if h_status == 200 else []
            if items:
                item = items[0]
                if item.get("date", 0) > time.time() - 120:
                    http = item.get("httpStatus")
                    st = item.get("statusText", "")
                    print(f"[OK] Execution result: status={st}, httpStatus={http} "
                          f"({'SUCCESS (204)' if http == 204 else 'check above'})")
                    break
        else:
            print("[WARN] No history entry within 60s — check the cron-job.org console.")
    else:
        print("\n[NOTE] cron-job.org 'run now' endpoint not available (undocumented/plan-specific).")
        print("       The job will execute on its schedule; first run within ~10 minutes.")

    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    print(f"  Job title : {JOB_TITLE}")
    print(f"  Job ID    : {job_id}")
    print(f"  Schedule  : every 10 minutes (UTC), every day")
    print(f"  Method    : POST -> {DISPATCH_URL}")
    print(f"  GitHub test dispatch: {'204 OK' if gh_status == 204 else f'HTTP {gh_status}'}")
    print("  Secrets   : none stored by this script (API key from env/prompt; PAT from .env.local)")
    print("\nNext: verify in the cron-job.org console, and confirm the pipeline run in")
    print("https://github.com/noiramaster/noirax/actions within ~10 minutes.")


if __name__ == "__main__":
    main()
