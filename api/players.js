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

/** id biçim bekçisi (#24 T3 review): uuid OLMAYAN id gerçek PostgREST'te
 *  22P02 hatasıyla 500 + ham hata metni sızdırıyordu. Katı uuid zorlaması
 *  demo/bellek-içi kimlik geleneğini ('p1', 'm-open', 'demo-tsl-5') kırardı —
 *  bu yüzden güvenli karakter aralığı (harf/rakam/_/-, ≤64) yeterli: tırnak,
 *  noktalı virgül, boşluk gibi çöp dostça 400 düşer. */
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/
const idOk = id => typeof id === 'string' && ID_RE.test(id)

// --- Uçlar (demo sunucusu da yeniden kullanır; export'lar test amaçlı) ---

export async function createPlayer(supabase, request) {
  const body = await request.json().catch(() => null)
  const name = cleanName(body?.name)
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
    console.error('createPlayer:', error.message) // iç ayrıntı yalnız sunucuda
    return json(500, { error: 'Oyuncu eklenemedi.' })
  }
  return json(201, { ok: true, player: { ...player, initials: initialsOf(player.name) } })
}

export async function updatePlayer(supabase, request) {
  const body = await request.json().catch(() => null)
  const { id } = body ?? {}
  if (!id) return json(400, { error: 'id gerekli.' })
  if (!idOk(id)) return json(400, { error: 'id geçersiz biçimde.' })

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
    console.error('updatePlayer:', error.message)
    return json(500, { error: 'Oyuncu güncellenemedi.' })
  }
  if (!player) return json(404, { error: 'Oyuncu bulunamadı.' })
  return json(200, { ok: true, player: { ...player, initials: initialsOf(player.name) } })
}

/** Oyuncuyu GERÇEKTEN sil. Tahmini varsa reddeder (dostça hata). Yarış
 *  penceresi (#24 T3 review): sayım→silme arasına concurrent tahmin yazımı
 *  cascade silme yaratmasın diye FK migration'ı RESTRICT'e çeker (bkv.
 * supabase/migrations/2026-11-players-restrict.sql); 23503 burada 409'a
 *  düşer. Başarılı silmede avatar dosyası da temizlenir (yetim kalmasın). */
export async function deletePlayer(supabase, request) {
  const body = await request.json().catch(() => null)
  const { id } = body ?? {}
  if (!id) return json(400, { error: 'id gerekli.' })
  if (!idOk(id)) return json(400, { error: 'id geçersiz biçimde.' })

  // silinen oyuncunun avatar dosyasını sonra temizlemek için önce oku
  const { data: target } = await supabase
    .from('players')
    .select('id, avatar_url')
    .eq('id', id)
    .maybeSingle()
  if (!target) return json(404, { error: 'Oyuncu bulunamadı.' })

  const { count } = await supabase
    .from('predictions')
    .select('id', { count: 'exact', head: true })
    .eq('player_id', id)
  if ((count ?? 0) > 0) {
    return json(409, { error: `Oyuncunun ${count} tahmini var; önce tahminleri silin.` })
  }

  const { error } = await supabase.from('players').delete().eq('id', id)
  if (error) {
    // RESTRICT FK'sı devredeyse concurrent tahmin yazımı buraya düşer.
    if (error.code === '23503') {
      return json(409, { error: 'Oyuncunun tahminleri var; önce tahminleri silin.' })
    }
    return json(500, { error: 'Oyuncu silinemedi.' })
  }
  // avatar storage temizliği (hatası ana işlemi bozmaz)
  if (typeof target.avatar_url === 'string' && target.avatar_url.includes('/avatars/')) {
    const path = target.avatar_url.slice(target.avatar_url.indexOf('/avatars/') + '/avatars/'.length)
    if (path.startsWith(`av-${id}-`)) {
      try { await supabase.storage.from('avatars').remove([path]) } catch { /* sessiz */ }
    }
  }
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
    return json(500, { error: 'İşlem başarısız.' })
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
