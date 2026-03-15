const API_BASE = '/api';

async function parseErrorPayload(res: Response) {
  const text = await res.text();
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { error: text || res.statusText };
  }
}

export async function fetchProfile(username: string): Promise<unknown> {
  const res = await fetch(`${API_BASE}/instagram/profile/${encodeURIComponent(username)}`);
  if (!res.ok) {
    const err = await parseErrorPayload(res);
    console.error('Instagram profile API failed', {
      endpoint: `${API_BASE}/instagram/profile/${encodeURIComponent(username)}`,
      status: res.status,
      statusText: res.statusText,
      error: err,
    });
    throw new Error(String(err.error || `프로필 조회 실패 (${res.status})`));
  }
  return res.json();
}

export async function fetchPosts(username: string): Promise<unknown> {
  const res = await fetch(`${API_BASE}/instagram/posts/${encodeURIComponent(username)}`);
  if (!res.ok) {
    const err = await parseErrorPayload(res);
    console.error('Instagram posts API failed', {
      endpoint: `${API_BASE}/instagram/posts/${encodeURIComponent(username)}`,
      status: res.status,
      statusText: res.statusText,
      error: err,
    });
    throw new Error(String(err.error || `게시물 조회 실패 (${res.status})`));
  }
  return res.json();
}
