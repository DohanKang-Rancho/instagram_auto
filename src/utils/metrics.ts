import type { ProfileMetricRow, InstagramPost, Dimension } from '../types';

function parseDate(value: string | number | undefined): Date | null {
  if (!value) return null;
  if (typeof value === 'number') return new Date(value * 1000);
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

function formatDimensionLabel(d: Date, dim: Dimension): string {
  if (dim === 'dai') return d.toISOString().slice(0, 10);
  if (dim === 'week') {
    const start = new Date(d);
    start.setDate(d.getDate() - d.getDay());
    return start.toISOString().slice(0, 10) + ' (주)';
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')} (월)`;
}

function getDimensionKey(d: Date, dim: Dimension): string {
  if (dim === 'dai') return d.toISOString().slice(0, 10);
  if (dim === 'week') {
    const start = new Date(d);
    start.setDate(d.getDate() - d.getDay());
    return start.toISOString().slice(0, 10);
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function pctChange(current: number, previous: number): number | undefined {
  if (previous === 0) return current > 0 ? 100 : undefined;
  return Number((((current - previous) / previous) * 100).toFixed(2));
}

export function buildMetricRows(
  posts: InstagramPost[],
  dimension: Dimension,
  startDate: Date,
  endDate: Date
): ProfileMetricRow[] {
  const buckets: Record<
    string,
    { likes: number; comments: number; views: number; count: number; label: string }
  > = {};

  for (const p of posts) {
    const d = parseDate(p.taken_at ?? (p as unknown as { timestamp?: number }).timestamp);
    if (!d || d < startDate || d > endDate) continue;

    const key = getDimensionKey(d, dimension);
    const label = formatDimensionLabel(d, dimension);
    if (!buckets[key]) {
      buckets[key] = { likes: 0, comments: 0, views: 0, count: 0, label };
    }
    const b = buckets[key];
    b.likes += p.like_count ?? 0;
    b.comments += p.comment_count ?? 0;
    b.views += p.video_view_count ?? 0;
    b.count += 1;
  }

  const sortedKeys = Object.keys(buckets).sort();
  const rows: ProfileMetricRow[] = sortedKeys.map((key) => {
    const b = buckets[key];
    return {
      dimension: b.label,
      dimensionType: dimension,
      likes: b.likes,
      comments: b.comments,
      views: b.views,
      avg7dLikes: 0,
      avg7dComments: 0,
      avg7dViews: 0,
    };
  });

  // 7일 평균: 해당 구간 포함 최근 7일치 데이터로 평균 (간단히 해당 행 이전 7일 슬라이딩은 생략하고, 전체 포스트 기준 7일 평균으로 대체)
  const totalLikes = posts.reduce((s, p) => s + (p.like_count ?? 0), 0);
  const totalComments = posts.reduce((s, p) => s + (p.comment_count ?? 0), 0);
  const totalViews = posts.reduce((s, p) => s + (p.video_view_count ?? 0), 0);
  const n = posts.length || 1;
  const avg7L = totalLikes / n;
  const avg7C = totalComments / n;
  const avg7V = totalViews / n;

  const withAvg = rows.map((r) => ({
    ...r,
    avg7dLikes: Math.round(avg7L * 100) / 100,
    avg7dComments: Math.round(avg7C * 100) / 100,
    avg7dViews: Math.round(avg7V * 100) / 100,
  }));

  // DoD / WoW / MoM / YoY (이전 기간 대비 변화율)
  for (let i = 0; i < withAvg.length; i++) {
    const r = withAvg[i];
    const prev = withAvg[i - 1];
    if (prev) {
      r.likesDoD = pctChange(r.likes, prev.likes);
      r.commentsDoD = pctChange(r.comments, prev.comments);
      r.viewsDoD = pctChange(r.views, prev.views);
    }
    const prevWeek = dimension === 'week' ? withAvg[i - 1] : withAvg[Math.max(0, i - 7)];
    if (prevWeek) {
      r.likesWoW = pctChange(r.likes, prevWeek.likes);
      r.commentsWoW = pctChange(r.comments, prevWeek.comments);
      r.viewsWoW = pctChange(r.views, prevWeek.views);
    }
    const prevMonth = dimension === 'month' ? withAvg[i - 1] : withAvg[Math.max(0, i - 30)];
    if (prevMonth) {
      r.likesMoM = pctChange(r.likes, prevMonth.likes);
      r.commentsMoM = pctChange(r.comments, prevMonth.comments);
      r.viewsMoM = pctChange(r.views, prevMonth.views);
    }
    const prevYear = withAvg[Math.max(0, i - (dimension === 'month' ? 12 : 365))];
    if (prevYear) {
      r.likesYoY = pctChange(r.likes, prevYear.likes);
      r.commentsYoY = pctChange(r.comments, prevYear.comments);
      r.viewsYoY = pctChange(r.views, prevYear.views);
    }
  }

  return withAvg;
}

export function normalizeRapidApiPosts(data: unknown): InstagramPost[] {
  if (!data || typeof data !== 'object') return [];
  const obj = data as Record<string, unknown>;
  const media = obj.edge_owner_to_timeline_media as { edges?: unknown[] } | undefined;
  const items = (obj.data ?? obj.items ?? obj.posts ?? media?.edges ?? []) as unknown[];
  if (!Array.isArray(items)) return [];

  return items.map((item: unknown) => {
    const i = item as Record<string, unknown>;
    const node = (i.node ?? i) as Record<string, unknown>;
    const takenAt = node.taken_at ?? node.timestamp ?? i.taken_at;
    return {
      id: String(node.id ?? i.id ?? Math.random()),
      like_count: Number((node.edge_liked_by as { count?: number } | undefined)?.count ?? node.like_count ?? i.like_count ?? 0),
      comment_count: Number((node.edge_media_to_comment as { count?: number } | undefined)?.count ?? node.comment_count ?? i.comment_count ?? 0),
      video_view_count: Number(node.video_view_count ?? node.play_count ?? i.video_view_count ?? 0),
      taken_at: typeof takenAt === 'number' ? new Date(takenAt * 1000).toISOString() : String(takenAt ?? ''),
      timestamp: typeof takenAt === 'number' ? takenAt : undefined,
      media_type: String(node.__typename ?? node.media_type ?? i.media_type ?? ''),
    };
  });
}
