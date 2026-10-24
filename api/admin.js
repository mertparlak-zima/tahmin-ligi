// /api/admin/* — tek şifreli yönetim uçları.
// Yetkilendirme: Authorization: Bearer <ADMIN_PASSWORD>

import { createHash, timingSafeEqual } from 'node:crypto'
import { getSupabase, isReadonly } from '../lib/supabase.js'
import { syncNow } from '../lib/sync.js'
import { buildAdminPayload, DEFAULT_SCORING, initialsOf } from '../lib/league.js'
import { isLocked } from '../lib/status.js'

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

// --- Uçlar (demo sunucusu da yeniden kullanır; export'lar test amaçlı) ---

export async function login(request) {
  const body = await request.json().catch(() => ({}))
  if (!passwordOk(body.password)) return json(401, { error: 'Şifre hatalı.' })
  return json(200, { ok: true })
}

export async function bootstrap(supabase) {
  const payload = await buildAdminPayload(supabase)
  return json(200, payload)
}

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
    .insert({ name, color })
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

/** #6: Oyuncuyu GERÇEKTEN sil (test temizliği). Tahmini varsa reddeder. */
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

// --- #17 Profil fotoğrafları ---
// akış: istemci görseli 256x256 JPEG'e (veya PNG/WebP) yeniden kodlayıp
// data URL olarak gönderir; sunucu içerik doğrulaması yapıp Supabase
// Storage 'avatars' bucket'ına yazar ve players.avatar_url'u günceller.

const AVATAR_BUCKET = 'avatars'
const AVATAR_MAX_BYTES = 512 * 1024
// Beyan edilebilecek MIME'ler + magic-byte türünden dosya uzantısı.
const AVATAR_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

/** data URL'i ayrıştırır: `data:image/jpeg;base64,...` → { mime, bytes }.
 * Biçim uygun değilse null döner (base64 gövdesi boşsa da bytes boş gelir;
 * magic-byte kontrolü zaten reddeder). */
function parseAvatarDataUrl(raw) {
  if (typeof raw !== 'string' || !raw.startsWith('data:image/')) return null
  const comma = raw.indexOf(',')
  if (comma === -1) return null
  // meta: 'image/<tür>;base64' — yalnız base64 kodlama desteklenir.
  const meta = raw.slice(5, comma)
  const semicolon = meta.lastIndexOf(';base64')
  if (semicolon === -1) return null
  const mime = meta.slice(0, semicolon)
  const bytes = Buffer.from(raw.slice(comma + 1), 'base64')
  return { mime, bytes }
}

/** Magic-byte koklama: içeriğin GERÇEK türünü döndürür (beyan değil).
 * JPEG FF D8 FF · PNG 89 50 4E 47 · WebP 52 49 46 46 (RIFF). */
function sniffImageType(bytes) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png'
  if (bytes.length >= 4 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) return 'image/webp'
  return null
}

/** Public avatar URL'inden storage path'ini çıkarır; yalnız bu oyuncuya ait
 * `av-<playerId>-` önekli dosya döner (başka path asla silinemez). */
function avatarPathOf(url, playerId) {
  if (typeof url !== 'string') return null
  const marker = `/${AVATAR_BUCKET}/`
  const idx = url.indexOf(marker)
  if (idx === -1) return null
  const path = url.slice(idx + marker.length)
  return path.startsWith(`av-${playerId}-`) ? path : null
}

/** Storage dosyasını sessizce siler: temizlik hatası ana işlemi bozmaz. */
async function removeStorageQuietly(supabase, path) {
  try {
    const { error } = await supabase.storage.from(AVATAR_BUCKET).remove([path])
    if (error) console.error(`Avatar silinemedi (${path}):`, error.message)
  } catch (err) {
    console.error(`Avatar silinemedi (${path}):`, err.message)
  }
}

