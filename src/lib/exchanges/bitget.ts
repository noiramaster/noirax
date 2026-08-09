// Bitget adapter. Auth: base64 HMAC-SHA256 over "ts + method + path + query".
// Requires the API passphrase set at key creation.
// Docs: https://www.bitget.com/docs/spot/restapi/
import { hmacB64, httpGet } from './signing';
import type { ExchangeAdapter } from './types';

const bitget: ExchangeAdapter = {
  id: 'bitget',
  async testConnection(apiKey, apiSecret, passphrase) {
    if (!passphrase) return { ok: false, error: 'Bitget requires the API passphrase — add it in the form.' };
    try {
      const ts = Math.floor(Date.now() / 1000);
      const path = '/api/v2/spot/account/balance';
      const signature = hmacB64(apiSecret, `${ts}GET${path}`);
      const { status, body } = await httpGet(`https://api.bitget.com${path}`, {
        'ACCESS-KEY': apiKey,
        'ACCESS-SIGN': signature,
        'ACCESS-TIMESTAMP': String(ts),
        'ACCESS-PASSPHRASE': passphrase,
        'Content-Type': 'application/json',
        locale: 'en-US',
      });
      if (status === 200) {
        try {
          const data = JSON.parse(body);
          if (data.code === '00000') return { ok: true };
          return { ok: false, error: `Bitget: ${data.msg || data.code || 'unknown error'}` };
        } catch {
          return { ok: false, error: 'Bitget returned an unparseable response.' };
        }
      }
      if (status === 401 || status === 403) return { ok: false, error: 'API key, secret or passphrase incorrect.' };
      return { ok: false, error: `Bitget returned HTTP ${status}.` };
    } catch (e) {
      return { ok: false, error: `Network error: ${e instanceof Error ? e.message : 'unknown'}` };
    }
  },
};

export default bitget;
