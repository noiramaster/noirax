// OKX adapter. Auth: base64 HMAC-SHA256 over "ts + method + path", passphrase required.
// Docs: https://www.okx.com/docs-v5/en/#rest-api-authentication
import { hmacB64, httpGet } from './signing';
import type { ExchangeAdapter, TestResult } from './types';

const okx: ExchangeAdapter = {
  id: 'okx',
  async testConnection(apiKey, apiSecret, passphrase) {
    if (!passphrase) return { ok: false, error: 'OKX requires the API passphrase — add it in the form.' };
    try {
      const ts = new Date().toISOString();
      const path = '/api/v5/account/balance';
      const signature = hmacB64(apiSecret, `${ts}GET${path}`);
      const { status, body } = await httpGet(`https://www.okx.com${path}`, {
        'OK-ACCESS-KEY': apiKey,
        'OK-ACCESS-SIGN': signature,
        'OK-ACCESS-TIMESTAMP': ts,
        'OK-ACCESS-PASSPHRASE': passphrase,
      });
      if (status === 200) {
        try {
          const data = JSON.parse(body);
          if (data.code === '0') return { ok: true };
          return { ok: false, error: `OKX: ${data.msg || 'unknown error'}` };
        } catch {
          return { ok: false, error: 'OKX returned an unparseable response.' };
        }
      }
      return { ok: false, error: `OKX returned HTTP ${status}.` };
    } catch (e) {
      return { ok: false, error: `Network error: ${e instanceof Error ? e.message : 'unknown'}` };
    }
  },
};

export default okx;
