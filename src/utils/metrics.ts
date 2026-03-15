import type {
  ProfileMetricRow,
  InstagramPost,
  InstagramProfile,
  InstagramFollowerSnapshot,
  Dimension,
} from '../types';

function parseDate(value: string | number | undefined): Date | null {
  if (!value) return null;
  if (typeof value === 'number') return new Date(value * 1000);
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

function getKstDateParts(date: Date) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(date);

  return {
    year: parts.find((part) => part.type === 'year')?.value ?? '0000',
    month: parts.find((part) => part.type === 'month')?.value ?? '00',
    day: parts.find((part) => part.type === 'day')?.value ?? '00',
  };
}

function formatKstDate(date: Date): string {
  const { year, month, day } = getKstDateParts(date);
  return `${year}-${month}-${day}`;
}

function formatDimensionLabel(d: Date, dim: Dimension): string {
  if (dim === 'dai') return formatKstDate(d);
  if (dim === 'week') {
    const start = new Date(d);
    start.setDate(d.getDate() - d.getDay());
    return formatKstDate(start) + ' (주)';
  }
  const { year, month } = getKstDateParts(d);
  return `${year}-${month} (월)`;
}

function getDimensionKey(d: Date, dim: Dimension): string {
  if (dim === 'dai') return formatKstDate(d);
  if (dim === 'week') {
    const start = new Date(d);
    start.setDate(d.getDate() - d.getDay());
    return formatKstDate(start);
  }
  const { year, month } = getKstDateParts(d);
  return `${year}-${month}`;
}

function pctChange(current: number, previous: number): number | undefined {
  if (previous === 0) return current > 0 ? 100 : undefined;
  return Number((((current - previous) / previous) * 100).toFixed(2));
}

function toDayStart(date: Date): Date {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function toDayEnd(date: Date): Date {
  const value = new Date(date);
  value.setHours(23, 59, 59, 999);
  return value;
}

function dateKey(date: Date): string {
  return formatKstDate(date);
}

function shiftDateString(value: string, days: number): string {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days, 12, 0, 0));
  return formatKstDate(date);
}

export function buildMetricRows(
  posts: InstagramPost[],
  dimension: Dimension,
  startDate: Date,
  endDate: Date
): ProfileMetricRow[] {
  const rangeStart = toDayStart(startDate);
  const rangeEnd = toDayEnd(endDate);

  const dailyBuckets: Record<
    string,
    { date: Date; likes: number; comments: number; views: number }
  > = {};

  for (let cursor = new Date(rangeStart); cursor <= rangeEnd; cursor.setDate(cursor.getDate() + 1)) {
    const key = dateKey(cursor);
    dailyBuckets[key] = {
      date: new Date(cursor),
      likes: 0,
      comments: 0,
      views: 0,
    };
  }

  for (const p of posts) {
    const d = parseDate(p.taken_at ?? (p as unknown as { timestamp?: number }).timestamp);
    if (!d || d < rangeStart || d > rangeEnd) continue;

    const key = dateKey(d);
    if (!dailyBuckets[key]) {
      dailyBuckets[key] = { date: toDayStart(d), likes: 0, comments: 0, views: 0 };
    }

    const bucket = dailyBuckets[key];
    bucket.likes += p.like_count ?? 0;
    bucket.comments += p.comment_count ?? 0;
    bucket.views += p.video_view_count ?? 0;
  }

  const buckets: Record<
    string,
    { likes: number; comments: number; views: number; label: string }
  > = {};

  for (const key of Object.keys(dailyBuckets).sort()) {
    const daily = dailyBuckets[key];
    const bucketKey = getDimensionKey(daily.date, dimension);
    const label = formatDimensionLabel(daily.date, dimension);
    if (!buckets[bucketKey]) {
      buckets[bucketKey] = { likes: 0, comments: 0, views: 0, label };
    }
    const bucket = buckets[bucketKey];
    bucket.likes += daily.likes;
    bucket.comments += daily.comments;
    bucket.views += daily.views;
  }

  const sortedKeys = Object.keys(buckets).sort();
  const rows: ProfileMetricRow[] = sortedKeys.map((key, index) => {
    const b = buckets[key];
    return {
      dimension: b.label,
      dimensionType: dimension,
      likes: b.likes,
      comments: b.comments,
      views: b.views,
      avg7dLikes: Number(
        (
          sortedKeys
            .slice(Math.max(0, index - 6), index + 1)
            .reduce((sum, bucketKey) => sum + buckets[bucketKey].likes, 0) /
          Math.min(7, index + 1)
        ).toFixed(2)
      ),
      avg7dComments: Number(
        (
          sortedKeys
            .slice(Math.max(0, index - 6), index + 1)
            .reduce((sum, bucketKey) => sum + buckets[bucketKey].comments, 0) /
          Math.min(7, index + 1)
        ).toFixed(2)
      ),
      avg7dViews: Number(
        (
          sortedKeys
            .slice(Math.max(0, index - 6), index + 1)
            .reduce((sum, bucketKey) => sum + buckets[bucketKey].views, 0) /
          Math.min(7, index + 1)
        ).toFixed(2)
      ),
    };
  });

  // DoD / WoW / YoY (이전 기간 대비 변화율)
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const prev = rows[i - 1];
    if (prev) {
      r.likesDoD = pctChange(r.likes, prev.likes);
      r.commentsDoD = pctChange(r.comments, prev.comments);
      r.viewsDoD = pctChange(r.views, prev.views);
    }
    const prevWeek = dimension === 'week' ? rows[i - 1] : i >= 7 ? rows[i - 7] : undefined;
    if (prevWeek) {
      r.likesWoW = pctChange(r.likes, prevWeek.likes);
      r.commentsWoW = pctChange(r.comments, prevWeek.comments);
      r.viewsWoW = pctChange(r.views, prevWeek.views);
    }
    const yearOffset = dimension === 'month' ? 12 : dimension === 'week' ? 52 : 365;
    const prevYear = i >= yearOffset ? rows[i - yearOffset] : undefined;
    if (prevYear) {
      r.likesYoY = pctChange(r.likes, prevYear.likes);
      r.commentsYoY = pctChange(r.comments, prevYear.comments);
      r.viewsYoY = pctChange(r.views, prevYear.views);
    }
  }

  return rows;
}

