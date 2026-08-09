// Bybit adapter. Auth: hex HMAC-SHA256 over "ts + apiKey + recvWindow + query".
// Docs: https://bybit-exchange.github.io/docs/v5/authentication
import { hmacHex, httpGet } from './signing';
import type { ExchangeAdapter } from './types';

const bybit: ExchangeAdapter = {
  id: 'bybit',
  async testConnection(apiKey, apiSecret) {
    try {
      const ts = Date.now();
      const recvWindow = '5000';
      const query = 'accountType=UNIFIED';
      const signature = hmacHex(apiSecret, `${ts}${apiKey}${recvWindow}${query}`);
      const { status, body } = await httpGet(`https://api.bybit.com/v5/account/wallet-balance?${query}`, {
        'X-BAPI-API-KEY': apiKey,
        'X-BAPI-TIMESTAMP': String(ts),
        'X-BAPI-RECV-WINDOW': recvWindow,
        'X-BAPI-SIGN': signature,
      });
      if (status === 200) {
        try {
          const data = JSON.parse(body);
          if (data.retCode === 0) return { ok: true };
          return { ok: false, error: `Bybit: ${data.retMsg || 'unknown error'}` };
        } catch {
          return { ok: false, error: 'Bybit returned an unparseable response.' };
        }
      }
      if (status === 401 || status === 403) return { ok: false, error: 'API key or secret incorrect.' };
      return { ok: false, error: `Bybit returned HTTP ${status}.` };
    } catch (e) {
      return { ok: false, error: `Network error: ${e instanceof Error ? e.message : 'unknown'}` };
    }
  },
};

export default bybit;
