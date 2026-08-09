// Kraken adapter. Auth: base64 HMAC-SHA512 over "SHA256(nonce+postdata) + path".
// Docs: https://docs.kraken.com/rest/#section/Authentication
import { hmacSha512B64, httpPost, sha256Raw } from './signing';
import type { ExchangeAdapter } from './types';

const kraken: ExchangeAdapter = {
  id: 'kraken',
  async testConnection(apiKey, apiSecret) {
    try {
      const path = '/0/private/Balance';
      const nonce = String(Date.now() * 1000);
      const postdata = `nonce=${nonce}`;
      const hash = sha256Raw(`${nonce}${postdata}`);
      const signature = hmacSha512B64(apiSecret, `${path}${hash.toString('binary')}`);
      const { status, body } = await httpPost(
        `https://api.kraken.com${path}`,
        { 'API-Key': apiKey, 'API-Sign': signature, 'Content-Type': 'application/x-www-form-urlencoded' },
        postdata
      );
      if (status === 200) {
        try {
          const data = JSON.parse(body);
          if (Array.isArray(data.error) && data.error.length === 0 && data.result) return { ok: true };
          return { ok: false, error: `Kraken: ${data.error?.join(', ') || 'unknown error'}` };
        } catch {
          return { ok: false, error: 'Kraken returned an unparseable response.' };
        }
      }
      if (status === 401 || status === 403) return { ok: false, error: 'API key or secret incorrect.' };
      return { ok: false, error: `Kraken returned HTTP ${status}.` };
    } catch (e) {
      return { ok: false, error: `Network error: ${e instanceof Error ? e.message : 'unknown'}` };
    }
  },
};

export default kraken;
