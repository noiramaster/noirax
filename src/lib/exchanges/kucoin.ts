// KuCoin adapter. Auth: base64 HMAC-SHA256 over "ts + method + path + body".
// Requires the API passphrase set at key creation.
// Docs: https://www.kucoin.com/docs/rest/authentication
import { hmacB64, httpGet } from './signing';
import type { ExchangeAdapter, TestResult } from './types';

const kucoin: ExchangeAdapter = {
  id: 'kucoin',
  async testConnection(apiKey, apiSecret, passphrase) {
    if (!passphrase) return { ok: false, error: 'KuCoin requires the API passphrase — add it in the form.' };
    try {
      const ts = Date.now();
      const path = '/api/v2/accounts';
      const signature = hmacB64(apiSecret, `${ts}GET${path}`);
      const { status, body } = await httpGet(`https://api.kucoin.com${path}`, {
        'KC-API-KEY': apiKey,
        'KC-API-SIGN': signature,
        'KC-API-TIMESTAMP': String(ts),
        'KC-API-PASSPHRASE': passphrase,
        'KC-API-KEY-VERSION': '2',
      });
      if (status === 200) {
        try {
          const data = JSON.parse(body);
          if (data.code === '200000') return { ok: true };
          return { ok: false, error: `KuCoin: ${data.msg || data.code || 'unknown error'}` };
        } catch {
          return { ok: false, error: 'KuCoin returned an unparseable response.' };
        }
      }
      if (status === 401 || status === 403) return { ok: false, error: 'API key, secret or passphrase incorrect.' };
      return { ok: false, error: `KuCoin returned HTTP ${status}.` };
    } catch (e) {
      return { ok: false, error: `Network error: ${e instanceof Error ? e.message : 'unknown'}` };
    }
  },
};

export default kucoin;
