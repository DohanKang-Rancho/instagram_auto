const HOST = 'instagram120.p.rapidapi.com';

async function requestProfile(url, init) {
  const res = await fetch(url, init);
  const text = await res.text();
  let data = null;

  try {
    data = JSON.parse(text || '{}');
  } catch {
    data = { raw: text };
  }

  return { res, data, text };
}

function hasFollowerData(payload) {
  if (!payload || typeof payload !== 'object') return false;
  const obj = payload;
  const result = typeof obj.result === 'object' && obj.result ? obj.result : {};
  const data = typeof obj.data === 'object' && obj.data ? obj.data : {};
  const candidates = [
    obj,
    result,
    data,
    result.user,
    data.user,
    obj.user,
    result.profile,
    data.profile,
    obj.profile,
  ];

  return candidates.some((candidate) => {
    if (!candidate || typeof candidate !== 'object') return false;
    return (
      candidate.follower_count != null ||
      candidate.followers != null ||
      (typeof candidate.edge_followed_by === 'object' &&
        candidate.edge_followed_by &&
        candidate.edge_followed_by.count != null)
    );
  });
}

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
    const baseHeaders = {
      'Content-Type': 'application/json',
      'X-RapidAPI-Key': key,
      'X-RapidAPI-Host': HOST,
    };
    const attempts = [
      {
        endpoint: '/api/instagram/profile',
        method: 'GET',
        url: `https://${HOST}/api/instagram/profile?username=${encodeURIComponent(username)}`,
      },
      {
        endpoint: '/api/instagram/profile',
        method: 'POST',
        url: `https://${HOST}/api/instagram/profile`,
        body: JSON.stringify({ username }),
      },
      {
        endpoint: '/api/instagram/user/info',
        method: 'GET',
        url: `https://${HOST}/api/instagram/user/info?username=${encodeURIComponent(username)}`,
      },
      {
        endpoint: '/api/instagram/user/info',
        method: 'POST',
        url: `https://${HOST}/api/instagram/user/info`,
        body: JSON.stringify({ username }),
      },
    ];

    const failures = [];

    for (const attempt of attempts) {
      const { res, data, text } = await requestProfile(attempt.url, {
        method: attempt.method,
        headers: baseHeaders,
        body: attempt.body,
      });

      if (res.ok && hasFollowerData(data)) {
        return new Response(JSON.stringify(data), {
          headers: { 'Content-Type': 'application/json' },
        });
      }

      failures.push({
        endpoint: attempt.endpoint,
        method: attempt.method,
        status: res.status,
        statusText: res.statusText,
        detail: text.slice(0, 500),
      });
    }

    return new Response(
      JSON.stringify({
        error: 'RapidAPI 프로필 호출 실패',
        host: HOST,
        attempts: failures,
      }),
      { status: 502, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message || '서버 오류' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
