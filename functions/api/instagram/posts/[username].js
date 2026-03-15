const HOST = 'instagram120.p.rapidapi.com';

export async function onRequestGet(context) {
  const { env, params } = context;
  const username = params.username;
  const key = env.RAPIDAPI_KEY || env.VITE_RAPIDAPI_KEY;

  if (!username || !key) {
    return new Response(
      JSON.stringify({ error: 'username 또는 RAPIDAPI_KEY 필요' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const url = `https://${HOST}/api/instagram/posts`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-RapidAPI-Key': key,
        'X-RapidAPI-Host': HOST,
      },
      body: JSON.stringify({ username, maxId: '' }),
    });

    const text = await res.text();
    if (!res.ok) {
      return new Response(
        JSON.stringify({
          error: 'RapidAPI 호출 실패',
          status: res.status,
          statusText: res.statusText,
          host: HOST,
          endpoint: '/api/instagram/posts',
          detail: text.slice(0, 1000),
        }),
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
