const API_BASE = '/api';

export async function fetchProfile(username: string): Promise<unknown> {
  const res = await fetch(`${API_BASE}/instagram/profile/${encodeURIComponent(username)}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error || '프로필 조회 실패');
  }
  return res.json();
}

export async function fetchPosts(username: string): Promise<unknown> {
  const res = await fetch(`${API_BASE}/instagram/posts/${encodeURIComponent(username)}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error || '게시물 조회 실패');
  }
  return res.json();
}