export function applyFollowerSnapshots(
  rows: ProfileMetricRow[],
  dimension: Dimension,
  snapshots: InstagramFollowerSnapshot[]
): ProfileMetricRow[] {
  if (dimension !== 'dai') {
    return rows.map((row) => ({
      ...row,
      followerCount: undefined,
      followerDoD: undefined,
    }));
  }

  const snapshotByDate = new Map(
    snapshots.map((snapshot) => [snapshot.snapshot_date, snapshot])
  );

  return rows.map((row) => {
    const snapshot = snapshotByDate.get(row.dimension);
    if (!snapshot) {
      return {
        ...row,
        followerCount: undefined,
        followerDoD: undefined,
      };
    }

    const previousSnapshot = snapshotByDate.get(shiftDateString(snapshot.snapshot_date, -1));
    return {
      ...row,
      followerCount: snapshot.follower_count,
      followerDoD:
        previousSnapshot != null
          ? snapshot.follower_count - previousSnapshot.follower_count
          : undefined,
    };
  });
}

export function normalizeRapidApiPosts(data: unknown): InstagramPost[] {
  if (!data || typeof data !== 'object') return [];
  const obj = data as Record<string, unknown>;
  const result = (obj.result ?? {}) as Record<string, unknown>;
  const media = obj.edge_owner_to_timeline_media as { edges?: unknown[] } | undefined;
  const items = (
    result.edges ??
    result.items ??
    result.posts ??
    obj.data ??
    obj.items ??
    obj.posts ??
    media?.edges ??
    []
  ) as unknown[];
  if (!Array.isArray(items)) return [];

  return items.map((item: unknown) => {
    const i = item as Record<string, unknown>;
    const node = (i.node ?? i) as Record<string, unknown>;
    const takenAt = node.taken_at ?? node.timestamp ?? i.taken_at;
    const caption = node.caption as Record<string, unknown> | string | undefined;
    const likeCount =
      (node.edge_liked_by as { count?: number } | undefined)?.count ??
      (node.like_count as { count?: number } | number | undefined);
    const commentCount =
      (node.edge_media_to_comment as { count?: number } | undefined)?.count ??
      (node.comment_count as { count?: number } | number | undefined);
    const viewCount =
      node.video_view_count ??
      node.play_count ??
      node.view_count ??
      node.video_play_count ??
      i.video_view_count;

    return {
      id: String(node.id ?? node.pk ?? i.id ?? i.pk ?? Math.random()),
      caption:
        typeof caption === 'string'
          ? caption
          : typeof caption?.text === 'string'
            ? caption.text
            : undefined,
      like_count:
        typeof likeCount === 'object'
          ? Number((likeCount as { count?: number }).count ?? 0)
          : Number(likeCount ?? i.like_count ?? 0),
      comment_count:
        typeof commentCount === 'object'
          ? Number((commentCount as { count?: number }).count ?? 0)
          : Number(commentCount ?? i.comment_count ?? 0),
      video_view_count: Number(viewCount ?? 0),
      taken_at: typeof takenAt === 'number' ? new Date(takenAt * 1000).toISOString() : String(takenAt ?? ''),
      timestamp: typeof takenAt === 'number' ? takenAt : undefined,
      media_type: String(node.__typename ?? node.media_type ?? i.media_type ?? ''),
    };
  });
}

export function normalizeRapidApiProfile(data: unknown): InstagramProfile {
  if (!data || typeof data !== 'object') return {};

  const obj = data as Record<string, unknown>;
  const result = (obj.result ?? {}) as Record<string, unknown>;
  const dataObj = (obj.data ?? {}) as Record<string, unknown>;
  const profile = (
    result.user ??
    dataObj.user ??
    obj.user ??
    result.profile ??
    dataObj.profile ??
    obj.profile ??
    result
  ) as Record<string, unknown>;

  const followerCount =
    profile.follower_count ??
    profile.followers ??
    (profile.edge_followed_by as { count?: number } | undefined)?.count;
  const followingCount =
    profile.following_count ??
    profile.following ??
    (profile.edge_follow as { count?: number } | undefined)?.count;

  return {
    username: String(profile.username ?? ''),
    full_name: String(profile.full_name ?? ''),
    biography: String(profile.biography ?? ''),
    follower_count: followerCount != null ? Number(followerCount) : undefined,
    following_count: followingCount != null ? Number(followingCount) : undefined,
    media_count: profile.media_count != null ? Number(profile.media_count) : undefined,
    profile_pic_url: profile.profile_pic_url != null ? String(profile.profile_pic_url) : undefined,
  };
}
