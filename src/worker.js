/**
 * Cloudflare Workers 入口 — 统一处理 /api/* 与静态资源
 */

/**
 * Parse Cookie header into key-value object
 */
function parseCookie(cookieHeader) {
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
function base64urlEncode(buf) {
  const base64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Base64url decode
 */
function base64urlDecode(str) {
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
async function createSession(payload, secret) {
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
async function verifySession(token, secret) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [payloadB64, sigB64] = parts;

  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const expectedSig = base64urlDecode(sigB64);
  const valid = await crypto.subtle.verify('HMAC', key, expectedSig, new TextEncoder().encode(payloadB64));
  if (!valid) return null;

  try {
    const decoded = base64urlDecode(payloadB64);
    const payloadStr = new TextDecoder().decode(decoded);
    const payload = JSON.parse(payloadStr);

    if (payload.exp && Date.now() > payload.exp) return null;

    return payload;
  } catch (e) {
    return null;
  }
}

/**
 * 统一 JSON 响应工具
 */
function jsonResponse(body, status, extraHeaders) {
  const headers = { 'Content-Type': 'application/json' };
  if (extraHeaders) Object.assign(headers, extraHeaders);
  return new Response(JSON.stringify(body), { status, headers });
}

const SESSION_COOKIE_ATTRS = 'HttpOnly; Secure; SameSite=Strict; Path=/';

// 受保护端点：除以下公开路径外，均需会话校验
const PUBLIC_API_PATHS = ['/api/login', '/api/logout', '/api/session', '/api/config'];

/**
 * 会话鉴权守卫：受保护端点校验 cd_session
 * 返回 { payload } 通过；返回 { response } 拒绝（401/500）
 */
async function requireSession(request, env) {
  if (!env.SESSION_SECRET || env.SESSION_SECRET === '') {
    return { response: jsonResponse({ error: 'configuration error' }, 500) };
  }
  const cookie = parseCookie(request.headers.get('Cookie') || '');
  const token = cookie.cd_session;
  const payload = await verifySession(token, env.SESSION_SECRET);
  if (!payload) {
    return { response: jsonResponse({ error: 'unauthorized' }, 401) };
  }
  return { payload };
}

async function handleLogin(request, env) {
  if (!env.PASSWORD || env.PASSWORD === '') {
    return jsonResponse({ ok: false, error: '配置错误' }, 500);
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return jsonResponse({ ok: false, error: '请求格式错误' }, 400);
  }

  const input = body.password || '';

  // 常量时间比较
  const encoder = new TextEncoder();
  const inputBuf = encoder.encode(input);
  const passBuf = encoder.encode(env.PASSWORD);

  if (inputBuf.byteLength !== passBuf.byteLength) {
    return jsonResponse({ ok: false, error: '密码错误' }, 401);
  }

  let equal = 0;
  for (let i = 0; i < inputBuf.byteLength; i++) {
    equal |= inputBuf[i] ^ passBuf[i];
  }

  if (equal !== 0) {
    return jsonResponse({ ok: false, error: '密码错误' }, 401);
  }

  if (!env.SESSION_SECRET || env.SESSION_SECRET === '') {
    return jsonResponse({ ok: false, error: '配置错误' }, 500);
  }

  const payload = { exp: Date.now() + 86400000, v: 1 };
  const token = await createSession(payload, env.SESSION_SECRET);

  return jsonResponse({ ok: true }, 200, {
    'Set-Cookie': `cd_session=${token}; ${SESSION_COOKIE_ATTRS}; Max-Age=86400`
  });
}

function handleLogout() {
  return jsonResponse({ ok: true }, 200, {
    'Set-Cookie': `cd_session=; ${SESSION_COOKIE_ATTRS}; Max-Age=0`
  });
}

async function handleSession(request, env) {
  const guard = await requireSession(request, env);
  if (guard.response) return guard.response;
  return jsonResponse({ authed: true }, 200);
}

function handleConfig() {
  const config = {
    holidayFreeNames: ['春节', '清明节', '劳动节', '国庆节']
  };
  return jsonResponse(config, 200, {
    'Cache-Control': 'public, max-age=3600, s-maxage=3600'
  });
}

async function handleHolidays(yearParam) {
  const year = /^\d{4}$/.test(yearParam) ? yearParam : String(new Date().getFullYear());
  const upstreamUrl = `https://api.jiejiariapi.com/v1/holidays/${year}`;

  let upstream;
  try {
    upstream = await fetch(upstreamUrl);
  } catch (e) {
    return jsonResponse({ error: '上游服务不可用' }, 502);
  }

  const body = await upstream.text();

  return new Response(body, {
    status: upstream.status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600'
    }
  });
}

const DEFAULT_CONFIG = { version: 1, events: [], holidayMeta: {} };

async function handleGetData(env) {
  try {
    const result = await env.DB.prepare('SELECT data FROM app_config WHERE id = 1').first();
    if (!result) {
      return jsonResponse(DEFAULT_CONFIG, 200);
    }
    return new Response(result.data, {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (e) {
    // 表不存在等异常：降级返回默认空配置
    return jsonResponse(DEFAULT_CONFIG, 200);
  }
}

async function handlePutData(request, env) {
  const body = await request.text();
  const updatedAt = new Date().toISOString();

  try {
    await env.DB.prepare(
      'INSERT INTO app_config (id, data, updated_at) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at'
    ).bind(body, updatedAt).run();
    return jsonResponse({ ok: true }, 200);
  } catch (e) {
    return jsonResponse({ ok: false, error: '写入失败' }, 500);
  }
}

async function handleApi(request, env) {
  const url = new URL(request.url);
  const pathname = url.pathname;
  const method = request.method;

  // /api/holidays/:year —— 必须在 PUBLIC_API_PATHS 的 startsWith 判断之前单独匹配
  const holidaysMatch = pathname.match(/^\/api\/holidays\/([^/]+)$/);

  const isPublic = PUBLIC_API_PATHS.some(
    p => pathname === p || pathname.startsWith(p + '/')
  ) || !!holidaysMatch;

  // 公开端点直接路由
  if (isPublic) {
    if (pathname === '/api/login' && method === 'POST') return handleLogin(request, env);
    if (pathname === '/api/logout' && method === 'POST') return handleLogout();
    if (pathname === '/api/session' && method === 'GET') return handleSession(request, env);
    if (pathname === '/api/config' && method === 'GET') return handleConfig();
    if (holidaysMatch && method === 'GET') return handleHolidays(holidaysMatch[1]);
    return jsonResponse({ error: 'not found' }, 404);
  }

  // 受保护端点统一校验
  const guard = await requireSession(request, env);
  if (guard.response) return guard.response;

  if (pathname === '/api/data' && method === 'GET') return handleGetData(env);
  if (pathname === '/api/data' && method === 'PUT') return handlePutData(request, env);

  return jsonResponse({ error: 'not found' }, 404);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      return handleApi(request, env);
    }
    return env.ASSETS.fetch(request);
  }
};
