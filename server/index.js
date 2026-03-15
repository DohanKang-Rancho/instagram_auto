import express from 'express';
import cors from 'cors';

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || '';
const RAPIDAPI_INSTAGRAM_HOST = process.env.RAPIDAPI_INSTAGRAM_HOST || 'instagram120.p.rapidapi.com';

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
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-RapidAPI-Key': RAPIDAPI_KEY,
        'X-RapidAPI-Host': host,
      },
      body: JSON.stringify({ username, maxId: '' }),
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

    const data = JSON.parse(text || '{}');
    return res.json(data);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message || '서버 오류' });
  }
});

app.listen(PORT, () => {
  console.log(`API 서버: http://localhost:${PORT}`);
});
