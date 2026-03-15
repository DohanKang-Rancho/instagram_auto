import { createClient } from 'jsr:@supabase/supabase-js@2'

const RAPIDAPI_HOST = Deno.env.get('RAPIDAPI_INSTAGRAM_HOST') || 'instagram120.p.rapidapi.com'
const RAPIDAPI_KEY = Deno.env.get('RAPIDAPI_KEY') || ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const CRON_SECRET = Deno.env.get('FOLLOWER_SNAPSHOT_CRON_SECRET') || ''
const KST_TIME_ZONE = 'Asia/Seoul'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function getKstDateString(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: KST_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })

  return formatter.format(date)
}

function unique(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}

async function fetchFollowerCount(profileId: string) {
  const response = await fetch(`https://${RAPIDAPI_HOST}/api/instagram/profile`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-RapidAPI-Key': RAPIDAPI_KEY,
      'X-RapidAPI-Host': RAPIDAPI_HOST,
    },
    body: JSON.stringify({ username: profileId }),
  })

  const text = await response.text()
  const payload = JSON.parse(text || '{}') as Record<string, unknown>
  const result = (payload.result ?? {}) as Record<string, unknown>
  const edgeFollowedBy = (result.edge_followed_by ?? {}) as { count?: number }
  const followerCount = edgeFollowedBy.count

  if (!response.ok || followerCount == null) {
    throw new Error(
      `profile=${profileId} status=${response.status} detail=${text.slice(0, 300)}`
    )
  }

  return Number(followerCount)
}

async function listTrackedProfiles(supabase: ReturnType<typeof createClient>) {
  const [metricsResult, snapshotResult] = await Promise.all([
    supabase.from('instagram_metrics').select('profile_id'),
    supabase.from('instagram_follower_snapshots').select('profile_id'),
  ])

  if (metricsResult.error) throw metricsResult.error
  if (snapshotResult.error) throw snapshotResult.error

  const metricsProfiles = (metricsResult.data ?? []).map((row) => String(row.profile_id ?? ''))
  const snapshotProfiles = (snapshotResult.data ?? []).map((row) => String(row.profile_id ?? ''))
  return unique([...metricsProfiles, ...snapshotProfiles])
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (request.method !== 'POST') {
    return json({ error: 'POST 요청만 지원합니다.' }, 405)
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !RAPIDAPI_KEY) {
    return json(
      { error: '필수 환경 변수가 누락되었습니다.', required: ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'RAPIDAPI_KEY'] },
      500
    )
  }

  if (CRON_SECRET) {
    const secret = request.headers.get('x-cron-secret')
    if (secret !== CRON_SECRET) {
      return json({ error: 'cron secret이 올바르지 않습니다.' }, 401)
    }
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  const body = await request.json().catch(() => ({})) as { profileId?: string; profileIds?: string[] }
  const explicitProfiles = unique([
    body.profileId ?? '',
    ...((body.profileIds ?? []).map((value) => String(value))),
  ])

  const profileIds = explicitProfiles.length > 0 ? explicitProfiles : await listTrackedProfiles(supabase)
  if (profileIds.length === 0) {
    return json({ message: '스냅샷을 적재할 profile_id가 없습니다.', inserted: 0, profiles: [] })
  }

  const snapshotDate = getKstDateString()
  const snapshotAt = new Date().toISOString()
  const results: Array<{ profileId: string; followerCount?: number; error?: string }> = []

  for (const profileId of profileIds) {
    try {
      const followerCount = await fetchFollowerCount(profileId)
      const { error } = await supabase
        .from('instagram_follower_snapshots')
        .upsert(
          {
            profile_id: profileId,
            snapshot_date: snapshotDate,
            snapshot_at: snapshotAt,
            follower_count: followerCount,
          },
          { onConflict: 'profile_id,snapshot_date' }
        )

      if (error) throw error
      results.push({ profileId, followerCount })
    } catch (error) {
      results.push({
        profileId,
        error: error instanceof Error ? error.message : '알 수 없는 오류',
      })
    }
  }

  const inserted = results.filter((item) => item.followerCount != null).length
  const failed = results.filter((item) => item.error).length

  return json({
    snapshotDate,
    snapshotAt,
    inserted,
    failed,
    results,
  })
})
