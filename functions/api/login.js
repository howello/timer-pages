import { createSession } from './_utils.js';

export async function onRequestPost({ request, env }) {
  // Check if password is configured
  if (!env.PASSWORD || env.PASSWORD === '') {
    return new Response(JSON.stringify({ ok: false, error: '配置错误' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Parse request body
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: '请求格式错误' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const input = body.password || '';

  // Constant-time comparison
  const encoder = new TextEncoder();
  const inputBuf = encoder.encode(input);
  const passBuf = encoder.encode(env.PASSWORD);

  if (inputBuf.byteLength !== passBuf.byteLength) {
    return new Response(JSON.stringify({ ok: false, error: '密码错误' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  let equal = 0;
  for (let i = 0; i < inputBuf.byteLength; i++) {
    equal |= inputBuf[i] ^ passBuf[i];
  }

  if (equal !== 0) {
    return new Response(JSON.stringify({ ok: false, error: '密码错误' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Create session
  const sessionSecret = env.SESSION_SECRET || 'fallback-secret-do-not-use-in-production';
  const payload = { exp: Date.now() + 86400000, v: 1 };
  const token = await createSession(payload, sessionSecret);

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': `cd_session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=86400`
    }
  });
}