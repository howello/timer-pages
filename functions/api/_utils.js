/**
 * Cloudflare Pages Functions — 公共工具函数
 */

/**
 * Parse Cookie header into key-value object
 */
export function parseCookie(cookieHeader) {
  const obj = {};
  if (!cookieHeader) return obj;
  cookieHeader.split(';').forEach(pair => {
    const parts = pair.trim().split('=');
    if (parts.length >= 2) {
      obj[parts[0].trim()] = parts.slice(1).join('=').trim();
    }
  });
  return obj;
}

/**
 * Base64url encode (URL-safe, no padding)
 */
export function base64urlEncode(buf) {
  const base64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Base64url decode
 */
export function base64urlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  const binaryStr = atob(str);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
  return bytes;
}

/**
 * Create signed session token
 * payload: { exp: number, v: number }
 * Returns: "base64url(payload).base64url(hmac)"
 */
export async function createSession(payload, secret) {
  const payloadStr = JSON.stringify(payload);
  const payloadBytes = new TextEncoder().encode(payloadStr);
  const payloadB64 = base64urlEncode(payloadBytes);

  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payloadB64));
  const sigB64 = base64urlEncode(sig);

  return payloadB64 + '.' + sigB64;
}

/**
 * Verify and decode session token
 * Returns: payload object | null
 */
export async function verifySession(token, secret) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [payloadB64, sigB64] = parts;

  // Verify signature
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const expectedSig = base64urlDecode(sigB64);
  const valid = await crypto.subtle.verify('HMAC', key, expectedSig, new TextEncoder().encode(payloadB64));
  if (!valid) return null;

  // Decode payload
  try {
    const decoded = base64urlDecode(payloadB64);
    const payloadStr = new TextDecoder().decode(decoded);
    const payload = JSON.parse(payloadStr);

    // Check expiry
    if (payload.exp && Date.now() > payload.exp) return null;

    return payload;
  } catch (e) {
    return null;
  }
}