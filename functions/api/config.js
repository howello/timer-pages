export async function onRequestGet() {
  const config = {
    holidayFreeNames: ['春节', '清明节', '劳动节', '国庆节']
  };
  return new Response(JSON.stringify(config), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600'
    }
  });
}