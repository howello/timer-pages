import { verifySession, parseCookie } from './_utils.js';

export async function onRequestGet({ request, env }) {
  const cookie = parseCookie(request.headers.get('Cookie') || '');
  const token = cookie.cd_session;
  const sessionSecret = env.SESSION_SECRET || 'fallback-secret-do-not-use-in-production';

  const payload = await verifySession(token, sessionSecret);
  if (!payload) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
  }

  return new Response(JSON.stringify({ authed: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}