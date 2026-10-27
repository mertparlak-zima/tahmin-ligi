// /api/players/avatar — herkese açık profil fotoğrafı ucu (#24 Faz 1).
// POST yükle · DELETE kaldır. (Kesin yol dosyası — Vercel dosya-tabanlı
// routing'te çok segmentli alt yollar catch-all'a düşmez, bkv. #17.)
//
// akış: istemci görseli 256x256 JPEG'e (veya PNG/WebP) yeniden kodlayıp
// data URL olarak gönderir; sunucu içerik doğrulaması yapıp Supabase
// Storage 'avatars' bucket'ına yazar ve players.avatar_url'u günceller.

import { getSupabase, isReadonly } from '../../lib/supabase.js'
import { initialsOf } from '../../lib/league.js'

const READONLY_MSG = 'Salt-okunur mod: SUPABASE_SERVICE_ROLE_KEY tanımlı değil. Yazma işlemleri için .env dosyasına ekleyin.'

const AVATAR_BUCKET = 'avatars'
const AVATAR_MAX_BYTES = 512 * 1024
// Beyan edilebilecek MIME'ler + magic-byte türünden dosya uzantısı.
const AVATAR_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  })

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
 * JPEG FF D8 FF · PNG 89 50 4E 47 · WebP: RIFF + 8. bayttan itibaren
 * 'WEBP' etiketi (#24 T3 review: yalnız RIFF kontrolü WAV/AVI'yi de
 * geçiyordu). */
function sniffImageType(bytes) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png'
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) return 'image/webp'
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

// --- Uçlar (demo sunucusu da yeniden kullanır; export'lar test amaçlı) ---

export async function uploadAvatar(supabase, request) {
  const body = await request.json().catch(() => null)
  const { playerId } = body ?? {}

  // a) playerId + dataUrl biçimi (+ id bekçisi — ham PostgREST hatası
  // sızmasın, #24 T3 review; güvenli aralık, bkv. api/players.js idOk)
  const ID_RE = /^[A-Za-z0-9_-]{1,64}$/
  if (!playerId || !ID_RE.test(String(playerId)) || typeof body.dataUrl !== 'string' || !body.dataUrl.startsWith('data:image/')) {
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
  if (uploadError) {
    console.error('uploadAvatar:', uploadError.message)
    return json(500, { error: 'Avatar yüklenemedi.' })
  }

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
    if (updateError) {
      console.error('uploadAvatar update:', updateError.message)
      return json(500, { error: 'Avatar kaydedilemedi.' })
    }
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

  // Denetim turu (#31): ÖNCE kolon boşaltılır (DB gerçeği), SONRA dosya
  // silinir — eski sıra update patlarsa "dosya yok, URL duruyor" bırakıyordu.
  const { data: updated, error } = await supabase
    .from('players')
    .update({ avatar_url: null })
    .eq('id', playerId)
    .select('id, name, color, is_active, avatar_url')
    .maybeSingle()
  if (error) {
    console.error('deleteAvatar:', error.message)
    return json(500, { error: 'Avatar silinemedi.' })
  }
  if (!updated) return json(404, { error: 'Oyuncu bulunamadı.' })

  // storage'dan dosyayı temizle (hatası ana işlemi bozmaz)
  const path = avatarPathOf(player.avatar_url, playerId)
  if (path) await removeStorageQuietly(supabase, path)

  return json(200, { ok: true, player: { ...updated, initials: initialsOf(updated.name) } })
}

// --- Yönlendirici ---
// Vercel web-standard imza: NAMED METHOD export'ları.

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
    console.error(`${method} /api/players/avatar error:`, err.message)
    return json(500, { error: 'İşlem başarısız.' })
  }
}

export async function POST(request) {
  return handle(uploadAvatar, request, 'POST')
}

export async function DELETE(request) {
  return handle(deleteAvatar, request, 'DELETE')
}