export async function uploadAvatar(supabase, request) {
  const body = await request.json().catch(() => ({}))
  const { playerId } = body

  // a) playerId + dataUrl biçimi
  if (!playerId || typeof body.dataUrl !== 'string' || !body.dataUrl.startsWith('data:image/')) {
    return json(400, { error: 'playerId ve dataUrl (data:image/...;base64,...) gerekli.' })
  }
  const parsed = parseAvatarDataUrl(body.dataUrl)
  if (!parsed) return json(400, { error: 'dataUrl biçimi geçersiz: data:image/<tür>;base64,<veri> olmalı.' })

  // b) beyan edilen MIME beyaz listede mi
  if (!AVATAR_TYPES[parsed.mime]) {
    return json(400, { error: 'Görsel türü JPEG, PNG veya WebP olmalı.' })
  }

  // c) çözülen gövde ≤ 512 KB
  if (parsed.bytes.length > AVATAR_MAX_BYTES) {
    return json(400, { error: 'Görsel en fazla 512 KB olabilir.' })
  }

  // d) magic-byte: belirleyici olan İÇERİK; beyanla uyuşmak zorunda değil,
  //    whitelist'te bir türe denk geliyorsa kabul edilir.
  const sniffed = sniffImageType(parsed.bytes)
  if (!sniffed) {
    return json(400, { error: 'Dosya içeriği geçerli bir görsel değil (JPEG, PNG, WebP).' })
  }

  // e) oyuncu var mı (eski avatar_url temizliği için de gerekiyor)
  const { data: player } = await supabase
    .from('players')
    .select('id, name, avatar_url')
    .eq('id', playerId)
    .maybeSingle()
  if (!player) return json(404, { error: 'Oyuncu bulunamadı.' })

  // f) yükleme — versiyonlu ad: cache-busting + upsert gerekmez
  const path = `av-${playerId}-${Date.now()}.${AVATAR_TYPES[sniffed]}`
  const { error: uploadError } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(path, parsed.bytes, { contentType: sniffed, upsert: false })
  if (uploadError) return json(500, { error: `Avatar yüklenemedi: ${uploadError.message}` })

  const avatarUrl = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path).data.publicUrl

  // g) DB güncelleme; update başarısızsa yeni dosya yetim kalmasın
  const { data: updated, error: updateError } = await supabase
    .from('players')
    .update({ avatar_url: avatarUrl })
    .eq('id', playerId)
    .select('id, name, color, is_active, avatar_url')
    .maybeSingle()
  if (updateError || !updated) {
    await removeStorageQuietly(supabase, path)
    if (updateError) return json(500, { error: `Avatar kaydedilemedi: ${updateError.message}` })
    return json(404, { error: 'Oyuncu bulunamadı.' })
  }

  // başarılı yüklemeden SONRA eski dosyayı temizle (hata yüklemeyi bozmaz)
  const oldPath = avatarPathOf(player.avatar_url, playerId)
  if (oldPath) await removeStorageQuietly(supabase, oldPath)

  // h) yanıt
  return json(200, { ok: true, avatarUrl, player: { ...updated, initials: initialsOf(updated.name) } })
}

export async function deleteAvatar(supabase, request) {
  const body = await request.json().catch(() => ({}))
  const playerId = body.playerId ?? new URL(request.url).searchParams.get('playerId')
  if (!playerId) return json(400, { error: 'playerId gerekli.' })

  const { data: player } = await supabase
    .from('players')
    .select('id, name, avatar_url')
    .eq('id', playerId)
    .maybeSingle()
  if (!player) return json(404, { error: 'Oyuncu bulunamadı.' })

  // storage'dan mevcut dosyayı sil (hatası yutulur), sonra kolonu boşalt
  const path = avatarPathOf(player.avatar_url, playerId)
  if (path) await removeStorageQuietly(supabase, path)

  const { data: updated, error } = await supabase
    .from('players')
    .update({ avatar_url: null })
    .eq('id', playerId)
    .select('id, name, color, is_active, avatar_url')
    .maybeSingle()
  if (error) return json(500, { error: `Avatar silinemedi: ${error.message}` })
  if (!updated) return json(404, { error: 'Oyuncu bulunamadı.' })
  return json(200, { ok: true, player: { ...updated, initials: initialsOf(updated.name) } })
}

// Puanlama kuralı ucu KALDIRILDI (#20 U6): kural yalnız DB'den yönetilir
// (app_config 'scoring'); panel salt-okunur gösterir. Eski uca istek →
// router'ın bilinmeyen uç 404'ü döner.

export async function sync(supabase) {
  try {
    const result = await syncNow(supabase)
    return json(200, { ok: true, ...result })
  } catch (err) {
    return json(502, { ok: false, error: err.message })
  }
}

// --- Yönlendirici ---
// Vercel web-standard imza: NAMED METHOD export'ları (GET/POST/PUT/PATCH).
// (Varsayılan export, Vercel'de legacy (req,res) imzası sanılıp dönüşü yok
// sayıyordu → 30 sn FUNCTION_INVOCATION_TIMEOUT. Bkv. commit geçmişi.)

async function route(request) {
  const path = new URL(request.url).pathname.replace(/\/+$/, '')
  const routeKey = `${request.method} ${path}`

  try {
    if (routeKey === 'POST /api/admin/login') return await login(request)

    if (!passwordOk(bearer(request))) return json(401, { error: 'Yetkisiz.' })

    // #7: anon key ile bağlandıysa yazma uçları 503 döner (bootstrap OK).
    const WRITE_ROUTES = new Set([
      'PUT /api/admin/predictions',
      'POST /api/admin/players',
      'PATCH /api/admin/players',
      'DELETE /api/admin/players/avatar',
      'PUT /api/admin/players/avatar',
      'POST /api/admin/sync',
    ])
    if (WRITE_ROUTES.has(routeKey) && isReadonly()) {
      return json(503, { error: READONLY_MSG })
    }

    const supabase = getSupabase()

    switch (routeKey) {
      case 'GET /api/admin/bootstrap':
        return await bootstrap(supabase)
      case 'PUT /api/admin/predictions':
        return await savePredictions(supabase, request)
      case 'POST /api/admin/players':
        return await createPlayer(supabase, request)
      case 'PATCH /api/admin/players':
        return await updatePlayer(supabase, request)
      case 'DELETE /api/admin/players':
        return await deletePlayer(supabase, request)
      case 'PUT /api/admin/players/avatar':
        return await uploadAvatar(supabase, request)
      case 'DELETE /api/admin/players/avatar':
        return await deleteAvatar(supabase, request)
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

export async function GET(request) {
  return route(request)
}

export async function POST(request) {
  return route(request)
}

export async function PUT(request) {
  return route(request)
}

export async function PATCH(request) {
  return route(request)
}

export async function DELETE(request) {
  return route(request)
}
