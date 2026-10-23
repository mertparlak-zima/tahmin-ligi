// ogünProje (SQLite) → Tahmin Ligi (Supabase) veri göçü.
//
// Kullanım:
//   node --env-file=.env scripts/migrate-from-ogunproje.mjs            # dry-run (varsayılan, yazmaz)
//   node --env-file=.env scripts/migrate-from-ogunproje.mjs --write    # gerçek yazım
//
// Kurallar:
// - Eski DB (OGUN_DB_PATH, varsayılan ../ogünProje/data/league.db) SALT OKUNUR açılır.
// - Yeni DB'ye MAÇ INSERT EDİLMEZ (maçlar ESPN senkronundan gelir); eski maç
//   yeni satırla eşleştirilemezse rapora UNMATCHED olarak düşer.
// - Eşleştirme: (1) provider='espn' + external_id, (2) fuzzy: aynı kupada
//   ±10 dk kickoff + takımlar (normalize edilmiş isim kümesi / token alt kümesi),
//   (3) fuzzy: aynı takip edilen Türk kulübü + ±10 dk kickoff.
// - Tahminler yalnız H/D/A olarak kopyalanır; joker ve bonus_points yeni şemada
//   yoktur, raporda ayrıca bildirilir.
// - Yazım idempotent: oyuncular lower(name) ile eşleşir, yoksa eklenir;
//   tahminler ON CONFLICT (player_id, match_id) DO NOTHING; app_config yalnız
//   değer farklıysa güncellenir.
// - .env değerleri asla yazdırılmaz.

import { DatabaseSync } from 'node:sqlite'
import { getSupabase } from '../lib/supabase.js'

const OLD_DB_DEFAULT = 'C:/Users/mertp/Desktop/projects/ogünProje/data/league.db'
const args = process.argv.slice(2)
const WRITE = args.includes('--write')
const DRY_RUN = !WRITE
const dbArg = args.find((a) => a.startsWith('--db='))
const OLD_DB = dbArg ? dbArg.slice(5) : OLD_DB_DEFAULT

const KICKOFF_TOLERANCE_MS = 10 * 60 * 1000 // ±10 dakika

// --- İsim normalizasyonu (fuzzy eşleştirme için) ---
const LEGAL_TOKENS = new Set([
  'fc', 'cf', 'ac', 'sc', 'afc', 'fk', 'sk', 'pfc', 'ck', 'cd', 'ks',
  'pae', 'club', 'de',
])
const TRACKED_CLUBS = ['galatasaray', 'fenerbahce', 'besiktas', 'trabzonspor']

