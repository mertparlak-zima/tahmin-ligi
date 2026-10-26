// Senkronizasyon: ESPN'den çek (toplam fetch bütçesiyle) → filtrele → upsert
// → (tüm kaynaklar sağlamsa) korumalı temizlik. Cron/thread yok; /api/league
// istek geldiğinde veri bayatsa çalışır (eşik maç aktivitesinden türetilir).

import { fetchTrackedMatches, seasonYear } from './espn.js'
import { FINISHED_STATUSES, INACTIVE_STATUSES, isLive } from './status.js'
import { ACTIVE_LEAGUE_CODES, DEFAULT_LEAGUE, activeLeague } from './targets.js'

// Temizlik vanası: INACTIVE statülü satır kickoff'tan bu yana en az bu kadar
// gün geçmişse VE tahminsizse silinebilir (yalnız complete turlarında).
const INACTIVE_CLEANUP_MS = 30 * 24 * 3600_000
// P8 uyarlanabilir bayatlık eşikleri: canlı → SYNC_STALE_SECONDS (varsayılan
// 90 sn), ≤6 sa içinde kickoff → 600 sn, başka durumda 3600 sn.
const UPCOMING_WINDOW_MS = 6 * 3600_000
const UPCOMING_STALE_SECONDS = 600
const IDLE_STALE_SECONDS = 3600

const signature = m => [
  m.status,
  m.home_score ?? null,
  m.away_score ?? null,
  m.minute ?? null,
  Date.parse(m.kickoff),
  m.home_name,
  m.away_name,
].join('|')

function toRow(match, nowIso, prior) {
  return {
    provider: match.provider,
    external_id: match.externalId,
    competition: match.competitionCode,
    kickoff: match.kickoff,
    status: match.status,
    minute: match.minute,
    home_name: match.home.name,
    home_short: match.home.short,
    home_tla: match.home.tla,
    home_crest: match.home.crest,
    away_name: match.away.name,
    away_short: match.away.short,
    away_tla: match.away.tla,
    away_crest: match.away.crest,
    home_score: match.home.score,
    away_score: match.away.score,
    matchday: match.matchday,
    stage: match.stage,
    // Dondurulmuş flag'ler (P5): sezon/lig aidiyeti satır ilk yazıldığında
    // belirlenir ve sonradan asla değişmez (kickoff Temmuz ötesine kaysa bile
    // eski sezon aidiyeti korunur). prior'da değer varsa o kazanır; null ise
    // (R7 pencere hayaleti) kickoff'tan / varsayılan ligten türetilir.
    season_year: prior?.season_year ?? seasonYear(new Date(match.kickoff)),
    league: prior?.league ?? match.league ?? DEFAULT_LEAGUE,
    updated_at: nowIso,
  }
}

async function setSyncState(supabase, patch) {
  await supabase
    .from('sync_state')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', 1)
}

/**
 * Tek senkronizasyon turu. İdempotent: aynı veri tekrar yazılmaz.
 * Kaynakların bir kısmı hata verirse (complete=false) mevcut maçlar korunur.
 * opts.fetchDeadlineMs → fetch aşamasının toplam bütçesi (test enjeksiyonu;
 * varsayılan espn.js içinde 15 sn).
 * opts.now → sahte "şimdi" (test enjeksiyonu; sezon devri simülasyonu).
 * opts.league → bu turun senkronladığı lig (varsayılan: aktif lig).
 */
