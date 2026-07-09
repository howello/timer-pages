/**
 * OSS data read/write via Cloudflare Pages Functions
 * Uses Aliyun OSS V4 signature for REST API calls
 */

function buildOSSURL(env) {
  const region = env.OSS_REGION || 'oss-cn-hangzhou';
  const bucket = env.OSS_BUCKET || 'howe-file';
  const objectKey = env.OSS_OBJECT_KEY || 'countdown-data.json';
  return `https://${bucket}.${region}.aliyuncs.com/${objectKey}`;
}

async function sha256Hex(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function hmacSha256Raw(key, str) {
  const keyBuf = typeof key === 'string' ? new TextEncoder().encode(key) : key;
  const impKey = await crypto.subtle.importKey('raw', keyBuf, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return await crypto.subtle.sign('HMAC', impKey, new TextEncoder().encode(str));
}

async function getSigningKey(secret, dateStr, region) {
  const kDate = await hmacSha256Raw('OSS4-HMAC-SHA256' + secret, dateStr);
  const kRegion = await hmacSha256Raw(kDate, region);
  const kService = await hmacSha256Raw(kRegion, 'oss');
  return await hmacSha256Raw(kService, 'aliyun_v4_request');
}

async function signOSSRequest(method, url, env, body) {
  const accessKeyId = env.OSS_AK;
  const accessKeySecret = env.OSS_SK;
  const region = env.OSS_REGION || 'oss-cn-hangzhou';
  const bucket = env.OSS_BUCKET || 'howe-file';

  const urlObj = new URL(url);
  const objectKey = urlObj.pathname.substring(1);

  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  const hour = String(now.getUTCHours()).padStart(2, '0');
  const minute = String(now.getUTCMinutes()).padStart(2, '0');
  const second = String(now.getUTCSeconds()).padStart(2, '0');
  const dateStr = `${year}${month}${day}T${hour}${minute}${second}Z`;
  const dateStrShort = `${year}${month}${day}`;

  const headers = {
    'host': urlObj.host,
    'x-oss-date': dateStr,
    'x-oss-content-sha256': 'UNSIGNED-PAYLOAD'
  };

  if (body) {
    headers['content-type'] = 'application/json';
  }

  const sortedKeys = Object.keys(headers).sort();
  const canonicalHeaders = sortedKeys.map(k => `${k.toLowerCase()}:${headers[k]}\n`).join('');
  const signedHeaders = sortedKeys.map(k => k.toLowerCase()).join(';');

  const canonicalRequest = [
    method,
    '/' + objectKey,
    '',
    canonicalHeaders,
    signedHeaders,
    'UNSIGNED-PAYLOAD'
  ].join('\n');

  const credentialScope = `${dateStrShort}/${region}/oss/aliyun_v4_request`;
  const stringToSign = [
    'OSS4-HMAC-SHA256',
    dateStr,
    credentialScope,
    await sha256Hex(canonicalRequest)
  ].join('\n');

  const signingKey = await getSigningKey(accessKeySecret, dateStrShort, region);
  const sigBuf = await hmacSha256Raw(signingKey, stringToSign);
  const signature = Array.from(new Uint8Array(sigBuf)).map(b => b.toString(16).padStart(2, '0')).join('');

  const auth = `OSS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope},SignedHeaders=${signedHeaders},Signature=${signature}`;

  return { auth, dateStr };
}

export async function onRequestGet({ request, env }) {
  const { parseCookie, verifySession } = await import('./_utils.js');
  const cookie = parseCookie(request.headers.get('Cookie') || '');
  const token = cookie.cd_session;
  if (!env.SESSION_SECRET || env.SESSION_SECRET === '') {
    return new Response(JSON.stringify({ error: 'configuration error' }), { status: 500 });
  }

  const session = await verifySession(token, env.SESSION_SECRET);
  if (!session) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
  }

  const url = buildOSSURL(env);
  let sig;
  try {
    sig = await signOSSRequest('GET', url, env);
  } catch (e) {
    return new Response(JSON.stringify({ version: 1, events: [], holidayMeta: {} }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const fetchHeaders = { Authorization: sig.auth, 'x-oss-date': sig.dateStr, 'x-oss-content-sha256': 'UNSIGNED-PAYLOAD' };

  try {
    const resp = await fetch(url, { headers: fetchHeaders });
    const body = await resp.text();
    return new Response(body, {
      status: resp.status,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ version: 1, events: [], holidayMeta: {} }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

export async function onRequestPut({ request, env }) {
  const { parseCookie, verifySession } = await import('./_utils.js');
  const cookie = parseCookie(request.headers.get('Cookie') || '');
  const token = cookie.cd_session;
  if (!env.SESSION_SECRET || env.SESSION_SECRET === '') {
    return new Response(JSON.stringify({ error: 'configuration error' }), { status: 500 });
  }

  const session = await verifySession(token, env.SESSION_SECRET);
  if (!session) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
  }

  const body = await request.text();
  const url = buildOSSURL(env);

  let sig;
  try {
    sig = await signOSSRequest('PUT', url, env, body);
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: '签名失败' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const fetchHeaders = {
    Authorization: sig.auth,
    'x-oss-date': sig.dateStr,
    'x-oss-content-sha256': 'UNSIGNED-PAYLOAD',
    'Content-Type': 'application/json'
  };

  try {
    const resp = await fetch(url, { method: 'PUT', headers: fetchHeaders, body });
    return new Response(JSON.stringify({ ok: resp.ok }), {
      status: resp.ok ? 200 : 502,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: '写入OSS失败' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}