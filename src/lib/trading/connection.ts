// Builds a ready-to-use exchange adapter for a stored connection: decrypts the
// API keys (AES-256-GCM via Vault/env), attaches testnet options and passphrase.
import { decryptSecretAsync } from '@/lib/exchangeCrypto';
import { getAdapter } from '@/lib/exchanges';
import type { ConnectionOpts, ExchangeAdapter } from '@/lib/exchanges/types';

/**
 * GLOBAL testnet switch. While TRADING_TESTNET_FORCE=true, EVERY connection is
 * executed against testnet/demo environments regardless of the per-connection
 * flag — no real money can move. Switching to real money = set this env var to
 * false in Vercel (and remove it when fully confident). See README.
 */
export function testnetForced(): boolean {
  return process.env.TRADING_TESTNET_FORCE === 'true';
}

export interface DecryptedConnection {
  adapter: ExchangeAdapter;
  apiKey: string;
  apiSecret: string;
  passphrase?: string;
  opts: ConnectionOpts;
}

export async function buildAdapterForConnection(conn: {
  exchange: string;
  api_key_enc: string;
  api_secret_enc: string;
  testnet?: boolean;
}): Promise<DecryptedConnection> {
  const adapter = getAdapter(conn.exchange);
  if (!adapter) throw new Error(`no adapter for exchange ${conn.exchange}`);
  const [apiKey, apiSecret] = await Promise.all([
    decryptSecretAsync(conn.api_key_enc),
    decryptSecretAsync(conn.api_secret_enc),
  ]);
  const opts: ConnectionOpts = { testnet: testnetForced() || !!conn.testnet };
  return { adapter, apiKey, apiSecret, opts };
}
