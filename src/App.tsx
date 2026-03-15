import { useState, useCallback, useMemo } from 'react'
import { supabase } from './lib/supabase'
import { fetchProfile, fetchPosts } from './api/instagram'
import {
  applyFollowerSnapshots,
  buildMetricRows,
  normalizeRapidApiPosts,
  normalizeRapidApiProfile,
} from './utils/metrics'
import type {
  ProfileMetricRow,
  Dimension,
  InstagramPost,
  InstagramFollowerSnapshot,
} from './types'
import { exportToExcel } from './utils/excel'
import './App.css'

function getKstDateString(date = new Date()): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const parts = formatter.formatToParts(date)
  const year = parts.find((part) => part.type === 'year')?.value ?? '0000'
  const month = parts.find((part) => part.type === 'month')?.value ?? '00'
  const day = parts.find((part) => part.type === 'day')?.value ?? '00'
  return `${year}-${month}-${day}`
}

function parseDateString(value: string): Date {
  return new Date(`${value}T00:00:00`)
}

function shiftDateString(value: string, days: number): string {
  const date = parseDateString(value)
  date.setDate(date.getDate() + days)
  return getKstDateString(date)
}

function getToday(): Date {
  return parseDateString(getKstDateString())
}

function getYesterday(): Date {
  return parseDateString(shiftDateString(getKstDateString(), -1))
}

function formatFollowerDoD(value?: number) {
  if (value == null) {
    return { text: '-', className: 'flat' }
  }

  if (value > 0) {
    return { text: `▲ ${value.toLocaleString()}`, className: 'up' }
  }

  if (value < 0) {
    return { text: `▼ ${Math.abs(value).toLocaleString()}`, className: 'down' }
  }

  return { text: '-', className: 'flat' }
}

type SortKey =
  | 'dimension'
  | 'followerCount'
  | 'followerDoD'
  | 'likes'
  | 'comments'
  | 'views'
  | 'avg7dLikes'
  | 'avg7dComments'
  | 'avg7dViews'
  | 'likesDoD'
  | 'likesWoW'
  | 'likesYoY'
  | 'commentsDoD'
  | 'commentsWoW'
  | 'commentsYoY'
  | 'viewsDoD'
  | 'viewsWoW'
  | 'viewsYoY'

type SortDirection = 'asc' | 'desc'

const tableColumns: Array<{ key: SortKey; label: string; align?: 'left' | 'right' }> = [
  { key: 'dimension', label: 'day', align: 'left' },
  { key: 'followerCount', label: '팔로워 수' },
  { key: 'followerDoD', label: '팔로워수 DoD' },
  { key: 'likes', label: '좋아요 수' },
  { key: 'comments', label: '댓글 수' },
  { key: 'views', label: '조회수' },
  { key: 'avg7dLikes', label: '좋아요 7일 평균' },
  { key: 'avg7dComments', label: '댓글 7일 평균' },
  { key: 'avg7dViews', label: '조회수 7일 평균' },
  { key: 'likesDoD', label: '좋아요 DoD' },
  { key: 'likesWoW', label: '좋아요 WoW' },
  { key: 'likesYoY', label: '좋아요 YoY' },
  { key: 'commentsDoD', label: '댓글 DoD' },
  { key: 'commentsWoW', label: '댓글 WoW' },
  { key: 'commentsYoY', label: '댓글 YoY' },
  { key: 'viewsDoD', label: '조회수 DoD' },
  { key: 'viewsWoW', label: '조회수 WoW' },
  { key: 'viewsYoY', label: '조회수 YoY' },
]

function compareValues(a: ProfileMetricRow, b: ProfileMetricRow, sortKey: SortKey) {
  if (sortKey === 'dimension') {
    return a.dimension.localeCompare(b.dimension)
  }

  const left = a[sortKey]
  const right = b[sortKey]
  const leftValue = left == null ? Number.NEGATIVE_INFINITY : Number(left)
  const rightValue = right == null ? Number.NEGATIVE_INFINITY : Number(right)

  if (leftValue === rightValue) {
    return a.dimension.localeCompare(b.dimension)
  }

  return leftValue - rightValue
}

function getSortIndicator(sortKey: SortKey, currentKey: SortKey, direction: SortDirection) {
  if (sortKey !== currentKey) return '↕'
  return direction === 'asc' ? '▲' : '▼'
}

async function saveFollowerSnapshot(profileId: string, followerCount: number) {
  const snapshotDate = getKstDateString()
  const snapshotAt = new Date().toISOString()
  const { error } = await supabase.from('instagram_follower_snapshots').upsert(
    {
      profile_id: profileId,
      snapshot_date: snapshotDate,
      snapshot_at: snapshotAt,
      follower_count: followerCount,
    },
    { onConflict: 'profile_id,snapshot_date' }
  )

  if (error) throw error
}

