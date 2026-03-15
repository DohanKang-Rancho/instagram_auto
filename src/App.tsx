import { useState, useCallback } from 'react'
import { supabase } from './lib/supabase'
import { fetchProfile, fetchPosts } from './api/instagram'
import { buildMetricRows, normalizeRapidApiPosts } from './utils/metrics'
import type { ProfileMetricRow, Dimension, InstagramPost } from './types'
import { exportToExcel } from './utils/excel'
import './App.css'

function App() {
  const [profileId, setProfileId] = useState('')
  const [dimension, setDimension] = useState<Dimension>('dai')
  const [startDate, setStartDate] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 30)
    return d.toISOString().slice(0, 10)
  })
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [rows, setRows] = useState<ProfileMetricRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    if (!profileId.trim()) {
      setError('프로필 ID를 입력하세요.')
      return
    }
    setError(null)
    setLoading(true)
    try {
      await fetchProfile(profileId.trim()).catch((profileError) => {
        console.warn('프로필 조회는 실패했지만 게시물 조회는 계속 진행합니다.', profileError)
        return null
      })
      let postsData = await fetchPosts(profileId.trim())
      const posts = normalizeRapidApiPosts(postsData) as InstagramPost[]
      if (posts.length === 0 && postsData && typeof postsData === 'object') {
        const any = postsData as Record<string, unknown>
        if (Array.isArray(any)) {
          postsData = { data: any }
          posts.push(...normalizeRapidApiPosts(postsData) as InstagramPost[])
        }
      }
      if (posts.length === 0) {
        console.error('게시물 응답 파싱 실패', postsData)
        throw new Error('응답에서 게시물 데이터를 찾지 못했습니다. 브라우저 콘솔 로그를 확인하세요.')
      }
      const start = new Date(startDate)
      const end = new Date(endDate)
      const built = buildMetricRows(posts, dimension, start, end)
      setRows(built)

      const { error: dbError } = await supabase.from('instagram_metrics').upsert(
        built.map((r) => ({
          profile_id: profileId.trim(),
          dimension: r.dimension,
          dimension_type: dimension,
          start_date: startDate,
          end_date: endDate,
          likes: r.likes,
          comments: r.comments,
          views: r.views,
          avg_7d_likes: r.avg7dLikes,
          avg_7d_comments: r.avg7dComments,
          avg_7d_views: r.avg7dViews,
          likes_dod: r.likesDoD,
          likes_wow: r.likesWoW,
          likes_mom: r.likesMoM,
          likes_yoy: r.likesYoY,
          comments_dod: r.commentsDoD,
          comments_wow: r.commentsWoW,
          comments_mom: r.commentsMoM,
          comments_yoy: r.commentsYoY,
          views_dod: r.viewsDoD,
          views_wow: r.viewsWoW,
          views_mom: r.viewsMoM,
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

  const handleExcel = useCallback(() => {
    exportToExcel(rows, profileId || 'instagram', dimension)
  }, [rows, profileId, dimension])

  return (
    <div className="app">
      <header className="header">
        <h1>인스타그램 프로필 메트릭</h1>
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
            {loading ? '불러오는 중…' : '새로고침'}
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
              <th>차원</th>
              <th>좋아요 수</th>
              <th>댓글 수</th>
              <th>조회수</th>
              <th>좋아요 7일 평균</th>
              <th>댓글 7일 평균</th>
              <th>조회수 7일 평균</th>
              <th>좋아요 DoD</th>
              <th>좋아요 WoW</th>
              <th>좋아요 MoM</th>
              <th>좋아요 YoY</th>
              <th>댓글 DoD</th>
              <th>댓글 WoW</th>
              <th>댓글 MoM</th>
              <th>댓글 YoY</th>
              <th>조회수 DoD</th>
              <th>조회수 WoW</th>
              <th>조회수 MoM</th>
              <th>조회수 YoY</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !loading && (
              <tr>
                <td colSpan={20}>프로필 ID를 입력하고 새로고침을 눌러 데이터를 불러오세요.</td>
              </tr>
            )}
            {rows.map((r, i) => (
              <tr key={`${r.dimension}-${i}`}>
                <td>{r.dimension}</td>
                <td>{r.likes.toLocaleString()}</td>
                <td>{r.comments.toLocaleString()}</td>
                <td>{r.views.toLocaleString()}</td>
                <td>{r.avg7dLikes.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                <td>{r.avg7dComments.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                <td>{r.avg7dViews.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                <td>{r.likesDoD != null ? `${r.likesDoD}%` : '-'}</td>
                <td>{r.likesWoW != null ? `${r.likesWoW}%` : '-'}</td>
                <td>{r.likesMoM != null ? `${r.likesMoM}%` : '-'}</td>
                <td>{r.likesYoY != null ? `${r.likesYoY}%` : '-'}</td>
                <td>{r.commentsDoD != null ? `${r.commentsDoD}%` : '-'}</td>
                <td>{r.commentsWoW != null ? `${r.commentsWoW}%` : '-'}</td>
                <td>{r.commentsMoM != null ? `${r.commentsMoM}%` : '-'}</td>
                <td>{r.commentsYoY != null ? `${r.commentsYoY}%` : '-'}</td>
                <td>{r.viewsDoD != null ? `${r.viewsDoD}%` : '-'}</td>
                <td>{r.viewsWoW != null ? `${r.viewsWoW}%` : '-'}</td>
                <td>{r.viewsMoM != null ? `${r.viewsMoM}%` : '-'}</td>
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
