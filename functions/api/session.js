import { verifySession, parseCookie } from './_utils.js';

export async function onRequestGet({ request, env }) {
  const cookie = parseCookie(request.headers.get('Cookie') || '');
  const token = cookie.cd_session;
  if (!env.SESSION_SECRET || env.SESSION_SECRET === '') {
    return new Response(JSON.stringify({ error: 'configuration error' }), { status: 500 });
  }

  const payload = await verifySession(token, env.SESSION_SECRET);
  if (!payload) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
  }

  return new Response(JSON.stringify({ authed: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}