// AES-256-GCM encryption for exchange API keys (server-side only).
//
// Master key resolution order:
//   1. Supabase Vault (function public.get_exchange_master_key, service role)
//   2. EXCHANGE_MASTER_KEY env var (bootstrap / local dev)
//
// Format of encrypted values: "v1:<iv b64>:<authTag b64>:<ciphertext b64>"
// iv = 12 random bytes, authTag = 16 bytes (GCM integrity).
//
// Rotation: see pipeline/rotate_exchange_master_key.py. Decryption reads the
// current key, then the previous one (kept as exchange_master_key_prev for a
// grace window) so rows written between rotation steps stay decryptable.

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { getServiceSupabase } from './supabase';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
// GCM authTag is fixed at 16 bytes for aes-256-gcm; the payload layout is
// "v1:<iv>:<tag>:<ct>" so the tag length is implicit per format version.

let cachedKey: Buffer | null = null;

function isHexKey(value: string): boolean {
  return /^[0-9a-fA-F]{64}$/.test(value.trim());
}

async function keyFromVault(): Promise<string | null> {
  try {
    const { data, error } = await getServiceSupabase().rpc('get_exchange_master_key');
    if (error || typeof data !== 'string' || !data) return null;
    return isHexKey(data) ? data.trim() : null;
  } catch {
    return null;
  }
}

export async function getMasterKey(): Promise<Buffer> {
  if (cachedKey) return cachedKey;
  const vaultKey = await keyFromVault();
  const raw = vaultKey || process.env.EXCHANGE_MASTER_KEY || '';
  if (!isHexKey(raw)) {
    throw new Error(
      'EXCHANGE_MASTER_KEY is not configured. Set it as a Supabase Vault secret ' +
        "(vault.create_secret name='exchange_master_key', 64 hex chars = 32 bytes) " +
        'or as the EXCHANGE_MASTER_KEY env var.'
    );
  }
  cachedKey = Buffer.from(raw.trim(), 'hex');
  return cachedKey;
}

// Test hook (rotation script / tests): invalidate the cached key.
export function resetMasterKeyCache(): void {
  cachedKey = null;
}

export function encryptSecret(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`;
}

export function decryptSecret(payload: string, key: Buffer): string {
  const parts = payload.split(':');
  if (parts.length !== 4 || parts[0] !== 'v1') {
    throw new Error('Unsupported encrypted payload format');
  }
  const iv = Buffer.from(parts[1], 'base64');
  const tag = Buffer.from(parts[2], 'base64');
  const ct = Buffer.from(parts[3], 'base64');
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}

// Convenience async wrappers used by API routes.
export async function encryptSecretAsync(plaintext: string): Promise<string> {
  return encryptSecret(plaintext, await getMasterKey());
}

export async function decryptSecretAsync(payload: string): Promise<string> {
  return decryptSecret(payload, await getMasterKey());
}
