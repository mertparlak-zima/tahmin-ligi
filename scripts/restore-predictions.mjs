// Yedek JSON'unu (backup-db.mjs çıktısı) geri yükler: players + predictions +
// app_config idempotent upsert. Silme YOKTUR; DB'de olup yedekte olmayan
// satırlar aynen kalır.
//
// Kullanım:
//   node --env-file=.env scripts/restore-predictions.mjs backups/<dosya>.json --dry  # plan (yazmaz)
//   node --env-file=.env scripts/restore-predictions.mjs backups/<dosya>.json        # gerçek yazım
//
// Kurallar:
// - Upsert anahtarları: players(id), predictions(player_id,match_id),
//   app_config(key). Yazım öncesi onay istenmez (bilinçli çalıştırma).
// - --dry: mevcut DB'den farklı olan kayıt sayısını tablo bazında listeler
//   (predictions karşılaştırması outcome + updated_at farkına bakar).
// - Tahminin geri yüklenebilmesi için bağlı olduğu maçın DB'de mevcut olması
//   gerekir (maçlar ESPN senkronundan gelir; yedeğe alınmaz).
// - .env değerleri asla yazdırılmaz.

import { readFileSync } from 'node:fs'
import { getSupabase } from '../lib/supabase.js'

const args = process.argv.slice(2)
const DRY = args.includes('--dry')
const fileArg = args.find((a) => !a.startsWith('--'))

if (!fileArg) {
  console.error('Kullanım: node --env-file=.env scripts/restore-predictions.mjs backups/<dosya>.json [--dry]')
  console.error('  --dry : hiçbir şey yazmadan neyin yazılacağını sayar')
  process.exit(1)
}

// --- 1) Yedek dosyasını oku + doğrula ---
let raw
try {
  raw = readFileSync(fileArg, 'utf8')
} catch (err) {
  console.error(`✗ Yedek dosyası okunamadı: ${fileArg}\n  ${err.message}`)
  process.exit(1)
}

let backup
try {
  backup = JSON.parse(raw)
} catch (err) {
  console.error(`✗ Yedek dosyası geçerli JSON değil: ${fileArg}\n  ${err.message}`)
  process.exit(1)
}

for (const key of ['players', 'predictions', 'appConfig']) {
  if (!backup || !Array.isArray(backup[key])) {
    console.error(`✗ Yedek dosyasında "${key}" verisi eksik veya bozuk — backup-db.mjs çıktısı mı? (${fileArg})`)
    process.exit(1)
  }
}

const badPrediction = backup.predictions.find((p) => !p.player_id || !p.match_id || !p.outcome)
if (badPrediction) {
  console.error('✗ Yedekte eksik alanlı tahmin satırı var (player_id / match_id / outcome).')
  process.exit(1)
}
if (backup.players.some((p) => !p.id)) {
  console.error('✗ Yedekte id alanı olmayan oyuncu satırı var.')
  process.exit(1)
}
if (backup.appConfig.some((c) => !c.key || c.value === undefined)) {
  console.error('✗ Yedekte key/value alanı olmayan app_config satırı var.')
  process.exit(1)
}

// --- 2) Mevcut DB'yi oku ---
const supabase = getSupabase()

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

const dbPlayers = await fetchAll('players')
const dbPredictions = await fetchAll('predictions', ['player_id', 'match_id'])
const dbConfig = await fetchAll('app_config', ['key'])

// --- 3) Fark hesabı (yazılacak = yedekte olup DB'de olmayan veya farklı olan) ---
// Anahtar sırasından bağımsız birebir satır karşılaştırması.
const canon = (row) => JSON.stringify(row, Object.keys(row).sort())

const dbPlayerById = new Map(dbPlayers.map((p) => [p.id, p]))
const playersToWrite = backup.players.filter((p) => {
  const current = dbPlayerById.get(p.id)
  return !current || canon(current) !== canon(p)
})
const playersNew = backup.players.filter((p) => !dbPlayerById.has(p.id)).length

const predKey = (p) => `${p.player_id}|${p.match_id}`
const dbPredByKey = new Map(dbPredictions.map((p) => [predKey(p), p]))
const predictionsToWrite = backup.predictions.filter((p) => {
  const current = dbPredByKey.get(predKey(p))
  return !current || current.outcome !== p.outcome || current.updated_at !== p.updated_at
})
const predictionsNew = backup.predictions.filter((p) => !dbPredByKey.has(predKey(p))).length

const dbCfgByKey = new Map(dbConfig.map((c) => [c.key, c]))
const configToWrite = backup.appConfig.filter((c) => {
  const current = dbCfgByKey.get(c.key)
  return !current || JSON.stringify(current.value) !== JSON.stringify(c.value)
})
const configNew = backup.appConfig.filter((c) => !dbCfgByKey.has(c.key)).length

const plan = (total, isNew) =>
  total === 0 ? 'değişiklik yok' : `yazılacak ${total} (yeni ${isNew}, değişen ${total - isNew})`

console.log(`Yedek: ${fileArg}`)
console.log(`  oluşturma: ${backup.meta?.generatedAt ?? '(meta yok)'}`)
console.log(`  players     : ${plan(playersToWrite.length, playersNew)}`)
console.log(`  predictions : ${plan(predictionsToWrite.length, predictionsNew)}`)
console.log(`  app_config  : ${plan(configToWrite.length, configNew)}`)
console.log('  Not: DB\'de olup yedekte olmayan satırlar silinmez, dokunulmaz.')

if (DRY) {
  console.log('DRY-RUN tamamlandı — hiçbir şey yazılmadı. Gerçek yazım için --dry olmadan çalıştırın.')
  process.exit(0)
}

// --- 4) Yazım (idempotent upsert; büyük tabloları parçalara bölerek) ---
async function upsertAll(table, rows, onConflict) {
  const CHUNK = 500
  let written = 0
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK)
    const { error } = await supabase.from(table).upsert(chunk, { onConflict })
    if (error) {
      console.error(`✗ ${table} upsert hatası: ${error.message}`)
      if (table === 'predictions') {
        console.error("  Not: tahminin bağlı olduğu maç DB'de yoksa geri yüklenemez (maçlar ESPN senkronundan gelir).")
      }
      process.exit(1)
    }
    written += chunk.length
  }
  return written
}

// Sıra önemli: predictions, players'a FK ile bağlıdır.
const playerCount = await upsertAll('players', playersToWrite, 'id')
const predictionCount = await upsertAll('predictions', predictionsToWrite, 'player_id,match_id')
const configCount = await upsertAll('app_config', configToWrite, 'key')

console.log(`✓ players: ${playerCount} satır yazıldı (upsert, anahtar id)`)
console.log(`✓ predictions: ${predictionCount} satır yazıldı (upsert, anahtar player_id,match_id)`)
console.log(`✓ app_config: ${configCount} satır yazıldı (upsert, anahtar key)`)
console.log('Geri yükleme tamamlandı.')