export async function syncNow(supabase, opts = {}) {
  const now = opts.now ?? new Date()
  const attemptIso = now.toISOString()
  await setSyncState(supabase, { last_attempt_at: attemptIso })

  // Lig enjeksiyonu: tur tek bir lig kapsamında çalışır; dönen maç nesneleri
  // kaynak ligi taşır → toRow league yazar. maybeSync tüm aktif ligleri bu
  // işlevi league=<kod> ile çağırarak paralel senkronlar (#21).
  const league = opts.league ?? activeLeague(now)
  const { matches, complete, errors } = await fetchTrackedMatches(now, {
    deadlineMs: opts.fetchDeadlineMs,
    league,
  })
  for (const match of matches) match.league = league
  const nowIso = now.toISOString()

  if (matches.length === 0) {
    const message = `Senkronizasyon kayıt döndürmedi${errors.length ? `: ${errors.join(' | ')}` : ''}`
    await setSyncState(supabase, { last_error: message.slice(0, 500) })
    throw new Error(message)
  }

  const { data: existing, error: selectError } = await supabase
    .from('matches')
    .select('id, provider, external_id, competition, status, minute, kickoff, home_score, away_score, home_name, away_name, season_year, league')
  if (selectError) throw new Error(`Mevcut maçlar okunamadı: ${selectError.message}`)

  const existingByKey = new Map(existing.map(m => [`${m.provider}:${m.external_id}`, m]))

  const rows = []
  for (const match of matches) {
    const key = `${match.provider}:${match.externalId}`
    const prior = existingByKey.get(key)
    if (prior) {
      // Statü kilidi: bitmiş maç asla geri alınmaz — FINISHED-dışı HER gelen
      // statü (ertelenme, iptal, gecikmiş "oynanmadı" yanıtı...) reddedilir.
      if (FINISHED_STATUSES.includes(prior.status) && !FINISHED_STATUSES.includes(match.status)) continue
      const nextRow = toRow(match, nowIso, prior)
      // Değişiklik yoksa dokunma. Dondurulmuş flag'ler (season_year/league)
      // imzaya DAHİL DEĞİL — yalnızca R7 onarım koşulunda okunur.
      const same =
        prior.status === nextRow.status &&
        (prior.home_score ?? null) === (nextRow.home_score ?? null) &&
        (prior.away_score ?? null) === (nextRow.away_score ?? null) &&
        (prior.minute ?? null) === (nextRow.minute ?? null) &&
        Date.parse(prior.kickoff) === Date.parse(nextRow.kickoff) &&
        prior.home_name === nextRow.home_name &&
        prior.away_name === nextRow.away_name
      // R7 onarımı: şema sonrası / kod öncesi pencerede oluşan hayalet satırın
      // flag'i null ise imza AYNI olsa bile yeniden yazılır → flag dolar ve
      // satır ilk turda sezon filtrelerine geri döner.
      if (same && prior.season_year != null && prior.league != null) continue
      rows.push(nextRow)
    } else {
      rows.push(toRow(match, nowIso, null))
    }
  }

  if (rows.length > 0) {
    const { error: upsertError } = await supabase
      .from('matches')
      .upsert(rows, { onConflict: 'provider,external_id' })
    if (upsertError) throw new Error(`Maçlar yazılamadı: ${upsertError.message}`)
  }

  // Yalnızca tüm kaynaklar sağlıksa temizlik yapılır (P1).
  if (complete) {
    const nowMs = now.getTime()
    const activeSeason = seasonYear(now)
    const keep = new Set(matches.map(m => `${m.provider}:${m.externalId}`))
    const missing = existing.filter(m => !keep.has(`${m.provider}:${m.external_id}`))

    // P5 kapsam: prune yalnız (bu turun ligi, aktif sezon) satırlarına uygulanır
    // — eski sezon / başka lig satırları yanıtta hiç olmasa bile DOKUNULMAZ
    // (sezon devrinde eski kayıtlar ve tahmin cascade'i böyle korunur).
    // season_year null hayaletler de kapsam dışıdır; onarım ilk turda doldurur.
    const scoped = missing.filter(m => m.league === league && m.season_year === activeSeason)

    // Prune adayları: yanıtta artık olmayan + kickoff'u GELECEKTE olan satırlar.
    const futureCandidates = scoped.filter(m => Date.parse(m.kickoff) > nowMs)
    // Temizlik vanası: INACTIVE statülü + kickoff'u 30+ gün geçmiş satırlar da
    // (tahminsizse) silinir — eski erteleme/artık kayıtları temizler.
    const valveCandidates = scoped.filter(m =>
      INACTIVE_STATUSES.includes(m.status) &&
      nowMs - Date.parse(m.kickoff) >= INACTIVE_CLEANUP_MS)

    // Tahminsizlik ölçümü: adayların tahminleri tek IN sorgusuyla çekilir;
    // tahminli satır asla silinmez (cascade kaybı önlenir).
    const candidateIds = [...new Set([...futureCandidates, ...valveCandidates].map(m => m.id))]
    const predicted = new Set()
    if (candidateIds.length > 0) {
      const { data: predRows, error: predError } = await supabase
        .from('predictions')
        .select('match_id')
        .in('match_id', candidateIds)
      if (predError) throw new Error(`Aday tahminleri okunamadı: ${predError.message}`)
      for (const row of predRows ?? []) predicted.add(row.match_id)
    }

    // Turnuva guard'ı: DB'de o turnuvada ≥4 silinebilir aday varken yanıt
    // (filtre sonrası) o turnuvadan ceil(aday/2)'den az döndürüyorsa kaynak
    // penceresi daralmış demektir → O TURNUVANIN prune'u atlanır; diğer
    // turnuvaların temizliği devam eder. DB<4 adayta guard devre dışı.
    const responseByComp = new Map()
    for (const match of matches) {
      responseByComp.set(match.competitionCode, (responseByComp.get(match.competitionCode) ?? 0) + 1)
    }
    const guardedComps = new Set()
    for (const comp of new Set(futureCandidates.map(m => m.competition))) {
      const candCount = futureCandidates.filter(m => m.competition === comp && !predicted.has(m.id)).length
      if (candCount >= 4 && (responseByComp.get(comp) ?? 0) < Math.ceil(candCount / 2)) {
        guardedComps.add(comp)
      }
    }

    const prunable = [
      ...futureCandidates.filter(m => !predicted.has(m.id) && !guardedComps.has(m.competition)),
      ...valveCandidates.filter(m => !predicted.has(m.id)),
    ]
    const deleteIds = prunable.map(m => m.id)
    if (deleteIds.length > 0) {
      const { error: deleteError } = await supabase.from('matches').delete().in('id', deleteIds)
      if (deleteError) throw new Error(`Eski maçlar silinemedi: ${deleteError.message}`)
    }
  }

  await setSyncState(supabase, {
    last_success_at: nowIso,
    last_error: errors.length ? errors.join(' | ').slice(0, 500) : null,
    matches_seen: matches.length,
  })

  return { ok: true, matchesSeen: matches.length, changed: rows.length, complete }
}

