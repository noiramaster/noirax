import { createHmac, createHash, createSign } from 'crypto';

export const hmacHex = (secret: string, data: string) => createHmac('sha256', secret).update(data).digest('hex');
export const hmacB64 = (secret: string, data: string) => createHmac('sha256', secret).update(data).digest('base64');
export const hmacSha512Hex = (secret: string, data: string) => createHmac('sha512', secret).update(data).digest('hex');
export const hmacSha512B64 = (secret: string, data: string) => createHmac('sha512', secret).update(data).digest('base64');
export const sha256Hex = (data: string) => createHash('sha256').update(data).digest('hex');
export const sha256Raw = (data: string) => createHash('sha256').update(data).digest();
export const sha512Hex = (data: string) => createHash('sha512').update(data).digest('hex');

// RFC 3986 percent-encoding (HTX-style canonical queries).
export const encodeRFC3986 = (v: string) =>
  encodeURIComponent(v).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

export interface HttpResult {
  status: number;
  body: string;
}

export async function httpGet(url: string, headers: Record<string, string>): Promise<HttpResult> {
  const resp = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
  return { status: resp.status, body: await resp.text() };
}

export async function httpPost(url: string, headers: Record<string, string>, body: string): Promise<HttpResult> {
  const resp = await fetch(url, { method: 'POST', headers, body, signal: AbortSignal.timeout(15000) });
  return { status: resp.status, body: await resp.text() };
}

// ES256 (ECDSA P-256) JWT signer used by Coinbase Advanced Trade.
export function signJwtEs256(privateKeyPem: string, header: Record<string, string>, payload: Record<string, unknown>): string {
  const b64url = (obj: Record<string, unknown>) =>
    Buffer.from(JSON.stringify(obj)).toString('base64url');
  const signingInput = `${b64url(header)}.${b64url(payload)}`;
  const signature = createSign('sha256').update(signingInput).sign(privateKeyPem, 'base64url');
  return `${signingInput}.${signature}`;
}
