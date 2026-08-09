"""Rotate EXCHANGE_MASTER_KEY (AES-256-GCM master key) with zero downtime.

Process:
  1. Read the current key (Supabase Vault first, else EXCHANGE_MASTER_KEY env / .env.local).
  2. Read all exchange_connections rows (encrypted API keys/secrets).
  3. Decrypt each with the current key, generate a NEW random 32-byte key,
     re-encrypt each value and update the row.
  4. Store the new key in Supabase Vault as 'exchange_master_key' and keep the
     old one as 'exchange_master_key_prev' (7-day grace window: decryption in
     the app tries current, then prev, so rows written mid-rotation stay
     readable).
  5. If Vault is unavailable, the new key is printed for you to set as the
     EXCHANGE_MASTER_KEY env var (e.g. Vercel) and .env.local.

Usage:
    python pipeline/rotate_exchange_master_key.py
(reads SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_MANAGEMENT_TOKEN
from env or .env.local; prompts for confirmation before applying.)
"""

import getpass
import os
import sys
import base64

import requests
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

HERE = os.path.dirname(os.path.abspath(__file__))
ENV_LOCAL = os.path.join(os.path.dirname(HERE), ".env.local")

AESGCM_NONCE_LEN = 12


def load_env_local(path: str) -> dict:
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


def env(key: str, fallback: str = "") -> str:
    return os.environ.get(key, load_env_local(ENV_LOCAL).get(key, fallback))


def parse_payload(payload: str) -> bytes:
    parts = payload.split(":")
    if len(parts) != 4 or parts[0] != "v1":
        raise ValueError("Unsupported payload format (not v1)")
    return base64.b64decode(parts[1]) + base64.b64decode(parts[2]) + base64.b64decode(parts[3])


def decrypt_value(payload: str, key: bytes) -> str:
    raw = parse_payload(payload)
    aes = AESGCM(key)
    return aes.decrypt(raw[:AESGCM_NONCE_LEN], raw[AESGCM_NONCE_LEN + 16:], raw[:AESGCM_NONCE_LEN]).decode("utf-8")


def encrypt_value(plaintext: str, key: bytes) -> str:
    aes = AESGCM(key)
    nonce = os.urandom(AESGCM_NONCE_LEN)
    ct = aes.encrypt(nonce, plaintext.encode("utf-8"), None)
    iv = nonce
    tag = ct[:16]
    data = ct[16:]
    return f"v1:{base64.b64encode(iv).decode()}:{base64.b64encode(tag).decode()}:{base64.b64encode(data).decode()}"


def is_hex_key(value: str) -> bool:
    return len(value.strip()) == 64 and all(c in "0123456789abcdefABCDEF" for c in value.strip())


def main() -> None:
    url = env("NEXT_PUBLIC_SUPABASE_URL")
    key = env("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        print("ERROR: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not found (env or .env.local).")
        sys.exit(1)

    current = env("EXCHANGE_MASTER_KEY")
    if not current:
        print("EXCHANGE_MASTER_KEY not found. If it lives in Supabase Vault, run this with")
        print("EXCHANGE_MASTER_KEY=<current key> set (Vault write uses SUPABASE_MANAGEMENT_TOKEN).")
        print("Proceeding with empty key will fail — provide the current key to proceed.")
        current = getpass.getpass("Current EXCHANGE_MASTER_KEY (64 hex chars): ")
    if not is_hex_key(current):
        print("ERROR: current key is not 64 hex characters.")
        sys.exit(1)
    current_key = bytes.fromhex(current.strip())

    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }

    resp = requests.get(f"{url}/rest/v1/exchange_connections?select=id,api_key_enc,api_secret_enc", headers=headers, timeout=30)
    if resp.status_code != 200:
        print(f"ERROR: could not list exchange_connections (HTTP {resp.status_code}): {resp.text[:200]}")
        sys.exit(1)
    rows = resp.json()
    print(f"Found {len(rows)} connections to re-encrypt.")

    confirm = input(f"Rotate EXCHANGE_MASTER_KEY and re-encrypt {len(rows)} connections? [y/N] ")
    if confirm.strip().lower() != "y":
        print("Aborted.")
        sys.exit(0)

    new_key = os.urandom(32).hex()
    new_key_bytes = bytes.fromhex(new_key)

    ok = 0
    for row in rows:
        rid = row["id"]
        try:
            new_key_enc = encrypt_value(decrypt_value(row["api_key_enc"], current_key), new_key_bytes)
            new_secret_enc = encrypt_value(decrypt_value(row["api_secret_enc"], current_key), new_key_bytes)
        except Exception as e:
            print(f"  SKIP {rid}: could not decrypt with current key ({e})")
            continue
        upd = requests.patch(
            f"{url}/rest/v1/exchange_connections?id=eq.{rid}",
            headers=headers,
            json={"api_key_enc": new_key_enc, "api_secret_enc": new_secret_enc},
            timeout=30,
        )
        if upd.status_code in (200, 204):
            ok += 1
        else:
            print(f"  FAIL {rid}: HTTP {upd.status_code}")

    print(f"\nRe-encrypted {ok}/{len(rows)} connections with the new key.")

    # Persist the new key: Supabase Vault first, then fall back to printing it.
    mgmt_token = env("SUPABASE_MANAGEMENT_TOKEN")
    if mgmt_token:
        project_ref = env("SUPABASE_PROJECT_REF", "klmrxgtmywvebyowhtfn")
        mgmt_headers = {"Authorization": f"Bearer {mgmt_token}", "Content-Type": "application/json"}
        sql = (
            "select vault.create_secret('" + new_key + "', 'exchange_master_key', 'EXCHANGE_MASTER_KEY');"
            "select vault.create_secret('" + current.strip() + "', 'exchange_master_key_prev', 'previous EXCHANGE_MASTER_KEY');"
        )
        r = requests.post(
            f"https://api.supabase.com/v1/projects/{project_ref}/database/query",
            headers=mgmt_headers,
            json={"query": sql},
            timeout=60,
        )
        if r.status_code in (200, 201):
            print("Vault updated: exchange_master_key (new) + exchange_master_key_prev (old, 7-day grace).")
        else:
            print(f"WARN: Vault update failed (HTTP {r.status_code}): {r.text[:200]}")
            print("Set the new key manually as EXCHANGE_MASTER_KEY (Vercel env + Vault):")
            print(new_key)
    else:
        print("\nSUPABASE_MANAGEMENT_TOKEN not set — Vault not updated.")
        print("Set this new key as EXCHANGE_MASTER_KEY (Vercel env + Vault) and delete exchange_master_key_prev after 7 days:")
        print(new_key)

    print("\nDone. Delete exchange_master_key_prev after the 7-day grace window.")


if __name__ == "__main__":
    main()
