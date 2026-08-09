// Binance adapter. Auth: HMAC-SHA256 signature over the query string.
// Docs: https://developers.binance.com/docs/binance-spot-api-docs/rest-api
import { hmacHex, httpGet } from './signing';
import type { ExchangeAdapter } from './types';

const binance: ExchangeAdapter = {
  id: 'binance',
  async testConnection(apiKey, apiSecret) {
    try {
      const ts = Date.now();
      const query = `timestamp=${ts}`;
      const signature = hmacHex(apiSecret, query);
      const { status } = await httpGet(`https://api.binance.com/api/v3/account?${query}&signature=${signature}`, {
        'X-MBX-APIKEY': apiKey,
      });
      if (status === 200) return { ok: true };
      if (status === 401) return { ok: false, error: 'API key or secret incorrect.' };
      if (status === 403) return { ok: false, error: 'Key rejected (check trading-only permissions).' };
      if (status === 451) return { ok: false, error: 'Binance geo-blocked this server — validation unavailable from here.' };
      return { ok: false, error: `Binance returned HTTP ${status}.` };
    } catch (e) {
      return { ok: false, error: `Network error: ${e instanceof Error ? e.message : 'unknown'}` };
    }
  },
};

export default binance;
