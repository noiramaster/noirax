// BingX adapter. Auth: base64 HMAC-SHA256 over "timestamp + queryString".
// Docs: https://bingx-api.github.io/docs/
import { hmacB64, httpGet } from './signing';
import type { ExchangeAdapter } from './types';

const bingx: ExchangeAdapter = {
  id: 'bingx',
  async testConnection(apiKey, apiSecret) {
    try {
      const ts = Date.now();
      const query = `timestamp=${ts}&recvWindow=10000`;
      const signature = hmacB64(apiSecret, `${ts}${query}`);
      const { status, body } = await httpGet(`https://api-swap.bingx.com/openApi/spot/v1/user/balance?${query}`, {
        'X-CH-APIKEY': apiKey,
        'X-CH-TS': String(ts),
        'X-CH-SIGN': signature,
      });
      if (status === 200) {
        try {
          const data = JSON.parse(body);
          if (data.code === 0) return { ok: true };
          return { ok: false, error: `BingX: ${data.msg || 'unknown error'}` };
        } catch {
          return { ok: false, error: 'BingX returned an unparseable response.' };
        }
      }
      if (status === 401 || status === 403) return { ok: false, error: 'API key or secret incorrect.' };
      return { ok: false, error: `BingX returned HTTP ${status}.` };
    } catch (e) {
      return { ok: false, error: `Network error: ${e instanceof Error ? e.message : 'unknown'}` };
    }
  },
};

export default bingx;
