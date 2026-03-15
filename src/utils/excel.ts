import * as XLSX from 'xlsx'
import type { ProfileMetricRow } from '../types'

export function exportToExcel(
  rows: ProfileMetricRow[],
  profileId: string,
  dimension: string
): void {
  const formatFollowerDoD = (value?: number) => {
    if (value == null || value === 0) return ''
    return value > 0 ? `▲ ${value}` : `▼ ${Math.abs(value)}`
  }

  const data = rows.map((r) => ({
    day: r.dimension,
    팔로워수: r.followerCount ?? '',
    '팔로워수 DoD': formatFollowerDoD(r.followerDoD),
    좋아요수: r.likes,
    댓글수: r.comments,
    조회수: r.views,
    '좋아요 7일평균': r.avg7dLikes,
    '댓글 7일평균': r.avg7dComments,
    '조회수 7일평균': r.avg7dViews,
    '좋아요 DoD(%)': r.likesDoD ?? '',
    '좋아요 WoW(%)': r.likesWoW ?? '',
    '좋아요 YoY(%)': r.likesYoY ?? '',
    '댓글 DoD(%)': r.commentsDoD ?? '',
    '댓글 WoW(%)': r.commentsWoW ?? '',
    '댓글 YoY(%)': r.commentsYoY ?? '',
    '조회수 DoD(%)': r.viewsDoD ?? '',
    '조회수 WoW(%)': r.viewsWoW ?? '',
    '조회수 YoY(%)': r.viewsYoY ?? '',
  }))

  const ws = XLSX.utils.json_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '메트릭')
  const filename = `instagram_${profileId}_${dimension}_${new Date().toISOString().slice(0, 10)}.xlsx`
  XLSX.writeFile(wb, filename)
}
