// GET /api/events — İşlem Geçmişi (#40): son tahmin hareketleri (giriş/
// değişim/kaldırma), oyuncu+maç join'li, MASKELİ IP + User-Agent özetiyle.
// Tam IP ve konumun ham değeri payload'a ASLA girmez (lib/events.js).
// Query: ?limit=1..200 (varsayılan 100). En sık hata 503: migration
// (2026-11-prediction-events.sql) henüz uygulanmamış olabilir.
// Not: Vercel web-standard imza için NAMED METHOD export ister (bkv. api/league.js).

import { getSupabase } from '../lib/supabase.js'
import { buildEventsPayload } from '../lib/events.js'

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

  const params = new URL(request.url).searchParams
  const raw = Number.parseInt(String(params.get('limit') ?? '100'), 10)
  const limit = Number.isFinite(raw) ? Math.min(Math.max(raw, 1), 200) : 100

  try {
    // supabase enjeksiyonu: demo sunucu bellek-içi istemcisini geçebilir
    // (request.supabase); üretimde (Vercel) env tabanlı istemci kurulur.
    const supabase = request.supabase ?? getSupabase()
    const payload = await buildEventsPayload(supabase, { limit })
    return json(200, { limit, eventCount: payload.events.length, ...payload })
  } catch (err) {
    console.error('/api/events error:', err.message)
    // En sık neden: prediction_events tablosu yok (migration sırası).
    return json(503, { error: 'İşlem geçmişi şu an hazır değil.' })
  }
}
