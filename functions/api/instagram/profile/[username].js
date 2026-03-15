const HOST = 'instagram-scraper-api2.p.rapidapi.com';

export async function onRequestGet(context) {
  const { env, params } = context;
  const username = params.username;
  const key = env.RAPIDAPI_KEY || env.VITE_RAPIDAPI_KEY;

  if (!username) {
    return new Response(JSON.stringify({ error: 'username 필요' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (!key) {
    return new Response(
      JSON.stringify({ error: 'RAPIDAPI_KEY가 설정되지 않았습니다. Cloudflare Pages 환경 변수를 확인하세요.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const url = `https://${HOST}/v1/profile?username_or_id=${encodeURIComponent(username)}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'X-RapidAPI-Key': key,
        'X-RapidAPI-Host': HOST,
      },
    });

    const text = await res.text();
    if (!res.ok) {
      return new Response(
        JSON.stringify({ error: 'RapidAPI 호출 실패', detail: text.slice(0, 500) }),
        { status: res.status, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const data = JSON.parse(text || '{}');
    return new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message || '서버 오류' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
