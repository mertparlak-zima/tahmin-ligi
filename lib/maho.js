// /maho gizli sohbet ucu: yazılan metni ÖN EKSİZ (prefix yok, komut yok,
// kimlik yok) Discord webhook'una yollar. Gece özeti İLE AYNI kanal/webhook
// paylaşılır (DISCORD_WEBHOOK_URL) — ayrı env yoktur.
//
// Akış (api/maho.js ve demo sunucu ortak kullanır):
//   doğrula → rate limit (api katmanı) → Discord'a gönder → BAŞARILIYSA
//   manual_messages tablosuna yaz (moderasyon kaydı — tablo = "Discord'a
//   düşenler"; başarısız deneme yazılmaz, kullanıcı yeniden dener).
//
// Biçim: mesaj gövdesi kullanıcının yazdığı KENDİSİDİR — metin YALNIZ kontrol
// ve zero-width karakterlerden temizlenir; markdown olduğu gibi Discord'da
// render olur (chat hissi). Opsiyonel "name" webhook'a özel per-mesaj
// username override'unu taşır (Discord sınırı 1-80 kr); boşsa override
// YOLLANMAZ → webhook'un varsayılan adı görünür.
//
// Güvenlik (postDiscord deseni, bkv. lib/notify.js): allowed_mentions
// tamamen kapalı → @everyone/@role enjeksiyonu imkânsız. Webhook URL'i
// yalnız sunucu env'inde; yanıtlara, loglara ve hata mesajlarına ASLA girmez.

const MAX_TEXT = 2000 // Discord content üst sınırı
const MAX_NAME = 80 // Discord username override üst sınırı

// Rate limit (api katmanı): pencere başına mesaj — serverless'ta instance-içi
// best-effort'tır (dağıtık DEĞİL); Discord'un kendi 429'u ikinci katmandır.
export const RATE_LIMIT_MAX = 8
export const RATE_LIMIT_WINDOW_MS = 30_000

// Kontrol karakterleri (\n hariç — çok satırlı mesaj serbest) + satır ayrıcı
// Unicode kontrolleri (\u2028/\u2029) + zero-width + BOM: görünmez karakter
// spam'i ve biçim bozma girişimleri düşer (chat'te alt satır \n ile verilir).
const CTRL_RE = /[\u0000-\u0008\u000B-\u001F\u007F\u200B-\u200D\u2028\u2029\u2060\uFEFF]/g

/** Mesaj gövdesini doğrula: kontrol kr. temizliği + trim + boşluk/uzunluk.
 * Dönüş: {ok:true, text} | {ok:false, error} (Türkçe, kullanıcı dostu). */
export function validateText(raw) {
  const text = String(raw ?? '').replace(CTRL_RE, '').trim()
  if (text.length === 0) return { ok: false, error: 'Mesaj boş olamaz.' }
  if (text.length > MAX_TEXT) {
    return { ok: false, error: `Mesaj en fazla ${MAX_TEXT} karakter olabilir.` }
  }
  return { ok: true, text }
}

/** Opsiyonel görünen ad: temizle + tek boşluğa indir + 80 kr kırp.
 * Boş/yalnız-boşluk → '' (payload'a username GirilMEZ). */
export function normalizeName(raw) {
  return String(raw ?? '')
    .replace(CTRL_RE, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NAME)
}

// Discord webhook kullanıcı adları "clyde"/"discord" dizilerini içeren adları
// 400 ile reddeder (büyük/küçük duyarsız) — kullanıcı takılıp kalmasın diye
// gönderimden ÖNCE aynı kural uygulanır (bkv. api/maho.js).
const NAME_FORBIDDEN_RE = /clyde|discord/i

/** Discord'un reddedeceği görünen ad mı? (api katmanı 400 ile çevirir) */
export function isNameForbidden(name) {
  return NAME_FORBIDDEN_RE.test(String(name ?? ''))
}

/** Discord webhook gövdesi: mesaj ÖN EKSİZDİR (content = metnin kendisi);
 * mention parse tamamen kapalı; ad doluysa username override eklenir. */
export function buildDiscordPayload(text, name) {
  return {
    content: text,
    allowed_mentions: { parse: [] },
    ...(name ? { username: name } : {}),
  }
}

/** Sabit-pencere rate limit fabrikası (saf — test edilir). now enjekte
 * edilebilir; take(key) → {ok, retryAfterMs}. Engellenen deneme pencereyi
 * UZATMAZ. Bellek notu: Map anahtar başına tek kayıt tutar ve yalnız aynı
 * anahtar yeniden geldiğinde budanır — anahtar sayısı instance ömrü boyunca
 * gelen tekil IP'lerle sınırlıdır (Vercel'de soğuk instance sınırlar;
 * uzun ömürlü dev sunucusunda birkaç kayıttır). */
export function createRateLimiter({
  max = RATE_LIMIT_MAX,
  windowMs = RATE_LIMIT_WINDOW_MS,
  now = () => Date.now(),
} = {}) {
  const hits = new Map() // key → pencere içi timestamp'ler
  return {
    take(key) {
      const t = now()
      const list = (hits.get(key) ?? []).filter(ts => t - ts < windowMs)
      if (list.length >= max) {
        hits.set(key, list)
        return { ok: false, retryAfterMs: list[0] + windowMs - t }
      }
      list.push(t)
      hits.set(key, list)
      return { ok: true, retryAfterMs: 0 }
    },
  }
}

/** Discord webhook'a tek mesaj yollar. 429 ayrı işaretlenir (api katmanı
 * kullanıcıya farklı mesaj basar); öteki hatalar yalnız durum kodu olarak
 * yükselir — webhook URL'i ve yanıt gövdesi hata mesajına ASLA girmez. */
export async function postMaho(webhookUrl, payload) {
  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (res.status === 429) throw new Error('DISCORD_RATE_LIMIT')
  if (!res.ok) throw new Error(`Discord webhook ${res.status}`)
}

/**
 * Tek maho mesajı: (yeniden)doğrula → Discord'a gönder → manual_messages'a
 * yaz. opts.send test enjeksiyonudur (varsayılan postMaho).
 * Doğrulama hatası err.status=400 ile fırlar (api katmanı eşler); Discord
 * hatası düz Error olarak fırlar.
 * Kayıt notu: mesaj Discord'a DÜŞTÜYSE teslim gerçektir — insert hatası
 * kullanıcıya hata GÖSTERMEZ (yalnız log; stored:false raporlanır).
 */
export async function sendMahoMessage(supabase, { text, name, webhookUrl, send = postMaho }) {
  const check = validateText(text)
  if (!check.ok) {
    const err = new Error(check.error)
    err.status = 400
    throw err
  }
  const cleanName = normalizeName(name)
  await send(webhookUrl, buildDiscordPayload(check.text, cleanName))
  const row = cleanName ? { text: check.text, name: cleanName } : { text: check.text }
  const { error } = await supabase.from('manual_messages').insert(row)
  if (error) {
    console.error('manual_messages kaydı yazılamadı:', error.message)
    return { ok: true, stored: false }
  }
  return { ok: true, stored: true }
}
