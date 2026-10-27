// npm run notify:dry — gerçek Supabase verisiyle gece özetini GÖNDERMEDEN
// önizler (#29). --send bayrağıyla gerçekten gönderir (DISCORD_WEBHOOK_URL
// gerekir; service key gerekir — flag yazar). Kullanım:
//   node --env-file=.env scripts/notify-dry.mjs          → önizleme
//   node --env-file=.env scripts/notify-dry.mjs --send   → gönder + flag

import { getSupabase, isReadonly } from '../lib/supabase.js'
import { maybeSync } from '../lib/sync.js'
import { runNightlyNotify } from '../lib/notify.js'

const send = process.argv.includes('--send')
const supabase = getSupabase()

if (send && isReadonly()) {
  console.log('✗ --send service key gerektirir (anon key salt-okunur). Yalnız önizleme yapılıyor.')
  process.exit(1)
}

// Skorları tazele (cron ucuyla aynı davranış); hata özeti engellemesin.
await maybeSync(supabase).catch(err => console.log('senkron uyarısı (devam):', err.message))

const result = await runNightlyNotify(supabase, {
  webhookUrl: process.env.DISCORD_WEBHOOK_URL,
  dry: !send || !process.env.DISCORD_WEBHOOK_URL,
})

if (send && !process.env.DISCORD_WEBHOOK_URL) {
  console.log('DISCORD_WEBHOOK_URL tanımsız — dry-run önizlemesi:')
}
console.log(`\nözet: ${result.pendingCount} gönderilecek maç · ${result.messageCount} mesaj · ${result.skippedNoPred} tahminsiz (sessiz flag)\n`)

for (const chunk of result.chunks) {
  console.log('─'.repeat(48))
  console.log(chunk)
}
console.log('─'.repeat(48))

if (!result.dry) {
  if (result.sent) console.log(`✓ gönderildi (${result.deliveredCount}/${result.pendingCount} maç flag'lendi)`)
  else console.log(`✗ gönderilemedi: ${result.error} — flag yazılmadı, yarın yeniden denenir`)
}
