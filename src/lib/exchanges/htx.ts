// HTX (Huobi) adapter. Auth: AWS-style signature v2 with canonical query.
// Docs: https://huobiapi.github.io/docs/spot/v1/en/#request-signature
import { encodeRFC3986, hmacB64, httpGet } from './signing';
import type { ExchangeAdapter } from './types';

const htx: ExchangeAdapter = {
  id: 'htx',
  async testConnection(apiKey, apiSecret) {
    try {
      const ts = new Date().toISOString().replace(/\.\d{3}Z$/, '');
      const host = 'api.huobi.pro';
      const path = '/v1/account/accounts';
      const params: Record<string, string> = {
        AccessKeyId: apiKey,
        SignatureMethod: 'HmacSHA256',
        SignatureVersion: '2',
        Timestamp: ts,
      };
      const canonicalQuery = Object.keys(params)
        .sort()
        .map((k) => `${encodeRFC3986(k)}=${encodeRFC3986(params[k])}`)
        .join('&');
      const signature = hmacB64(apiSecret, `GET\n${host}\n${path}\n${canonicalQuery}`);
      const { status, body } = await httpGet(`https://${host}${path}?${canonicalQuery}&Signature=${encodeRFC3986(signature)}`, {
        'Content-Type': 'application/json',
      });
      if (status === 200) {
        try {
          const data = JSON.parse(body);
          if (data.status === 'ok') return { ok: true };
          return { ok: false, error: `HTX: ${data['err-msg'] || data.status || 'unknown error'}` };
        } catch {
          return { ok: false, error: 'HTX returned an unparseable response.' };
        }
      }
      if (status === 401 || status === 403) return { ok: false, error: 'API key or secret incorrect.' };
      return { ok: false, error: `HTX returned HTTP ${status}.` };
    } catch (e) {
      return { ok: false, error: `Network error: ${e instanceof Error ? e.message : 'unknown'}` };
    }
  },
};

export default htx;
