// Tahmin yedeği: players + predictions + app_config → tarih damgalı JSON.
//
// Kullanım:
//   node --env-file=.env scripts/backup-db.mjs
//
// Kurallar:
// - Yalnızca okur; tek yazma işlemi sonundaki app_config `last_backup`
//   damgasıdır (yıkıcı işlem yok).
// - Çıktı: backups/tahmin-ligi-YYYYAAgg-HHmmss.json (dizin yoksa oluşturulur;
//   backups/ .gitignore'dadır, commit'e girmez).
// - Admin panelindeki "son yedek" damgası app_config.last_backup'tan okunur;
//   bu damgayı bu script yazar.
// - .env değerleri asla yazdırılmaz.

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { getSupabase } from '../lib/supabase.js'

const supabase = getSupabase()
const BACKUP_DIR = join(import.meta.dirname, '..', 'backups')

// PostgREST varsayılan satır limiti (1000) aşılırsa eksik yedek alınmasın:
// sayfalı okuma.
async function fetchAll(table, orders = []) {
  const rows = []
  const PAGE = 1000
  let from = 0
  for (;;) {
    let query = supabase.from(table).select('*')
    for (const column of orders) query = query.order(column)
    const { data, error } = await query.range(from, from + PAGE - 1)
    if (error) {
      console.error(`✗ ${table} okunamadı: ${error.message}`)
      process.exit(1)
    }
    rows.push(...data)
    if (data.length < PAGE) return rows
    from += PAGE
  }
}

const players = await fetchAll('players', ['name'])
const predictions = await fetchAll('predictions', ['player_id', 'match_id'])
const appConfig = await fetchAll('app_config', ['key'])

const now = new Date()
const pad = (n) => String(n).padStart(2, '0')
const fileName = `tahmin-ligi-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.json`
const generatedAt = now.toISOString()
const appConfigKeys = appConfig.map((row) => row.key).sort()

const backup = {
  meta: {
    generatedAt,
    playerCount: players.length,
    predictionCount: predictions.length,
    appConfigKeys,
  },
  players,
  predictions,
  appConfig,
}

mkdirSync(BACKUP_DIR, { recursive: true })
const filePath = join(BACKUP_DIR, fileName)
try {
  writeFileSync(filePath, JSON.stringify(backup, null, 2) + '\n', 'utf8')
} catch (err) {
  console.error(`✗ Yedek dosyası yazılamadı: ${filePath}\n  ${err.message}`)
  process.exit(1)
}

// Admin panelindeki "son yedek" damgasının kaynağı.
const { error: stampError } = await supabase
  .from('app_config')
  .upsert(
    { key: 'last_backup', value: { at: generatedAt, file: fileName, predictions: predictions.length } },
    { onConflict: 'key' }
  )
if (stampError) {
  console.error(`✗ app_config last_backup damgası yazılamadı: ${stampError.message}`)
  console.error(`  Yedek dosyası yine de alındı: ${filePath}`)
  process.exit(1)
}

console.log(`✓ oyuncular: ${players.length}`)
console.log(`✓ tahminler: ${predictions.length}`)
console.log(`✓ app_config: ${appConfig.length} anahtar (${appConfigKeys.join(', ')})`)
console.log(`Yedek alındı: ${filePath}`)
console.log('✓ app_config.last_backup damgası güncellendi')