function normName(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function nameTokens(s) {
  return normName(s).split(' ').filter((t) => t.length > 0 && !LEGAL_TOKENS.has(t))
}

// İki takım adı uyumlu mu? Eşit ya da token alt kümesi (FC/CF gibi ekler sonrası).
function teamCompat(a, b) {
  const na = normName(a)
  const nb = normName(b)
  if (!na || !nb) return false
  if (na === nb) return true
  const ta = new Set(nameTokens(a))
  const tb = new Set(nameTokens(b))
  if (ta.size === 0 || tb.size === 0) return false
  let aSubset = true
  for (const t of ta) if (!tb.has(t)) { aSubset = false; break }
  if (aSubset) return true
  let bSubset = true
  for (const t of tb) if (!ta.has(t)) { bSubset = false; break }
  return bSubset
}

// Maçtaki takip edilen Türk kulübü (ikisi de aynı değilse undefined).
function trackedClub(home, away) {
  const hits = TRACKED_CLUBS.filter((c) => normName(home).includes(c) || normName(away).includes(c))
  return hits.length === 1 ? hits[0] : undefined
}

function ts(s) {
  const ms = Date.parse(s)
  return Number.isNaN(ms) ? null : ms
}

function fmtKickoff(s) {
  const d = new Date(s)
  return d.toISOString().slice(0, 16).replace('T', ' ') + 'Z'
}

// ---------------------------------------------------------------------------
// 1) Eski DB'yi oku (salt okunur)
// ---------------------------------------------------------------------------
let old
try {
  old = new DatabaseSync(OLD_DB, { readOnly: true })
} catch (err) {
  console.error(`✗ Eski DB açılamadı: ${OLD_DB}\n  ${err.message}`)
  process.exit(1)
}

const oldPlayers = old.prepare('select * from players order by id').all()
const oldMatches = old.prepare('select * from matches order by kickoff_utc').all()
const oldPredictions = old.prepare('select * from predictions order by id').all()
const oldScoringRow = old.prepare("select value from settings where key = 'scoring'").get()
let oldScoring = null
try {
  oldScoring = oldScoringRow ? JSON.parse(oldScoringRow.value) : null
} catch {
  oldScoring = null
}
old.close()

// ---------------------------------------------------------------------------
// 2) Yeni DB'yi oku
// ---------------------------------------------------------------------------
const supabase = getSupabase()

const { data: newPlayers, error: pErr } = await supabase.from('players').select('*').order('name')
if (pErr) { console.error('✗ Supabase players okunamadı: ' + pErr.message); process.exit(1) }

const { data: newMatches, error: mErr } = await supabase.from('matches').select('*').order('kickoff')
if (mErr) { console.error('✗ Supabase matches okunamadı: ' + mErr.message); process.exit(1) }

const { data: newPredictions, error: prErr } = await supabase.from('predictions').select('player_id, match_id, outcome')
if (prErr) { console.error('✗ Supabase predictions okunamadı: ' + prErr.message); process.exit(1) }

const { data: cfgRow } = await supabase.from('app_config').select('value').eq('key', 'scoring').maybeSingle()
const newScoring = cfgRow ? cfgRow.value : null

// ---------------------------------------------------------------------------
// 3) Oyuncu eşleştirme: lower(name)
// ---------------------------------------------------------------------------
const playerPlan = []
const newPlayerByName = new Map(newPlayers.map((p) => [p.name.toLowerCase(), p]))
for (const op of oldPlayers) {
  const existing = newPlayerByName.get(op.name.toLowerCase())
  if (existing) {
    playerPlan.push({
      oldId: op.id,
      name: op.name,
      color: op.color,
      active: !!op.active,
      bonusPoints: op.bonus_points ?? 0,
      createdAt: op.created_at,
      action: 'map-existing',
      newId: existing.id,
      newColor: existing.color,
      newActive: existing.is_active,
    })
  } else {
    playerPlan.push({
      oldId: op.id,
      name: op.name,
      color: op.color,
      active: !!op.active,
      bonusPoints: op.bonus_points ?? 0,
      createdAt: op.created_at,
      action: 'insert',
      newId: null,
    })
  }
}

// ---------------------------------------------------------------------------
// 4) Maç eşleştirme
// ---------------------------------------------------------------------------
const matchPlan = [] // { old, new, method, deltaMin }
const claimedNew = new Set() // yeni maç id'leri
const unmatchedOld = []
const ambiguous = []

// 4a) external_id ile (espn)
const newByExt = new Map(newMatches.filter((m) => m.provider === 'espn').map((m) => [m.external_id, m]))
const pendingFuzzy = []
for (const om of oldMatches) {
  if (om.provider === 'espn') {
    const nm = newByExt.get(om.external_id)
    if (nm) {
      matchPlan.push({ old: om, new: nm, method: 'external-id', deltaMin: deltaMinutes(om.kickoff_utc, nm.kickoff) })
      claimedNew.add(nm.id)
    } else {
      unmatchedOld.push({ old: om, reason: 'espn external_id yeni DBde yok' })
    }
  } else {
    pendingFuzzy.push(om)
  }
}

function deltaMinutes(a, b) {
  const ta = ts(a)
  const tb = ts(b)
  if (ta === null || tb === null) return null
  return Math.round((tb - ta) / 60000)
}

// 4b) fuzzy (football-data CL): aynı kupa + ±10 dk + takım uyumu (küme / alt küme)
for (const om of pendingFuzzy) {
  const omTs = ts(om.kickoff_utc)
  const candidates = newMatches.filter((nm) => {
    if (claimedNew.has(nm.id)) return false
    if (nm.competition !== om.competition_code) return false
    const nmTs = ts(nm.kickoff)
    if (omTs === null || nmTs === null) return false
    return Math.abs(nmTs - omTs) <= KICKOFF_TOLERANCE_MS
  })
  const teamCandidates = candidates.filter(
    (nm) =>
      (teamCompat(om.home_name, nm.home_name) && teamCompat(om.away_name, nm.away_name)) ||
      (teamCompat(om.home_name, nm.away_name) && teamCompat(om.away_name, nm.home_name)),
  )
  if (teamCandidates.length === 1) {
    const nm = teamCandidates[0]
    matchPlan.push({ old: om, new: nm, method: 'fuzzy-teams', deltaMin: deltaMinutes(om.kickoff_utc, nm.kickoff) })
    claimedNew.add(nm.id)
    continue
  }
  if (teamCandidates.length > 1) {
    ambiguous.push({ old: om, reason: `${teamCandidates.length} aday (takım uyumu)` })
    continue
  }
  // 4c) fallback: aynı takip edilen Türk kulübü
  const oc = trackedClub(om.home_name, om.away_name)
  if (oc) {
    const clubCandidates = candidates.filter((nm) => trackedClub(nm.home_name, nm.away_name) === oc)
    if (clubCandidates.length === 1) {
      const nm = clubCandidates[0]
      matchPlan.push({ old: om, new: nm, method: 'fuzzy-tracked-club', deltaMin: deltaMinutes(om.kickoff_utc, nm.kickoff) })
      claimedNew.add(nm.id)
      continue
    }
    if (clubCandidates.length > 1) {
      ambiguous.push({ old: om, reason: `${clubCandidates.length} aday (kulüp ${oc})` })
      continue
    }
  }
  unmatchedOld.push({ old: om, reason: candidates.length === 0 ? '±10 dk içinde aynı kupada aday yok' : 'takım/kulüp uyumu yok' })
}

const unmatchedNew = newMatches.filter((nm) => !claimedNew.has(nm.id))

// ---------------------------------------------------------------------------
// 5) Tahmin eşleştirme
//    (insert planlanan oyuncular için uuid yazım anında çözülür; burada placeholder)
// ---------------------------------------------------------------------------
const oldMatchToNew = new Map(matchPlan.map((mp) => [mp.old.id, mp.new.id]))
const resolvablePlayers = new Set(playerPlan.map((pp) => pp.oldId)) // map-existing veya insert
const oldPlayerToNew = new Map(playerPlan.filter((pp) => pp.action === 'map-existing').map((pp) => [pp.oldId, pp.newId]))

const predRows = []
const skippedPreds = { noPlayer: [], noMatch: [] }
const perPlayerPreds = new Map()
for (const op of oldPredictions) {
  if (!resolvablePlayers.has(op.player_id)) {
    skippedPreds.noPlayer.push(op)
    continue
  }
  const newMatchId = oldMatchToNew.get(op.match_id)
  if (!newMatchId) {
    skippedPreds.noMatch.push(op)
    continue
  }
  const newPlayerId = oldPlayerToNew.get(op.player_id) ?? `pending:${op.player_id}`
  predRows.push({
    player_id: newPlayerId,
    match_id: newMatchId,
    outcome: op.outcome,
    created_at: op.created_at,
    updated_at: op.updated_at,
  })
  perPlayerPreds.set(op.player_id, (perPlayerPreds.get(op.player_id) ?? 0) + 1)
}

// Halihazırda yeni DBde var olan (player_id, match_id) çiftleri: yazım bunları atlar.
// (placeholder'lı satırlar her zaman "yeni" sayılır — çözüm yazım anında.)
const existingPairs = new Set(newPredictions.map((p) => `${p.player_id}|${p.match_id}`))
const alreadyPresent = predRows.filter((r) => !String(r.player_id).startsWith('pending:') && existingPairs.has(`${r.player_id}|${r.match_id}`))
const toInsert = predRows.filter((r) => !alreadyPresent.includes(r))

// ---------------------------------------------------------------------------
// 6) Scoring karşılaştırması
// ---------------------------------------------------------------------------
const plannedScoring = oldScoring
  ? {
      label: oldScoring.label,
      status: oldScoring.status,
      correctOutcome: oldScoring.correct_outcome ?? 1,
    }
  : null
const scoringNeedsUpdate =
  plannedScoring !== null &&
  (newScoring === null ||
    newScoring.label !== plannedScoring.label ||
    newScoring.status !== plannedScoring.status ||
    Number(newScoring.correctOutcome) !== Number(plannedScoring.correctOutcome))

// ---------------------------------------------------------------------------
// RAPOR
// ---------------------------------------------------------------------------
const line = '='.repeat(72)
console.log(line)
console.log(`ogünProje → Tahmin Ligi göç raporu  —  mod: ${WRITE ? 'WRITE (gerçek yazım)' : 'DRY-RUN (yazma yok)'}`)
console.log(`Eski DB: ${OLD_DB}`)
console.log(line)

// Eski sayılar
console.log('\n[1] ESKİ DB SAYIMLARI')
const activeCount = oldPlayers.filter((p) => p.active).length
console.log(`  Oyuncular: ${oldPlayers.length} (aktif ${activeCount}, pasif ${oldPlayers.length - activeCount})`)
console.log(`  Tahminler: ${oldPredictions.length}`)
const jokerTotal = oldPredictions.reduce((s, p) => s + (p.joker ? 1 : 0), 0)
console.log(`  Joker işaretli tahmin: ${jokerTotal}`)
const byProv = {}
for (const m of oldMatches) {
  const k = `${m.provider}/${m.competition_code}`
  byProv[k] = (byProv[k] ?? 0) + 1
}
console.log(`  Maçlar: ${oldMatches.length}  ${JSON.stringify(byProv)}`)

// Oyuncu tablosu
console.log('\n[2] OYUNCULAR (eski → yeni planı)')
for (const pp of playerPlan) {
  const jokerN = oldPredictions.filter((p) => p.player_id === pp.oldId && p.joker).length
  const preds = perPlayerPreds.get(pp.oldId) ?? 0
  if (pp.action === 'map-existing') {
    console.log(`  • ${pp.name}  (#${pp.oldId}) → MEVCUT "${pp.newId}" ile eşleşti (renk ${pp.newColor}, aktif=${pp.newActive} dokunulmadı)`)
  } else {
    console.log(`  • ${pp.name}  (#${pp.oldId}) → EKLENECEK  renk=${pp.color} aktif=${pp.active} bonus_points=${pp.bonusPoints} jokerTahmin=${jokerN} tahmin=${preds}`)
  }
  if (pp.bonusPoints > 0)
    console.log(`    ⚠ bonus_points=${pp.bonusPoints}: yeni şemada bonus_points kolonu YOK — bu puan taşınmaz (rapor notu).`)
}

// Maç eşleşme
console.log('\n[3] MAÇ EŞLEŞTİRME')
const byExt = matchPlan.filter((m) => m.method === 'external-id')
const byTeams = matchPlan.filter((m) => m.method === 'fuzzy-teams')
const byClub = matchPlan.filter((m) => m.method === 'fuzzy-tracked-club')
console.log(`  external-id ile eşleşen: ${byExt.length}`)
console.log(`  fuzzy (takım kümesi) ile eşleşen: ${byTeams.length}`)
for (const mp of byTeams)
  console.log(`    old ${mp.old.provider}/${mp.old.external_id} ${mp.old.home_name} - ${mp.old.away_name}  →  new espn/${mp.new.external_id} ${mp.new.home_name} - ${mp.new.away_name}  (Δ${mp.deltaMin}dk)`)
console.log(`  fuzzy (Türk kulübü) ile eşleşen: ${byClub.length}`)
for (const mp of byClub)
  console.log(`    old ${mp.old.provider}/${mp.old.external_id} ${mp.old.home_name} - ${mp.old.away_name}  →  new espn/${mp.new.external_id} ${mp.new.home_name} - ${mp.new.away_name}  (Δ${mp.deltaMin}dk)`)
console.log(`  EŞLEŞEMEYEN eski maç: ${unmatchedOld.length}`)
for (const u of unmatchedOld)
  console.log(`    ✗ old ${u.old.provider}/${u.old.external_id} ${u.old.home_name} - ${u.old.away_name} (${fmtKickoff(u.old.kickoff_utc)}, ${u.old.competition_code}) — ${u.reason}`)
console.log(`  BELİRSİZ (çok adaylı): ${ambiguous.length}`)
for (const a of ambiguous)
  console.log(`    ? old ${a.old.provider}/${a.old.external_id} ${a.old.home_name} - ${a.old.away_name} — ${a.reason}`)
console.log(`  Eski veriye kavuşmamış YENİ maç: ${unmatchedNew.length}`)
for (const nm of unmatchedNew)
  console.log(`    · new espn/${nm.external_id} ${nm.home_name} - ${nm.away_name} (${fmtKickoff(nm.kickoff)}, ${nm.competition}, ${nm.status})`)

// Tahmin eşleşme
console.log('\n[4] TAHMİN EŞLEŞTİRME')
console.log(`  Toplam eski tahmin: ${oldPredictions.length}`)
console.log(`  Eşlenen maça düşen: ${predRows.length}`)
console.log(`  Atlanacak (eski oyuncu yeni DBde eşleşemedi): ${skippedPreds.noPlayer.length}`)
console.log(`  Atlanacak (eski maç eşleşemedi): ${skippedPreds.noMatch.length}`)
if (skippedPreds.noMatch.length > 0) {
  const byPm = new Map()
  for (const p of skippedPreds.noMatch) byPm.set(p.match_id, (byPm.get(p.match_id) ?? 0) + 1)
  for (const [mid, n] of byPm) {
    const om = oldMatches.find((m) => m.id === mid)
    console.log(`    · ${om.home_name} - ${om.away_name} (${om.external_id}): ${n} tahmin taşınmaz`)
  }
}
console.log(`  Yeni DBde halihazırda var olan (dokunulmaz): ${alreadyPresent.length}`)
console.log(`  Yazılacak yeni satır: ${toInsert.length}`)
console.log('  Oyuncu bazlı aktarım:')
for (const pp of playerPlan) {
  const total = oldPredictions.filter((p) => p.player_id === pp.oldId).length
  const mapped = perPlayerPreds.get(pp.oldId) ?? 0
  console.log(`    ${pp.name.padEnd(14)} ${mapped}/${total} tahmin eşlendi`)
}

// Scoring
console.log('\n[5] SCORING CONFIG (app_config.key="scoring")')
if (plannedScoring) {
  console.log(`  Eski (eşlenmiş): ${JSON.stringify(plannedScoring)}`)
  console.log(`  Yeni (şu an)   : ${newScoring === null ? '(yok)' : JSON.stringify(newScoring)}`)
  if (oldScoring && (oldScoring.exact_score !== undefined || oldScoring.goal_difference_bonus !== undefined || oldScoring.joker_multiplier !== undefined)) {
    console.log(`  Not: eski configdeki exact_score=${oldScoring.exact_score}, goal_difference_bonus=${oldScoring.goal_difference_bonus}, joker_multiplier=${oldScoring.joker_multiplier} yeni oyunda karşılıksız — taşınmaz.`)
  }
  console.log(scoringNeedsUpdate ? '  → PLAN: app_config scoring GÜNCELLENECEK.' : '  → PLAN: değişiklik gerekmiyor (değerler zaten aynı), yazılmaz.')
} else {
  console.log('  Eski DBde scoring satırı yok — dokunulmaz.')
}

// Yazım planı özeti
const insertPlayers = playerPlan.filter((pp) => pp.action === 'insert')
console.log('\n[6] YAZIM PLANI')
console.log(`  players eklenecek: ${insertPlayers.length} (${insertPlayers.map((p) => p.name).join(', ') || '-'})`)
console.log(`  players güncellenecek: 0 (mevcut oyunculara dokunulmaz)`)
console.log(`  matches eklenecek: 0 (yasak — maçlar ESPN senkronundan)`)
console.log(`  predictions eklenecek: ${toInsert.length} (upsert, çakışan varsa DO NOTHING)`)
console.log(`  app_config scoring: ${scoringNeedsUpdate ? 'UPDATE' : 'değişiklik yok'}`)

// ---------------------------------------------------------------------------
// 7) --write
// ---------------------------------------------------------------------------
if (DRY_RUN) {
  console.log('\n' + line)
  console.log('DRY-RUN tamamlandı — hiçbir şey yazılmadı. Gerçek yazım için: --write')
  console.log(line)
  process.exit(0)
}

if (ambiguous.length > 0) {
  console.error('\n✗ Belirsiz (çok adaylı) eşleşme var — yazım durduruldu. DRY-RUN çıktısını inceleyin.')
  process.exit(1)
}

console.log('\n' + line)
console.log('WRITE modu başlıyor…')

// 7a) players
const playerIdByOldId = new Map()
for (const pp of playerPlan) {
  if (pp.action === 'map-existing') {
    playerIdByOldId.set(pp.oldId, pp.newId)
  }
}
if (insertPlayers.length > 0) {
  const rows = insertPlayers.map((pp) => ({
    name: pp.name,
    color: pp.color,
    is_active: pp.active,
    created_at: pp.createdAt,
  }))
  const { data: inserted, error } = await supabase.from('players').insert(rows).select()
  if (error) { console.error('✗ players insert hatası: ' + error.message); process.exit(1) }
  for (const ins of inserted ?? []) {
    const pp = insertPlayers.find((p) => p.name.toLowerCase() === ins.name.toLowerCase())
    if (pp) playerIdByOldId.set(pp.oldId, ins.id)
  }
  console.log(`✓ players: ${inserted?.length ?? 0} satır eklendi`)
}

// Placeholder uuid'leri (pending:<oldId>) gerçek uuid'lerle çöz.
let resolvedPredRows = predRows.map((r) => ({
  ...r,
  player_id: String(r.player_id).startsWith('pending:')
    ? playerIdByOldId.get(Number(String(r.player_id).slice(8)))
    : r.player_id,
}))
const unresolved = resolvedPredRows.filter((r) => !r.player_id)
if (unresolved.length > 0) { console.error(`✗ ${unresolved.length} tahmin için oyuncu uuid'si çözülemedi`); process.exit(1) }

// 7b) predictions (idempotent upsert; DO NOTHING çakışan mevcut satırları korur)
if (toInsert.length > 0) {
  const { data: insPreds, error } = await supabase
    .from('predictions')
    .upsert(resolvedPredRows, { onConflict: 'player_id,match_id', ignoreDuplicates: true })
    .select()
  if (error) { console.error('✗ predictions upsert hatası: ' + error.message); process.exit(1) }
  console.log(`✓ predictions: ${insPreds?.length ?? 0} satır eklendi (mevcut olanlara dokunulmadı)`)
} else {
  console.log('✓ predictions: eklenecek satır yok')
}

// 7c) app_config scoring
if (scoringNeedsUpdate && plannedScoring) {
  const { error } = await supabase.from('app_config').upsert({ key: 'scoring', value: plannedScoring }, { onConflict: 'key' })
  if (error) { console.error('✗ app_config upsert hatası: ' + error.message); process.exit(1) }
  console.log(`✓ app_config scoring güncellendi: ${JSON.stringify(plannedScoring)}`)
} else {
  console.log('✓ app_config scoring: değişiklik gerekmedi')
}

// 7d) Doğrulama + mini puan durumu
console.log('\nDOĞRULAMA (yeni DB yeniden sayılıyor)')
const { data: vPlayers } = await supabase.from('players').select('*').order('name')
const { count: vPredCount } = await supabase.from('predictions').select('*', { count: 'exact', head: true })
const { data: vMatches } = await supabase.from('matches').select('*').order('kickoff')
const { data: vScoring } = await supabase.from('app_config').select('value').eq('key', 'scoring').maybeSingle()
const { data: vPreds, error: vErr } = await supabase.from('predictions').select('player_id, match_id, outcome, players(name, is_active), matches(home_score, away_score, status)')
if (vErr) { console.error('✗ doğrulama sorgusu hatası: ' + vErr.message); process.exit(1) }

console.log(`  players toplam: ${vPlayers.length} (aktif ${vPlayers.filter((p) => p.is_active).length})`)
console.log(`  predictions toplam: ${vPredCount}`)
console.log(`  matches toplam: ${vMatches.length}`)
console.log(`  scoring: ${JSON.stringify(vScoring?.value ?? null)}`)

const correctOutcomePts = Number(vScoring?.value?.correctOutcome ?? 1)
const standings = new Map()
for (const p of vPlayers) standings.set(p.id, { name: p.name, active: p.is_active, preds: 0, correct: 0, points: 0 })
for (const pr of vPreds ?? []) {
  const s = standings.get(pr.player_id)
  const m = pr.matches
  if (!s || !m) continue
  s.preds += 1
  if (m.status === 'FINISHED' && m.home_score != null && m.away_score != null) {
    const actual = m.home_score > m.away_score ? 'H' : m.away_score > m.home_score ? 'A' : 'D'
    if (actual === pr.outcome) {
      s.correct += 1
      s.points += correctOutcomePts
    }
  }
}
const rows = [...standings.values()].sort((a, b) => b.points - a.points || b.correct - a.correct || a.name.localeCompare(b.name, 'tr'))
console.log('\n  MİNİ PUAN DURUMU (doğrulama amaçlı, biten maçlar üzerinden):')
console.log('  ' + 'Oyuncu'.padEnd(16) + 'Puan'.padStart(5) + 'Doğru'.padStart(7) + 'Tahmin'.padStart(8) + '  Aktif')
for (const r of rows)
  console.log('  ' + r.name.padEnd(16) + String(r.points).padStart(5) + String(r.correct).padStart(7) + String(r.preds).padStart(8) + '  ' + (r.active ? 'evet' : 'hayır'))

const importedPlayerIds = new Set(playerIdByOldId.values())
const importedPreds = (vPreds ?? []).filter((pr) => importedPlayerIds.has(pr.player_id))
console.log(`\n  Göç kaynaklı tahmin (beklenen ${predRows.length} + önceki yazımlar): ${importedPreds.length}`)
const missing = resolvedPredRows.filter((r) => !importedPreds.some((ip) => ip.player_id === r.player_id && ip.match_id === r.match_id && ip.outcome === r.outcome))
console.log(missing.length === 0 ? '  ✓ Tüm planlanan tahminler yeni DBde mevcut.' : `  ✗ ${missing.length} tahmin yeni DBde bulunamadı!`)

console.log('\n' + line)
console.log('WRITE tamamlandı.')
console.log(line)
if (missing.length > 0) process.exit(1)
