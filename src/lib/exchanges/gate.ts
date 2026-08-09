// Gate.io adapter. Auth: SIGN = hex(HMAC-SHA512(secret, SHA512(query + body + ts)))
// Docs: https://www.gate.io/docs/developers/apiv4/en/
import { hmacSha512Hex, httpGet, sha512Hex } from './signing';
import type { ExchangeAdapter } from './types';

const gate: ExchangeAdapter = {
  id: 'gate',
  async testConnection(apiKey, apiSecret) {
    try {
      const ts = Math.floor(Date.now() / 1000);
      // Empty query + empty body: payload = SHA512("" + "" + timestamp)
      const payload = sha512Hex(String(ts));
      const sign = hmacSha512Hex(apiSecret, payload);
      const { status, body } = await httpGet('https://api.gateio.ws/api/v4/spot/accounts', {
        KEY: apiKey,
        Timestamp: String(ts),
        SIGN: sign,
      });
      if (status === 200) return { ok: true };
      if (status === 401 || status === 403) return { ok: false, error: 'API key or secret incorrect.' };
      return { ok: false, error: `Gate.io returned HTTP ${status}${body ? `: ${body.slice(0, 120)}` : ''}.` };
    } catch (e) {
      return { ok: false, error: `Network error: ${e instanceof Error ? e.message : 'unknown'}` };
    }
  },
};

export default gate;
