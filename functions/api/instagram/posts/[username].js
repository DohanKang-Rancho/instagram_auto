const HOST = 'instagram120.p.rapidapi.com';
const PAGE_LIMIT = 20;

function getEdges(payload) {
  if (!payload || typeof payload !== 'object') return [];
  const obj = payload;
  const result = typeof obj.result === 'object' && obj.result ? obj.result : {};
  return result.edges ?? result.items ?? result.posts ?? obj.data ?? obj.items ?? obj.posts ?? [];
}

function getNextMaxId(payload) {
  if (!payload || typeof payload !== 'object') return '';
  const obj = payload;
  const result = typeof obj.result === 'object' && obj.result ? obj.result : {};
  const pageInfo =
    typeof result.page_info === 'object' && result.page_info
      ? result.page_info
      : typeof obj.page_info === 'object' && obj.page_info
        ? obj.page_info
        : {};

  const candidates = [
    result.next_max_id,
    obj.next_max_id,
    result.max_id,
    obj.max_id,
    result.end_cursor,
    obj.end_cursor,
    pageInfo.end_cursor,
    pageInfo.next_max_id,
  ];

  return String(candidates.find((value) => typeof value === 'string' && value) ?? '');
}

function getOldestTimestamp(edges) {
  let oldest = null;

  for (const edge of edges) {
    if (!edge || typeof edge !== 'object') continue;
    const item = edge;
    const node = typeof item.node === 'object' && item.node ? item.node : item;
    const raw = node.taken_at ?? node.timestamp ?? item.taken_at ?? item.timestamp;
    const value = typeof raw === 'number' ? raw : Number(raw);
    if (Number.isFinite(value)) {
      oldest = oldest == null ? value : Math.min(oldest, value);
    }
  }

  return oldest;
}

export async function onRequestGet(context) {
  const { env, params, request } = context;
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
    const requestUrl = new URL(request.url);
    const startDate = requestUrl.searchParams.get('startDate');
    const minTimestamp = startDate
      ? Math.floor(new Date(`${startDate}T00:00:00Z`).getTime() / 1000)
      : null;

    const allEdges = [];
    let firstPayload = null;
    let nextMaxId = '';
    let fetchedPages = 0;

    for (let page = 0; page < PAGE_LIMIT; page += 1) {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-RapidAPI-Key': key,
          'X-RapidAPI-Host': HOST,
        },
        body: JSON.stringify({ username, maxId: nextMaxId }),
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

      const payload = JSON.parse(text || '{}');
      if (!firstPayload) firstPayload = payload;

      const edges = getEdges(payload);
      if (!Array.isArray(edges) || edges.length === 0) break;

      allEdges.push(...edges);
      fetchedPages += 1;

      const oldestTimestamp = getOldestTimestamp(edges);
      const candidate = getNextMaxId(payload);

      if (!candidate || candidate === nextMaxId) break;
      if (minTimestamp != null && oldestTimestamp != null && oldestTimestamp <= minTimestamp) {
        nextMaxId = candidate;
        break;
      }

      nextMaxId = candidate;
    }

    const merged = {
      ...(firstPayload && typeof firstPayload === 'object' ? firstPayload : {}),
      result: {
        ...(
          firstPayload &&
          typeof firstPayload === 'object' &&
          typeof firstPayload.result === 'object' &&
          firstPayload.result
            ? firstPayload.result
            : {}
        ),
        edges: allEdges,
        next_max_id: nextMaxId,
        fetched_pages: fetchedPages,
      },
    };

    return new Response(JSON.stringify(merged), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message || '서버 오류' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
