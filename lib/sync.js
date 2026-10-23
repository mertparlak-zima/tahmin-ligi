// Senkronizasyon: ESPN'den çek → filtrele → upsert → (tüm kaynaklar sağlamsa) temizle.
// Cron/thread yok; /api/league istek geldiğinde veri bayatsa çalışır.

import { fetchTrackedMatches } from './espn.js'
import { FINISHED_STATUSES, UPSETTABLE_STATUSES } from './status.js'

const signature = m => [
  m.status,
  m.home_score ?? null,
  m.away_score ?? null,
  m.minute ?? null,
  Date.parse(m.kickoff),
  m.home_name,
  m.away_name,
].join('|')

function toRow(match, nowIso) {
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
 */
export async function syncNow(supabase) {
  const attemptIso = new Date().toISOString()
  await setSyncState(supabase, { last_attempt_at: attemptIso })

  const { matches, complete, errors } = await fetchTrackedMatches()
  const nowIso = new Date().toISOString()

  if (matches.length === 0) {
    const message = `Senkronizasyon kayıt döndürmedi${errors.length ? `: ${errors.join(' | ')}` : ''}`
    await setSyncState(supabase, { last_error: message.slice(0, 500) })
    throw new Error(message)
  }

  const { data: existing, error: selectError } = await supabase
    .from('matches')
    .select('id, provider, external_id, status, minute, kickoff, home_score, away_score, home_name, away_name')
  if (selectError) throw new Error(`Mevcut maçlar okunamadı: ${selectError.message}`)

  const existingByKey = new Map(existing.map(m => [`${m.provider}:${m.external_id}`, m]))

  const rows = []
  for (const match of matches) {
    const key = `${match.provider}:${match.externalId}`
    const prior = existingByKey.get(key)
    if (prior) {
      // Bitmiş maç asla geri alınmaz (gecikmiş sağlayıcı yanıtına karşı).
      if (FINISHED_STATUSES.includes(prior.status) && UPSETTABLE_STATUSES.includes(match.status)) continue
      // Değişiklik yoksa dokunma.
      const nextRow = toRow(match, nowIso)
      const same =
        prior.status === nextRow.status &&
        (prior.home_score ?? null) === (nextRow.home_score ?? null) &&
        (prior.away_score ?? null) === (nextRow.away_score ?? null) &&
        (prior.minute ?? null) === (nextRow.minute ?? null) &&
        Date.parse(prior.kickoff) === Date.parse(nextRow.kickoff) &&
        prior.home_name === nextRow.home_name &&
        prior.away_name === nextRow.away_name
      if (same) continue
    }
    rows.push(toRow(match, nowIso))
  }

  if (rows.length > 0) {
    const { error: upsertError } = await supabase
      .from('matches')
      .upsert(rows, { onConflict: 'provider,external_id' })
    if (upsertError) throw new Error(`Maçlar yazılamadı: ${upsertError.message}`)
  }

  // Yalnızca tüm kaynaklar sağlıklıysa takip dışı kayıtları temizle.
  if (complete) {
    const keep = new Set(matches.map(m => `${m.provider}:${m.externalId}`))
    const deleteIds = existing.filter(m => !keep.has(`${m.provider}:${m.external_id}`)).map(m => m.id)
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

/** Son başarılı senkronizasyon bayatsa (varsayılan 90 sn) bir tur çalıştır. */
export async function maybeSync(supabase, staleSeconds = Number(process.env.SYNC_STALE_SECONDS || 90)) {
  const { data: state } = await supabase
    .from('sync_state')
    .select('last_success_at')
    .eq('id', 1)
    .maybeSingle()
  const last = state?.last_success_at ? Date.parse(state.last_success_at) : 0
  if (Date.now() - last > staleSeconds * 1000) {
    try {
      await syncNow(supabase)
    } catch (err) {
      // Senkronizasyon başarısızsa eski veriyle devam; hata payload'a taşınır.
      console.error('sync failed:', err.message)
    }
  }
}
