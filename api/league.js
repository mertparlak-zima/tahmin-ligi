// GET /api/league — herkese açık lig verisi.
// Veri bayatsa (varsayılan 90 sn) önce senkronize eder, sonra döndürür.

import { getSupabase } from '../lib/supabase.js'
import { maybeSync } from '../lib/sync.js'
import { buildLeaguePayload } from '../lib/league.js'

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  })

export default async function handler(request) {
  if (request.method !== 'GET') return json(405, { error: 'Yalnızca GET desteklenir.' })
  try {
    const supabase = getSupabase()
    await maybeSync(supabase)
    const payload = await buildLeaguePayload(supabase)
    return json(200, payload)
  } catch (err) {
    console.error('/api/league error:', err.message)
    return json(500, { error: 'Lig verisi hazırlanamadı.', detail: err.message })
  }
}