/** P8: bayatlık eşiği (sn) maç aktivitesinden türetilir.
 * Canlı maç varken canlı eşiği (SYNC_STALE_SECONDS, varsayılan 90 sn);
 * canlı yok ama ≤6 sa içinde kickoff'u olan maç varken 600 sn; başka
 * durumda 3600 sn. DB'de canlı statü göründükçe eşik düşük kalır → final
 * skoru kaçırılmaz (self-healing). */
export function staleThresholdSeconds(
  rows,
  liveStaleSeconds = Number(process.env.SYNC_STALE_SECONDS || 90),
  now = Date.now(),
) {
  if (rows.some(m => isLive(m.status))) return liveStaleSeconds
  const upcoming = rows.some(m => {
    const kickoff = Date.parse(m.kickoff)
    return Number.isFinite(kickoff) && kickoff > now && kickoff - now <= UPCOMING_WINDOW_MS
  })
  return upcoming ? UPCOMING_STALE_SECONDS : IDLE_STALE_SECONDS
}

/** Son başarılı senkronizasyon bayatsa bir tur çalıştır. Eşik (P8) maç
 * aktivitesinden türetilir: canlı 90 sn / yaklaşan 600 sn / boşta 3600 sn.
 * #21: TÜM aktif ligler (ACTIVE_LEAGUE_CODES) PARALEL senkronlanır; bir lig
 * hata verse bile diğerleri devam eder (hata loglanır, istek patlamaz).
 * Stampede koruması: paralel gelen ziyaretçiler aynı bayat pencerede tek
 * denemeyi paylaşır — son deneme (last_attempt_at) çok yeniden tekrar
 * ESPN çekimi yapılmaz (bkv. issue #16); pencere ligler arasında ortaktır.
 * sync_state küreseldir: matches_seen liglerin TOPLAMI, last_error lig bazlı
 * hata notlarının birleşimi (500 karakterte kesilir) ya da null. */
export async function maybeSync(
  supabase,
  liveStaleSeconds = Number(process.env.SYNC_STALE_SECONDS || 90),
  opts = {},
) {
  const [stateRes, matchesRes] = await Promise.all([
    supabase.from('sync_state').select('last_success_at, last_attempt_at').eq('id', 1).maybeSingle(),
    supabase.from('matches').select('status, kickoff'), // hafif aktivite okuması (~40 satır)
  ])
  const staleSeconds = staleThresholdSeconds(matchesRes.data ?? [], liveStaleSeconds)
  const now = Date.now()
  const last = stateRes.data?.last_success_at ? Date.parse(stateRes.data.last_success_at) : 0
  const lastAttempt = stateRes.data?.last_attempt_at ? Date.parse(stateRes.data.last_attempt_at) : 0
  const attemptWindowMs = Math.min(30, staleSeconds) * 1000
  if (now - last > staleSeconds * 1000 && now - lastAttempt > attemptWindowMs) {
    // Her lig kendi turunu çalıştırır; hatalar allSettled ile toplanır.
    const settled = await Promise.allSettled(
      ACTIVE_LEAGUE_CODES.map(code => syncNow(supabase, { ...opts, league: code })),
    )
    const errors = []
    let matchesSeen = 0
    for (let i = 0; i < settled.length; i += 1) {
      const result = settled[i]
      if (result.status === 'rejected') {
        // Senkronizasyon başarısızsa eski veriyle devam; hata payload'a taşınır.
        console.error(`sync failed (${ACTIVE_LEAGUE_CODES[i]}):`, result.reason?.message)
        errors.push(`${ACTIVE_LEAGUE_CODES[i]}: ${result.reason?.message}`)
      } else {
        matchesSeen += result.value.matchesSeen
        if (!result.value.complete) {
          errors.push(`${ACTIVE_LEAGUE_CODES[i]}: ${result.value.errors.join(' | ')}`)
        }
      }
    }
    // Küresel sync_state özeti: toplam görülen maç + birleşik hata notu.
    await setSyncState(supabase, {
      matches_seen: matchesSeen,
      last_error: errors.length > 0 ? errors.join(' | ').slice(0, 500) : null,
    })
  }
}
