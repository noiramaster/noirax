// Crypto.com Exchange adapter. Auth: base64 HMAC-SHA256 over
// "nonce + method + id + apiKey + paramsJson".
// Docs: https://exchange-docs.crypto.com/rest/index.html#section/Authentication
import { randomUUID } from 'crypto';
import { hmacB64, httpPost } from './signing';
import type { ExchangeAdapter } from './types';

const cryptocom: ExchangeAdapter = {
  id: 'cryptocom',
  async testConnection(apiKey, apiSecret) {
    try {
      const id = randomUUID();
      const method = 'private/get-account-summary';
      const nonce = Date.now();
      const paramsJson = '{}';
      const signature = hmacB64(apiSecret, `${nonce}${method}${id}${apiKey}${paramsJson}`);
      const body = JSON.stringify({
        id,
        method,
        api_key: apiKey,
        params: {},
        nonce,
      });
      const { status, body: respBody } = await httpPost(
        'https://api.crypto.com/exchange/v1/private/get-account-summary',
        {
          'Content-Type': 'application/json',
          'Access key': apiKey,
          'Access sign': signature,
          'Access timestamp': String(nonce),
        },
        body
      );
      if (status === 200) {
        try {
          const data = JSON.parse(respBody);
          if (data.code === 0) return { ok: true };
          return { ok: false, error: `Crypto.com: ${data.message || data.code || 'unknown error'}` };
        } catch {
          return { ok: false, error: 'Crypto.com returned an unparseable response.' };
        }
      }
      if (status === 401 || status === 403) return { ok: false, error: 'API key or secret incorrect.' };
      return { ok: false, error: `Crypto.com returned HTTP ${status}.` };
    } catch (e) {
      return { ok: false, error: `Network error: ${e instanceof Error ? e.message : 'unknown'}` };
    }
  },
};

export default cryptocom;
