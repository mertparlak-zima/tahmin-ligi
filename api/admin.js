// /api/admin/* — tek şifreli yönetim uçları.
// Yetkilendirme: Authorization: Bearer <ADMIN_PASSWORD>

import { createHash, timingSafeEqual } from 'node:crypto'
import { getSupabase } from '../lib/supabase.js'
import { syncNow } from '../lib/sync.js'
import { buildAdminPayload, DEFAULT_SCORING, initialsOf } from '../lib/league.js'
import { isLocked } from '../lib/status.js'

const PLAYER_COLORS = ['#b8f34a', '#5ce1e6', '#ff9f68', '#ffd05c', '#c792ea', '#f78fb3', '#39dfb2', '#6db6ff']

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  })

function passwordOk(provided) {
  const expected = process.env.ADMIN_PASSWORD
  if (!expected || !provided) return false
  const a = createHash('sha256').update(String(provided)).digest()
  const b = createHash('sha256').update(String(expected)).digest()
  return timingSafeEqual(a, b)
}

const bearer = request => {
  const header = request.headers.get('authorization') ?? ''
  return header.startsWith('Bearer ') ? header.slice(7) : ''
}

const colorOk = c => /^#[0-9a-fA-F]{6}$/.test(c ?? '')

const cleanName = raw => String(raw ?? '').replace(/\s+/g, ' ').trim()

// --- Uçlar ---

async function login(request) {
  const body = await request.json().catch(() => ({}))
  if (!passwordOk(body.password)) return json(401, { error: 'Şifre hatalı.' })
  return json(200, { ok: true })
}

async function bootstrap(supabase) {
  const payload = await buildAdminPayload(supabase)
  return json(200, payload)
}

async function savePredictions(supabase, request) {
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

async function createPlayer(supabase, request) {
  const body = await request.json().catch(() => ({}))
  const name = cleanName(body.name)
  if (name.length < 2 || name.length > 40) {
    return json(400, { error: 'İsim 2-40 karakter olmalı.' })
  }

  const { count } = await supabase.from('players').select('id', { count: 'exact', head: true })
  const color = colorOk(body.color) ? body.color : PLAYER_COLORS[(count ?? 0) % PLAYER_COLORS.length]

  const { data: player, error } = await supabase
    .from('players')
    .insert({ name, color })
    .select('id, name, color, is_active')
    .single()
  if (error) {
    if (error.code === '23505') return json(400, { error: 'Bu isimde bir oyuncu zaten var.' })
    return json(500, { error: `Oyuncu eklenemedi: ${error.message}` })
  }
  return json(201, { ok: true, player: { ...player, initials: initialsOf(player.name) } })
}

async function updatePlayer(supabase, request) {
  const body = await request.json().catch(() => ({}))
  const { id } = body
  if (!id) return json(400, { error: 'id gerekli.' })

  const patch = {}
  if (body.name !== undefined) {
    const name = cleanName(body.name)
    if (name.length < 2 || name.length > 40) return json(400, { error: 'İsim 2-40 karakter olmalı.' })
    patch.name = name
  }
  if (body.color !== undefined) {
    if (!colorOk(body.color)) return json(400, { error: 'Renk #rrggbb biçiminde olmalı.' })
    patch.color = body.color
  }
  if (body.isActive !== undefined) patch.is_active = Boolean(body.isActive)
  if (Object.keys(patch).length === 0) return json(400, { error: 'Güncellenecek alan yok.' })

  const { data: player, error } = await supabase
    .from('players')
    .update(patch)
    .eq('id', id)
    .select('id, name, color, is_active')
    .single()
  if (error) {
    if (error.code === '23505') return json(400, { error: 'Bu isimde bir oyuncu zaten var.' })
    return json(500, { error: `Oyuncu güncellenemedi: ${error.message}` })
  }
  if (!player) return json(404, { error: 'Oyuncu bulunamadı.' })
  return json(200, { ok: true, player: { ...player, initials: initialsOf(player.name) } })
}

async function saveScoring(supabase, request) {
  const body = await request.json().catch(() => ({}))
  const { data: current } = await supabase
    .from('app_config')
    .select('value')
    .eq('key', 'scoring')
    .maybeSingle()

  const scoring = { ...DEFAULT_SCORING, ...(current?.value ?? {}) }
  if (body.label !== undefined) {
    const label = String(body.label).trim()
    if (label.length < 1 || label.length > 80) return json(400, { error: 'Etiket 1-80 karakter olmalı.' })
    scoring.label = label
  }
  if (body.status !== undefined) {
    if (!['provisional', 'final'].includes(body.status)) {
      return json(400, { error: 'Durum provisional veya final olmalı.' })
    }
    scoring.status = body.status
  }
  if (body.correctOutcome !== undefined) {
    const n = Number(body.correctOutcome)
    if (!Number.isInteger(n) || n < 0 || n > 100) {
      return json(400, { error: 'Puan 0-100 arası tam sayı olmalı.' })
    }
    scoring.correctOutcome = n
  }

  const { error } = await supabase
    .from('app_config')
    .upsert({ key: 'scoring', value: scoring }, { onConflict: 'key' })
  if (error) return json(500, { error: `Puanlama kaydedilemedi: ${error.message}` })
  return json(200, { ok: true, scoring })
}

async function sync(supabase) {
  try {
    const result = await syncNow(supabase)
    return json(200, { ok: true, ...result })
  } catch (err) {
    return json(502, { ok: false, error: err.message })
  }
}

// --- Yönlendirici ---

export default async function handler(request) {
  const path = new URL(request.url).pathname.replace(/\/+$/, '')
  const route = `${request.method} ${path}`

  try {
    if (route === 'POST /api/admin/login') return await login(request)

    if (!passwordOk(bearer(request))) return json(401, { error: 'Yetkisiz.' })
    const supabase = getSupabase()

    switch (route) {
      case 'GET /api/admin/bootstrap':
        return await bootstrap(supabase)
      case 'PUT /api/admin/predictions':
        return await savePredictions(supabase, request)
      case 'POST /api/admin/players':
        return await createPlayer(supabase, request)
      case 'PATCH /api/admin/players':
        return await updatePlayer(supabase, request)
      case 'PUT /api/admin/scoring':
        return await saveScoring(supabase, request)
      case 'POST /api/admin/sync':
        return await sync(supabase)
      default:
        return json(404, { error: 'Bilinmeyen uç.' })
    }
  } catch (err) {
    console.error('/api/admin error:', err.message)
    return json(500, { error: 'İşlem başarısız.', detail: err.message })
  }
}
