// Coinbase Advanced Trade adapter. Auth: ES256 (P-256) JWT signed with the
// private key that ships with the API key. The "API Secret" field in the form
// holds the private key (PEM) downloaded when the key was created.
// Docs: https://docs.cdp.coinbase.com/advanced-trade/docs/rest-auth
import { httpGet, signJwtEs256 } from './signing';
import type { ExchangeAdapter } from './types';

const coinbase: ExchangeAdapter = {
  id: 'coinbase',
  async testConnection(apiKey, apiSecret) {
    try {
      const keyName = apiKey.trim();
      const privateKey = apiSecret.trim();
      if (!privateKey.includes('-----BEGIN')) {
        return { ok: false, error: 'Coinbase Advanced requires the PRIVATE KEY (PEM) in the secret field.' };
      }
      const now = Math.floor(Date.now() / 1000);
      const jwt = signJwtEs256(
        privateKey,
        { alg: 'ES256', kid: keyName, nonce: crypto.randomUUID(), typ: 'JWT' },
        { sub: keyName, iss: 'cdp', nbf: now - 30, exp: now + 90 }
      );
      const { status } = await httpGet('https://api.coinbase.com/api/v3/brokerage/accounts', {
        Authorization: `Bearer ${jwt}`,
      });
      if (status === 200) return { ok: true };
      if (status === 401 || status === 403) return { ok: false, error: 'API key or private key incorrect.' };
      return { ok: false, error: `Coinbase returned HTTP ${status}.` };
    } catch (e) {
      return { ok: false, error: `Network error: ${e instanceof Error ? e.message : 'unknown'}` };
    }
  },
};

export default coinbase;
