export async function onRequestGet({ params }) {
  const year = /^\d{4}$/.test(params.year) ? params.year : String(new Date().getFullYear());
  const upstreamUrl = `https://api.jiejiariapi.com/v1/holidays/${year}`;

  let upstream;
  try {
    upstream = await fetch(upstreamUrl);
  } catch (e) {
    return new Response(JSON.stringify({ error: '上游服务不可用' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' }
    });
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