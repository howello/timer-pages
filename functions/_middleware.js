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
  const sessionSecret = env.SESSION_SECRET || 'fallback-secret-do-not-use-in-production';

  if (!token || !(await verifySession(token, sessionSecret))) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  return next();
}