async function fetchFollowerSnapshots(
  profileId: string,
  startDate: string,
  endDate: string
): Promise<InstagramFollowerSnapshot[]> {
  const { data, error } = await supabase
    .from('instagram_follower_snapshots')
    .select('profile_id,snapshot_date,snapshot_at,follower_count')
    .eq('profile_id', profileId)
    .gte('snapshot_date', startDate)
    .lte('snapshot_date', endDate)
    .order('snapshot_date', { ascending: true })

  if (error) throw error
  return (data ?? []) as InstagramFollowerSnapshot[]
}

function ensureCurrentFollowerSnapshot(
  snapshots: InstagramFollowerSnapshot[],
  profileId: string,
  followerCount: number | undefined,
  targetDate: string
): InstagramFollowerSnapshot[] {
  if (followerCount == null) return snapshots
  if (snapshots.some((snapshot) => snapshot.snapshot_date === targetDate)) return snapshots

  return [
    ...snapshots,
    {
      profile_id: profileId,
      snapshot_date: targetDate,
      snapshot_at: new Date().toISOString(),
      follower_count: followerCount,
    },
  ]
}

function App() {
  const [profileId, setProfileId] = useState('')
  const [dimension, setDimension] = useState<Dimension>('dai')
  const [startDate, setStartDate] = useState(() => {
    const d = getToday()
    d.setDate(d.getDate() - 30)
    return getKstDateString(d)
  })
  const [endDate, setEndDate] = useState(() => getKstDateString())
  const [rows, setRows] = useState<ProfileMetricRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('dimension')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')

  const loadData = useCallback(async () => {
    if (!profileId.trim()) {
      setError('프로필 ID를 입력하세요.')
      return
    }
    setError(null)
    setLoading(true)
    try {
      const profileData = await fetchProfile(profileId.trim()).catch((profileError) => {
        console.warn('프로필 조회는 실패했지만 게시물 조회는 계속 진행합니다.', profileError)
        return null
      })
      const profile = normalizeRapidApiProfile(profileData)
      const followerCount = profile.follower_count

      const today = getToday()
      const yesterday = getYesterday()
      const start = parseDateString(startDate)
      const requestedEnd = parseDateString(endDate)
      const displayEnd = requestedEnd > today ? today : requestedEnd
      const postsEnd = displayEnd > yesterday ? yesterday : displayEnd
      const displayEndString = getKstDateString(displayEnd)

      if (Number.isNaN(start.getTime()) || Number.isNaN(displayEnd.getTime()) || start > displayEnd) {
        throw new Error('조회 기간을 다시 확인하세요.')
      }

      if (followerCount != null) {
        try {
          await saveFollowerSnapshot(profileId.trim(), followerCount)
        } catch (snapshotError) {
          console.warn('팔로워 스냅샷 저장 실패', snapshotError)
        }
      }

      let posts: InstagramPost[] = []
      if (postsEnd >= start) {
        let postsData = await fetchPosts(
          profileId.trim(),
          startDate,
          getKstDateString(postsEnd)
        )
        posts = normalizeRapidApiPosts(postsData) as InstagramPost[]
        if (posts.length === 0 && postsData && typeof postsData === 'object') {
          const any = postsData as Record<string, unknown>
          if (Array.isArray(any)) {
            postsData = { data: any }
            posts.push(...normalizeRapidApiPosts(postsData) as InstagramPost[])
          }
        }
      }

      const snapshots = await fetchFollowerSnapshots(
        profileId.trim(),
        startDate,
        displayEndString
      ).catch((snapshotError) => {
        console.warn('팔로워 스냅샷 조회 실패', snapshotError)
        return []
      })
      const snapshotsWithFallback = ensureCurrentFollowerSnapshot(
        snapshots,
        profileId.trim(),
        followerCount,
        getKstDateString()
      )

      const built = buildMetricRows(posts, dimension, start, displayEnd)
      const rowsWithSnapshots = applyFollowerSnapshots(built, dimension, snapshotsWithFallback)
      setRows(rowsWithSnapshots)

      const { error: dbError } = await supabase.from('instagram_metrics').upsert(
        rowsWithSnapshots.map((r) => ({
          profile_id: profileId.trim(),
          dimension: r.dimension,
          dimension_type: dimension,
          start_date: startDate,
          end_date: displayEndString,
          likes: r.likes,
          comments: r.comments,
          views: r.views,
          avg_7d_likes: r.avg7dLikes,
          avg_7d_comments: r.avg7dComments,
          avg_7d_views: r.avg7dViews,
          likes_dod: r.likesDoD,
          likes_wow: r.likesWoW,
          likes_yoy: r.likesYoY,
          comments_dod: r.commentsDoD,
          comments_wow: r.commentsWoW,
          comments_yoy: r.commentsYoY,
          views_dod: r.viewsDoD,
          views_wow: r.viewsWoW,
          views_yoy: r.viewsYoY,
          updated_at: new Date().toISOString(),
        })),
        { onConflict: 'profile_id,dimension,dimension_type' }
      )
      if (dbError) console.warn('Supabase 저장 실패 (테이블 미생성 시 정상):', dbError.message)
    } catch (e) {
      setError(e instanceof Error ? e.message : '데이터를 불러오지 못했습니다.')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [profileId, dimension, startDate, endDate])

  const sortedRows = useMemo(() => {
    const nextRows = [...rows]
    nextRows.sort((a, b) => {
      const compared = compareValues(a, b, sortKey)
      return sortDirection === 'asc' ? compared : -compared
    })
    return nextRows
  }, [rows, sortDirection, sortKey])

  const handleSort = useCallback((nextKey: SortKey) => {
    setSortKey((currentKey) => {
      if (currentKey === nextKey) {
        setSortDirection((currentDirection) => (currentDirection === 'asc' ? 'desc' : 'asc'))
        return currentKey
      }

      setSortDirection('asc')
      return nextKey
    })
  }, [])

  const handleExcel = useCallback(() => {
    exportToExcel(sortedRows, profileId || 'instagram', dimension)
  }, [sortedRows, profileId, dimension])

  return (
    <div className="app">
      <header className="header">
        <div>
          <p className="eyebrow">Instagram Analytics Admin</p>
          <h1>인스타그램 프로필 메트릭</h1>
        </div>
        <div className="header-badge">Live Dashboard</div>
      </header>

      <section className="controls">
        <div className="field">
          <label>프로필 ID (username)</label>
          <input
            type="text"
            value={profileId}
            onChange={(e) => setProfileId(e.target.value)}
            placeholder="예: instagram"
          />
        </div>
        <div className="field">
          <label>기간</label>
          <div className="date-range">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
            <span>~</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
        </div>
        <div className="field">
          <label>차원</label>
          <select
            value={dimension}
            onChange={(e) => setDimension(e.target.value as Dimension)}
          >
            <option value="dai">일별 (dai)</option>
            <option value="week">주별 (week)</option>
            <option value="month">월별 (month)</option>
          </select>
        </div>
        <div className="actions">
          <button type="button" className="btn primary" onClick={loadData} disabled={loading}>
            {loading ? '실행 중…' : '실행'}
          </button>
          <button
            type="button"
            className="btn secondary"
            onClick={handleExcel}
            disabled={rows.length === 0}
          >
            Excel 다운로드
          </button>
        </div>
      </section>

      {error && <div className="error">{error}</div>}

      <section className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              {tableColumns.map((column) => (
                <th
                  key={column.key}
                  className={column.align === 'left' ? 'align-left' : undefined}
                >
                  <button
                    type="button"
                    className={`sort-button ${sortKey === column.key ? 'active' : ''}`}
                    onClick={() => handleSort(column.key)}
                  >
                    <span>{column.label}</span>
                    <span className="sort-indicator">
                      {getSortIndicator(column.key, sortKey, sortDirection)}
                    </span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedRows.length === 0 && !loading && (
              <tr>
                <td colSpan={18}>프로필 ID를 입력하고 새로고침을 눌러 데이터를 불러오세요.</td>
              </tr>
            )}
            {sortedRows.map((r, i) => (
              <tr key={`${r.dimension}-${i}`}>
                <td>{r.dimension}</td>
                <td>{r.followerCount?.toLocaleString() ?? '-'}</td>
                <td>
                  {(() => {
                    const followerDoD = formatFollowerDoD(r.followerDoD)
                    return (
                      <span className={`trend ${followerDoD.className}`}>
                        {followerDoD.text}
                      </span>
                    )
                  })()}
                </td>
                <td>{r.likes.toLocaleString()}</td>
                <td>{r.comments.toLocaleString()}</td>
                <td>{r.views.toLocaleString()}</td>
                <td>{r.avg7dLikes.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                <td>{r.avg7dComments.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                <td>{r.avg7dViews.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                <td>{r.likesDoD != null ? `${r.likesDoD}%` : '-'}</td>
                <td>{r.likesWoW != null ? `${r.likesWoW}%` : '-'}</td>
                <td>{r.likesYoY != null ? `${r.likesYoY}%` : '-'}</td>
                <td>{r.commentsDoD != null ? `${r.commentsDoD}%` : '-'}</td>
                <td>{r.commentsWoW != null ? `${r.commentsWoW}%` : '-'}</td>
                <td>{r.commentsYoY != null ? `${r.commentsYoY}%` : '-'}</td>
                <td>{r.viewsDoD != null ? `${r.viewsDoD}%` : '-'}</td>
                <td>{r.viewsWoW != null ? `${r.viewsWoW}%` : '-'}</td>
                <td>{r.viewsYoY != null ? `${r.viewsYoY}%` : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}

export default App
