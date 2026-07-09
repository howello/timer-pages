import { parseCookie, verifySession } from './api/_utils.js';

const PUBLIC_PATHS = ['/api/login', '/api/logout', '/api/session', '/api/config'];

export async function onRequest({ request, next, env }) {
  const url = new URL(request.url);

  // Allow public paths without auth
  if (PUBLIC_PATHS.some(p => url.pathname === p || url.pathname.startsWith(p + '/'))) {
    return next();
  }

  // Check session cookie
  const cookie = parseCookie(request.headers.get('Cookie') || '');
  const token = cookie.cd_session;
  if (!env.SESSION_SECRET || env.SESSION_SECRET === '') {
    return new Response(JSON.stringify({ error: 'configuration error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (!token || !(await verifySession(token, env.SESSION_SECRET))) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  return next();
}