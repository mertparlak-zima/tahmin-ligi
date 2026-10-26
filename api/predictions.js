// PUT /api/predictions — herkese açık tahmin kaydet/sil ucu (batch, atomik).
// #24 Faz 1: şifreli yönetim API'si kaldırıldı; herkes HERHANGİ BİR oyuncu
// için tahmin girebilir. Kilit kuralı KORUNUR: başlamış/bitmiş/ertelenmiş
// maça tahmin → 409 ve batch'in hiçbiri yazılmaz. Mühür kuralı (/api/league
// outcome gizleme) bu uca değil lig payload'ına aittir — değişmez.
// Not: Vercel web-standard imza için NAMED METHOD export ister (bkv. api/league.js).

import { getSupabase, isReadonly } from '../lib/supabase.js'
import { isLocked } from '../lib/status.js'

const READONLY_MSG = 'Salt-okunur mod: SUPABASE_SERVICE_ROLE_KEY tanımlı değil. Yazma işlemleri için .env dosyasına ekleyin.'

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  })

/** Çekirdek mantık (demo sunucu da yeniden kullanır; test amaçlı export).
 * Gövde: {playerId, items:[{matchId, outcome}]} — outcome '' = silme.
 * Doğrulama → oyuncu/maç kontrolü → kilit kontrolü (yazma ÖNCESİ, atomik)
 * → upsert + delete. */
export async function savePredictions(supabase, request) {
  const body = await request.json().catch(() => ({}))
  const playerId = body.playerId
  const items = Array.isArray(body.items) ? body.items : null

  if (!playerId || !items || items.length === 0 || items.length > 100) {
    return json(400, { error: 'playerId ve 1-100 arası items gerekli.' })
  }

  const matchIds = items.map(i => i.matchId)
  if (new Set(matchIds).size !== matchIds.length) {
    return json(400, { error: 'Aynı maç birden fazla kez gönderildi.' })
  }
  for (const item of items) {
    if (!item.matchId) return json(400, { error: 'Her tahmin için matchId gerekli.' })
    if (item.outcome !== '' && !['H', 'D', 'A'].includes(item.outcome)) {
      return json(400, { error: 'Tahmin H, D, A veya boş (silme) olmalı.' })
    }
  }

  const { data: player } = await supabase.from('players').select('id, name').eq('id', playerId).maybeSingle()
  if (!player) return json(404, { error: 'Oyuncu bulunamadı.' })

  const { data: matches } = await supabase
    .from('matches')
    .select('id, status, kickoff')
    .in('id', matchIds)
  const matchById = new Map((matches ?? []).map(m => [m.id, m]))

  // Kilit denetimi tüm yazmaların ÖNCESİNDE: bir maç bile kilitliyse batch
  // reddedilir (atomik — yarım kayıt oluşmaz).
  for (const item of items) {
    const match = matchById.get(item.matchId)
    if (!match) return json(404, { error: 'Maç bulunamadı.' })
    if (isLocked(match.status, match.kickoff)) {
      return json(409, { error: 'Başlamış veya bitmiş bir maça tahmin kaydedilemez.' })
    }
  }

  const upserts = items
    .filter(i => i.outcome !== '')
    .map(i => ({ player_id: playerId, match_id: i.matchId, outcome: i.outcome, updated_at: new Date().toISOString() }))
  const deletes = items.filter(i => i.outcome === '').map(i => i.matchId)

  if (upserts.length > 0) {
    const { error } = await supabase
      .from('predictions')
      .upsert(upserts, { onConflict: 'player_id,match_id' })
    if (error) return json(500, { error: `Tahminler kaydedilemedi: ${error.message}` })
  }
  if (deletes.length > 0) {
    const { error } = await supabase
      .from('predictions')
      .delete()
      .eq('player_id', playerId)
      .in('match_id', deletes)
    if (error) return json(500, { error: `Tahminler silinemedi: ${error.message}` })
  }

  return json(200, { ok: true, saved: upserts.length, deleted: deletes.length, player: player.name })
}

export async function PUT(request) {
  try {
    if (request.method !== 'PUT') return json(405, { error: 'Yalnızca PUT desteklenir.' })
    // supabase enjeksiyonu: demo sunucu bellek-içi istemcisini geçebilir
    // (request.supabase); üretimde (Vercel) env tabanlı istemci kurulur.
    const supabase = request.supabase ?? getSupabase()
    // #7: anon key ile bağlandıysa yazma ucu 503 döner.
    if (!request.supabase && isReadonly()) {
      return json(503, { error: READONLY_MSG })
    }
    return await savePredictions(supabase, request)
  } catch (err) {
    console.error('PUT /api/predictions error:', err.message)
    return json(500, { error: 'İşlem başarısız.', detail: err.message })
  }
}
