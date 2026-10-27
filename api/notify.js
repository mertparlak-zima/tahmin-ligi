// GET /api/notify — Vercel cron gece özeti ucu (#29).
// vercel.json crons kaydı günde 1 kez 00:20 TR (21:20 UTC) vurur. Koruma:
// Authorization: Bearer CRON_SECRET (Vercel, CRON_SECRET tanımlıysa bu başlığı
// cron isteklerine otomatik ekler). ?dry=1 → göndermeden önizleme.
//
// Akış: senkron tazelenir (site açılmasa da skorlar DB'ye düşer — maybeSync
// eşikleri canlı maç varken 90 sn'dir, final skor kaçmaz) → bitmiş + tahminli
// + flag'siz maçlar tek özette Discord'a gider → flag yazılır. Webhook URL'i
// yalnız sunucu env'inde (DISCORD_WEBHOOK_URL); yanıtlara ve loglara asla girmez.

import { getSupabase, isReadonly } from '../lib/supabase.js'
import { maybeSync } from '../lib/sync.js'
import { runNightlyNotify } from '../lib/notify.js'

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

  // Demo sunucu request.supabase enjekte eder: secretsiz lokal tur serbest.
  // Üretimde CRON_SECRET zorunlu — tanımsızsa uç hiç çalışmaz (dışarıdan
  // dürtülerek erken/spam özet gönderilemesin).
  if (!request.supabase) {
    const secret = process.env.CRON_SECRET
    if (!secret) return json(503, { error: 'CRON_SECRET tanımlı değil; uç kapalı.' })
    if (request.headers.get('authorization') !== `Bearer ${secret}`) {
      return json(401, { error: 'Yetkisiz.' })
    }
  }

  try {
    const supabase = request.supabase ?? getSupabase()
    if (!request.supabase && isReadonly()) {
      return json(503, { error: 'Yazma yetkisi yok (anon key ile bağlı).' })
    }
    // Senkron hatası özeti engellemesin: DB'deki son sağlıklı veriyle devam
    // (bitmiş maç geri alınmaz; eksik final skor bir sonraki turda düşer).
    await maybeSync(supabase).catch(() => {})
    const params = new URL(request.url).searchParams
    const result = await runNightlyNotify(supabase, {
      webhookUrl: process.env.DISCORD_WEBHOOK_URL,
      dry: params.get('dry') === '1',
    })
    return json(200, result)
  } catch (err) {
    console.error('/api/notify error:', err.message)
    return json(500, { error: 'Gece özeti hazırlanamadı.', detail: err.message })
  }
}
