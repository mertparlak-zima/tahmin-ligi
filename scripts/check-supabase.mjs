// Supabase bağlantı + şema + senkron doğrulaması.
// Kullanım: node --env-file=.env scripts/check-supabase.mjs
// Secret değerleri asla yazdırmaz.

import { getSupabase } from '../lib/supabase.js'
import { syncNow } from '../lib/sync.js'
import { buildLeaguePayload } from '../lib/league.js'

const supabase = getSupabase()

// 1) Tablolar var mı?
const tables = ['players', 'matches', 'predictions', 'app_config', 'sync_state']
for (const table of tables) {
  const { error } = await supabase.from(table).select('*').limit(1)
  if (error) {
    console.error(`✗ ${table}: ${error.message}`)
    process.exit(1)
  }
  console.log(`✓ ${table} erişilebilir`)
}

// 2) Şema satırları
const { data: scoring } = await supabase.from('app_config').select('value').eq('key', 'scoring').maybeSingle()
console.log(scoring ? `✓ scoring varsayılanı: ${JSON.stringify(scoring.value)}` : '✗ scoring satırı yok — schema.sql çalıştırıldı mı?')

// 3) İlk senkronizasyon (gerçek ESPN verisi)
const result = await syncNow(supabase)
console.log(`✓ senkron: ${result.matchesSeen} maç görüldü, ${result.changed} kayıt yazıldı, complete=${result.complete}`)

// 4) Payload özeti
const payload = await buildLeaguePayload(supabase)
console.log(`✓ payload: ${payload.meta.counts.matches} maç (biten ${payload.meta.counts.finished}) · ${payload.meta.counts.players} aktif oyuncu`)
const byComp = {}
for (const m of payload.matches) byComp[m.competitionCode] = (byComp[m.competitionCode] ?? 0) + 1
console.log(`  kupalar: ${JSON.stringify(byComp)}`)

console.log('Supabase hazır ✅')
