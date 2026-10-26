// /api/players — herkese açık oyuncu yönetimi (#24 Faz 1).
// POST ekle · PATCH güncelle (ad/renk/aktif) · DELETE sil (tahmini yoksa).
// Erişim koruması yoktur: Vercel deployment protection girişi kapılar.
// Not: Vercel web-standard imza için NAMED METHOD export ister (bkv. api/league.js).

import { getSupabase, isReadonly } from '../lib/supabase.js'
import { initialsOf } from '../lib/league.js'

const READONLY_MSG = 'Salt-okunur mod: SUPABASE_SERVICE_ROLE_KEY tanımlı değil. Yazma işlemleri için .env dosyasına ekleyin.'

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

const colorOk = c => /^#[0-9a-fA-F]{6}$/.test(c ?? '')

const cleanName = raw => String(raw ?? '').replace(/\s+/g, ' ').trim()

// --- Uçlar (demo sunucusu da yeniden kullanır; export'lar test amaçlı) ---

export async function createPlayer(supabase, request) {
  const body = await request.json().catch(() => ({}))
  const name = cleanName(body.name)
  if (name.length < 2 || name.length > 40) {
    return json(400, { error: 'İsim 2-40 karakter olmalı.' })
  }

  const { count } = await supabase.from('players').select('id', { count: 'exact', head: true })
  const color = colorOk(body.color) ? body.color : PLAYER_COLORS[(count ?? 0) % PLAYER_COLORS.length]

  const { data: player, error } = await supabase
    .from('players')
    // is_active açıkça yazılır: üretimde kolon default'u true olur ama
    // bellek-içi demo istemcisi (scripts/demo-server.mjs) default uygulamaz —
    // yazılmazsa yeni oyuncu public payload'ın aktif filtresine takılıp
    // kaybolur (#24 Faz 2 browser-check'te yakalandı).
    .insert({ name, color, is_active: true })
    .select('id, name, color, is_active')
    .single()
  if (error) {
    if (error.code === '23505') return json(400, { error: 'Bu isimde bir oyuncu zaten var.' })
    return json(500, { error: `Oyuncu eklenemedi: ${error.message}` })
  }
  return json(201, { ok: true, player: { ...player, initials: initialsOf(player.name) } })
}

export async function updatePlayer(supabase, request) {
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
    // maybeSingle: eşleşmeyen id'de gerçek supabase-js .single()'ı PGRST116
    // hatasıyla reddeder ve 404 dalı çalışmazdı; maybeSingle data:null döndürür.
    .maybeSingle()
  if (error) {
    if (error.code === '23505') return json(400, { error: 'Bu isimde bir oyuncu zaten var.' })
    return json(500, { error: `Oyuncu güncellenemedi: ${error.message}` })
  }
  if (!player) return json(404, { error: 'Oyuncu bulunamadı.' })
  return json(200, { ok: true, player: { ...player, initials: initialsOf(player.name) } })
}

/** Oyuncuyu GERÇEKTEN sil. Tahmini varsa reddeder (dostça hata). */
export async function deletePlayer(supabase, request) {
  const body = await request.json().catch(() => ({}))
  const { id } = body
  if (!id) return json(400, { error: 'id gerekli.' })

  const { count } = await supabase
    .from('predictions')
    .select('id', { count: 'exact', head: true })
    .eq('player_id', id)
  if ((count ?? 0) > 0) {
    return json(409, { error: `Oyuncunun ${count} tahmini var; önce tahminleri silin.` })
  }

  const { error } = await supabase.from('players').delete().eq('id', id)
  if (error) return json(500, { error: `Oyuncu silinemedi: ${error.message}` })
  return json(200, { ok: true, deleted: id })
}

// --- Yönlendirici ---
// Vercel web-standard imza: NAMED METHOD export'ları (GET/POST/PUT/PATCH).
// (Varsayılan export, Vercel'de legacy (req,res) imzası sanılıp dönüşü yok
// sayıyordu → 30 sn FUNCTION_INVOCATION_TIMEOUT. Bkv. commit geçmişi.)

async function handle(fn, request, method) {
  try {
    if (request.method !== method) return json(405, { error: `Yalnızca ${method} desteklenir.` })
    // supabase enjeksiyonu: demo sunucu bellek-içi istemcisini geçebilir
    // (request.supabase); üretimde (Vercel) env tabanlı istemci kurulur.
    const supabase = request.supabase ?? getSupabase()
    // #7: anon key ile bağlandıysa yazma ucu 503 döner.
    if (!request.supabase && isReadonly()) {
      return json(503, { error: READONLY_MSG })
    }
    return await fn(supabase, request)
  } catch (err) {
    console.error(`${method} /api/players error:`, err.message)
    return json(500, { error: 'İşlem başarısız.', detail: err.message })
  }
}

export async function POST(request) {
  return handle(createPlayer, request, 'POST')
}

export async function PATCH(request) {
  return handle(updatePlayer, request, 'PATCH')
}

export async function DELETE(request) {
  return handle(deletePlayer, request, 'DELETE')
}
