// POST /api/maho — /maho gizli sayfasının Discord relay ucu.
// Gövde: {text, name?} — text mesaj gövdesi (ön eksiz), name opsiyonel
// görünen ad (per-mesaj webhook username override; boşsa webhook varsayılanı).
//
// Aynı webhook'u gece özetiyle paylaşır (DISCORD_WEBHOOK_URL). Koruma
// modeli sitenin geneliyle aynı: uç herkese açıktır, erişim Vercel
// Deployment Protection ile sınırlıdır; ek olarak instance-içi rate limit
// (8 mesaj / 30 sn / IP) ve mesaj başına 2000 kr doğrulaması vardır.
// Demo sunucu request.supabase enjekte eder — DISCORD_WEBHOOK_URL yoksa
// gönderim yerine konsol log'u çalışır (secretsiz lokal tur serbest).
// Üretimde webhook tanımsızsa uç 503 ile KAPALIDIR (notify/CRON_SECRET
// deseni). Not: Vercel web-standard imza için NAMED METHOD export ister.

import { getSupabase, isReadonly } from '../lib/supabase.js'
import { sendMahoMessage, validateText, normalizeName, createRateLimiter } from '../lib/maho.js'

const READONLY_MSG =
  'Salt-okunur mod: SUPABASE_SERVICE_ROLE_KEY tanımlı değil. Yazma işlemleri için .env dosyasına ekleyin.'

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  })

// Instance-içi limiter (serverless'ta dağıtık değildir — best effort).
const limiter = createRateLimiter()

/** İstemci anahtarı: x-forwarded-for'un ilk değeri (Vercel proxy'si yazarken
 *  istemci IP'sidir); lokalde başlık yoktur → 'local'. */
function clientKey(request) {
  const fwd = request.headers?.get('x-forwarded-for') ?? ''
  return fwd.split(',')[0].trim() || 'local'
}

/** Demo gönderimi (webhook yoksa): Discord'a HİÇBİR İSTEK atmaz, mesajı
 *  kısaltılmış olarak konsola yazar — secretsiz `npm run dev:api` turu. */
const demoSend = async (_webhookUrl, payload) => {
  const preview = String(payload.content).replace(/\n/g, ' ⏎ ').slice(0, 120)
  console.log(`[maho·demo] ${payload.username ? `[${payload.username}] ` : ''}${preview}`)
}

/** Çekirdek akış (demo sunucu da yeniden kullanir; test amaçlı export). */
export async function sendMaho(supabase, request, opts = {}) {
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') return json(400, { error: 'Geçersiz istek.' })

  // Doğrulama rate limit'ten ÖNCE: hatalı deneme limit penceresi yakmasın.
  const check = validateText(body.text)
  if (!check.ok) return json(400, { error: check.error })

  const gate = limiter.take(opts.key ?? clientKey(request))
  if (!gate.ok) {
    const secs = Math.max(1, Math.ceil(gate.retryAfterMs / 1000))
    return json(429, { error: `Çok hızlı yazıyorsun — ${secs} saniye sonra tekrar dene.` })
  }

  try {
    const result = await sendMahoMessage(supabase, {
      text: check.text,
      name: normalizeName(body.name),
      webhookUrl: opts.webhookUrl ?? process.env.DISCORD_WEBHOOK_URL,
      ...(opts.send ? { send: opts.send } : {}),
    })
    return json(200, result)
  } catch (err) {
    if (err.status === 400) return json(400, { error: err.message })
    if (err.message === 'DISCORD_RATE_LIMIT') {
      return json(429, { error: 'Discord limitsini astın — biraz bekleyip tekrar dene.' })
    }
    // Webhook URL'i ve Discord yanıt gövdesi mesaja ASLA girmez (yalnız kod).
    console.error('POST /api/maho error:', err.message)
    return json(502, { error: 'Mesaj Discord’a gönderilemedi. Lütfen tekrar dene.' })
  }
}

export async function POST(request) {
  if (request.method !== 'POST') return json(405, { error: 'Yalnızca POST desteklenir.' })
  try {
    // supabase enjeksiyonu: demo sunucu bellek-içi istemcisini geçebilir
    // (request.supabase); üretimde (Vercel) env tabanlı istemci kurulur.
    const demo = request.supabase != null
    const supabase = request.supabase ?? getSupabase()
    // #7: anon key ile bağlandıysa yazma ucu 503 döner (demo hariç).
    if (!demo && isReadonly()) {
      return json(503, { error: READONLY_MSG })
    }
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL
    if (!webhookUrl && !demo) {
      return json(503, { error: 'DISCORD_WEBHOOK_URL tanımlı değil; uç kapalı.' })
    }
    // Demo + webhook yok → konsol log'u gönderimi; değilse gerçek postMaho.
    return await sendMaho(supabase, request, {
      ...(webhookUrl ? {} : { send: demoSend }),
    })
  } catch (err) {
    console.error('POST /api/maho error:', err.message)
    return json(500, { error: 'İşlem başarısız.' })
  }
}
