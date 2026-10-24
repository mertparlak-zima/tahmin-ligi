// GET /api/league — herkese açık lig verisi.
// Veri bayatsa (varsayılan 90 sn) önce senkronize eder, sonra döndürür.
// Query: ?league=EU&season=2026 — lig/sezon seçimi (P6). Bilinmeyen lig ve
// geçersiz sezon istemci hatasıdır (400); parametre yoksa aktif lig + sezon.
// Not: Vercel web-standard imza için NAMED METHOD export ister (export function GET).

import { getSupabase } from '../lib/supabase.js'
import { maybeSync } from '../lib/sync.js'
import { buildLeaguePayload } from '../lib/league.js'
import { LEAGUE_BY_CODE, activeLeague } from '../lib/targets.js'

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  })

export async function GET(request) {
  if (request.method !== 'GET') return json(405, { error: 'Yalnızca GET desteklenir.' })

  // Parametre doğrulaması supabase/senkron ÖNCESİ yapılır: hatalı istek hiçbir
  // yan etki (senkron turu) tetiklemeden 400 döner.
  const params = new URL(request.url).searchParams
  const leagueParam = (params.get('league') ?? '').trim()
  const seasonParam = (params.get('season') ?? '').trim()
  if (leagueParam !== '' && !LEAGUE_BY_CODE[leagueParam]) {
    return json(400, { error: 'Bilinmeyen lig.' })
  }
  if (seasonParam !== '' && !/^\d{4}$/.test(seasonParam)) {
    return json(400, { error: 'Geçersiz sezon.' })
  }

  try {
    const supabase = getSupabase()
    // maybeSync aynen: senkron her zaman AKTİF ligi çeker (syncNow lig
    // enjeksiyonu yapar); payload sorgusu istenen (lig, sezon)'a iner.
    await maybeSync(supabase)
    const payload = await buildLeaguePayload(supabase, {
      league: leagueParam || activeLeague(),
      seasonYear: seasonParam === '' ? undefined : Number(seasonParam),
    })
    return json(200, payload)
  } catch (err) {
    console.error('/api/league error:', err.message)
    return json(500, { error: 'Lig verisi hazırlanamadı.', detail: err.message })
  }
}
