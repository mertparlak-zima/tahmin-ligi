// Maç durum taksonomisi ve yardımcıları.

export const LIVE_STATUSES = ['IN_PLAY', 'PAUSED', 'EXTRA_TIME', 'PENALTY_SHOOTOUT']
export const FINISHED_STATUSES = ['FINISHED', 'AWARDED']
export const INACTIVE_STATUSES = ['POSTPONED', 'CANCELLED', 'SUSPENDED']
export const UPSETTABLE_STATUSES = ['SCHEDULED', 'TIMED'] // tahmin giriiline açık

export function isLive(status) {
  return LIVE_STATUSES.includes(status)
}

export function isFinished(status) {
  return FINISHED_STATUSES.includes(status)
}

export function isInactive(status) {
  return INACTIVE_STATUSES.includes(status)
}

/** upcoming | live | finished | inactive */
export function statusGroup(status) {
  if (isLive(status)) return 'live'
  if (isFinished(status)) return 'finished'
  if (isInactive(status)) return 'inactive'
  return 'upcoming'
}

/**
 * Maç "başladı mı": kickoff geçti ya da durum canlı/bitti.
 * Tahmin mührünün açılması ve tahmin girişinin kilitlenmesi bu bilgiye bağlı.
 */
export function isStarted(status, kickoffUtc, now = Date.now()) {
  if (isLive(status) || isFinished(status)) return true
  if (!kickoffUtc) return false
  return Date.parse(kickoffUtc) <= now
}

/** Tahmin girişi kilitli mi: maç başladı ya da ertelendi/iptal edildi. */
export function isLocked(status, kickoffUtc, now = Date.now()) {
  return isInactive(status) || isStarted(status, kickoffUtc, now)
}
