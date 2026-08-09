// MEXC adapter. Auth: hex HMAC-SHA256 over the query string; timestamp passed
// both in the query and the X-MEXC-TIMESTAMP header.
// Docs: https://mexcdevelop.github.io/apidocs/spot_v3_en/
import { hmacHex, httpGet } from './signing';
import type { ExchangeAdapter } from './types';

const mexc: ExchangeAdapter = {
  id: 'mexc',
  async testConnection(apiKey, apiSecret) {
    try {
      const ts = Date.now();
      const query = `recvWindow=5000&timestamp=${ts}`;
      const signature = hmacHex(apiSecret, query);
      const { status, body } = await httpGet(`https://api.mexc.com/api/v3/account/info?${query}`, {
        'X-MEXC-APIKEY': apiKey,
        'X-MEXC-TIMESTAMP': String(ts),
        'X-MEXC-SIGN': signature,
      });
      if (status === 200) return { ok: true };
      if (status === 401 || status === 403) return { ok: false, error: 'API key or secret incorrect.' };
      return { ok: false, error: `MEXC returned HTTP ${status}${body ? `: ${body.slice(0, 120)}` : ''}.` };
    } catch (e) {
      return { ok: false, error: `Network error: ${e instanceof Error ? e.message : 'unknown'}` };
    }
  },
};

export default mexc;
