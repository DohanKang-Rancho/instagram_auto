export type Dimension = 'dai' | 'week' | 'month';

export interface ProfileMetricRow {
  followerCount?: number;
  dimension: string; // 날짜(YYYY-MM-DD) 또는 주/월 라벨
  dimensionType: Dimension;
  likes: number;
  comments: number;
  views: number;
  avg7dLikes: number;
  avg7dComments: number;
  avg7dViews: number;
  likesDoD?: number;
  likesWoW?: number;
  likesYoY?: number;
  commentsDoD?: number;
  commentsWoW?: number;
  commentsYoY?: number;
  viewsDoD?: number;
  viewsWoW?: number;
  viewsYoY?: number;
}

export interface InstagramPost {
  id: string;
  caption?: string;
  like_count?: number;
  comment_count?: number;
  video_view_count?: number;
  taken_at?: string;
  timestamp?: number;
  media_type?: string;
}

export interface InstagramProfile {
  username?: string;
  full_name?: string;
  biography?: string;
  follower_count?: number;
  following_count?: number;
  media_count?: number;
  profile_pic_url?: string;
}
