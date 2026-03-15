import express from 'express';
import cors from 'cors';

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || '';
const RAPIDAPI_INSTAGRAM_HOST = process.env.RAPIDAPI_INSTAGRAM_HOST || 'instagram120.p.rapidapi.com';
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

// RapidAPI Instagram API 호출 (instagram-scraper-api2 등 호환)
app.get('/api/instagram/profile/:username', async (req, res) => {
  const { username } = req.params;
  if (!username) {
    return res.status(400).json({ error: 'username 필요' });
  }
  if (!RAPIDAPI_KEY) {
    return res.status(500).json({ error: 'RAPIDAPI_KEY가 설정되지 않았습니다.' });
  }

  try {
    const host = RAPIDAPI_INSTAGRAM_HOST;
    const url = `https://${host}/v1/profile?username_or_id=${encodeURIComponent(username)}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-RapidAPI-Key': RAPIDAPI_KEY,
        'X-RapidAPI-Host': host,
      },
    });

    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({
        error: 'RapidAPI 호출 실패',
        detail: text.slice(0, 500),
      });
    }

    const data = await response.json();
    return res.json(data);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message || '서버 오류' });
  }
});

// 게시물 목록 (메트릭용)
app.get('/api/instagram/posts/:username', async (req, res) => {
  const { username } = req.params;
  if (!username || !RAPIDAPI_KEY) {
    return res.status(400).json({ error: 'username 또는 RAPIDAPI_KEY 필요' });
  }

  try {
    const host = 'instagram120.p.rapidapi.com';
    const url = `https://${host}/api/instagram/posts`;
    const startDate = typeof req.query.startDate === 'string' ? req.query.startDate : '';
    const minTimestamp = startDate
      ? Math.floor(new Date(`${startDate}T00:00:00Z`).getTime() / 1000)
      : null;

    const allEdges = [];
    let firstPayload = null;
    let nextMaxId = '';
    let fetchedPages = 0;

    for (let page = 0; page < PAGE_LIMIT; page += 1) {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-RapidAPI-Key': RAPIDAPI_KEY,
          'X-RapidAPI-Host': host,
        },
        body: JSON.stringify({ username, maxId: nextMaxId }),
      });

      const text = await response.text();
      if (!response.ok) {
        return res.status(response.status).json({
          error: 'RapidAPI 호출 실패',
          status: response.status,
          statusText: response.statusText,
          host,
          endpoint: '/api/instagram/posts',
          detail: text.slice(0, 1000),
        });
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

    return res.json(merged);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message || '서버 오류' });
  }
});

app.listen(PORT, () => {
  console.log(`API 서버: http://localhost:${PORT}`);
});
