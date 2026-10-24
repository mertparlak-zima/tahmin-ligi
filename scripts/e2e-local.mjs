// Gerçek DB üzerinde uçtan uca admin akışı testi.
// Şifre .env'den okunur; asla yazdırılmaz.
// Kullanım: node --env-file=.env scripts/e2e-local.mjs

const BASE = 'http://localhost:8787'
const PASSWORD = process.env.ADMIN_PASSWORD

const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok })
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
}

async function api(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'content-type': 'application/json' }
  if (auth) headers.authorization = `Bearer ${PASSWORD}`
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({}))
  return { status: res.status, json }
}

// 1) Public lig verisi
const league1 = await api('/api/league', { auth: false })
check('public /api/league 200', league1.status === 200, `${league1.json?.meta?.counts?.matches} maç`)

// 2) Yanlış şifre → 401
const bad = await fetch(`${BASE}/api/admin/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ password: 'kesinlikle-yanlis' }),
})
check('yanlış şifre 401', bad.status === 401)

// 3) Doğru şifre → ok
const login = await api('/api/admin/login', { method: 'POST', body: { password: PASSWORD } })
check('doğru şifre giriş', login.status === 200 && login.json.ok === true)

// 4) Bootstrap
const boot = await api('/api/admin/bootstrap')
const openMatches = (boot.json?.matches ?? []).filter(m => !m.locked)
check('bootstrap', boot.status === 200, `${boot.json?.matches?.length} maç, ${openMatches.length} tahmine açık`)

// 5) Oyuncu ekle (her çalıştırmada benzersiz isim)
const testName = `Test Oyuncu ${Date.now() % 100000}`
const player = await api('/api/admin/players', {
  method: 'POST',
  body: { name: testName, color: '#c792ea' },
})
check('oyuncu ekleme 201', player.status === 201, player.json?.player?.name ?? player.json?.error)
const playerId = player.json?.player?.id

// 6) Açık maça tahmin gir (ilk 2 maç: H ve D)
const picks = openMatches.slice(0, 2).map((m, i) => ({ matchId: m.id, outcome: i === 0 ? 'H' : 'D' }))
const save = await api('/api/admin/predictions', {
  method: 'PUT',
  body: { playerId, items: picks },
})
check('tahmin kaydı', save.status === 200, `saved=${save.json?.saved}`)

// 7) Mühür: girilen tahmin public payload'da sonucu SIZMAMALI
const league2 = await api('/api/league', { auth: false })
const sealedMatch = league2.json?.matches?.find(m => m.id === picks[0]?.matchId)
const sealedOk =
  sealedMatch &&
  sealedMatch.predictionsVisible === false &&
  sealedMatch.predictionCount >= 1 &&
  sealedMatch.predictions.every(p => !('outcome' in p))
check('tahmin mührü', Boolean(sealedOk), `visible=${sealedMatch?.predictionsVisible}, count=${sealedMatch?.predictionCount}`)

// 8) Kilitli maça yazma → 409
const lockedMatch = (boot.json?.matches ?? []).find(m => m.locked)
if (lockedMatch) {
  const locked = await api('/api/admin/predictions', {
    method: 'PUT',
    body: { playerId, items: [{ matchId: lockedMatch.id, outcome: 'A' }] },
  })
  check('kilitli maç 409', locked.status === 409, locked.json?.error)
} else {
  check('kilitli maç 409', false, 'kilitli maç bulunamadı')
}

// 9) Aynı isim farklı yazımla → benzersizlik 400
const dup = await api('/api/admin/players', {
  method: 'POST',
  body: { name: testName.toLocaleLowerCase('tr'), color: '#ffffff' },
})
check('benzersiz isim 400', dup.status === 400, dup.json?.error)

// 10) Tahmin silme (outcome='')
const del = await api('/api/admin/predictions', {
  method: 'PUT',
  body: { playerId, items: [{ matchId: picks[1].matchId, outcome: '' }] },
})
check('tahmin silme', del.status === 200, `deleted=${del.json?.deleted}`)

// 11) Puanlama ucu KALDIRILDI (#20 U6): kural DB'den yönetilir — uç artık 404.
const scoringGone = await api('/api/admin/scoring', {
  method: 'PUT',
  body: { correctOutcome: 1 },
})
check('puanlama ucu kapalı (404)', scoringGone.status === 404, `status=${scoringGone.status}`)

// 12) Test oyuncusunu GERÇEKTEN sil (#6 izolasyon — pasife değil, silme)
//    Önce kalan tahmini temizle (picks[0]'a girilen H hâlâ duruyor), sonra sil.
const delPreds = await api('/api/admin/predictions', {
  method: 'PUT',
  body: { playerId, items: [{ matchId: picks[0].matchId, outcome: '' }] },
})
check('test tahminleri temizlendi', delPreds.status === 200, `status=${delPreds.status}`)

const cleanup = await api('/api/admin/players', {
  method: 'DELETE',
  body: { id: playerId },
})
check('test oyuncusu silindi (#6)', cleanup.status === 200, `status=${cleanup.status}`)

const failed = results.filter(r => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} test geçti ${failed.length === 0 ? '✅' : '❌'}`)
process.exit(failed.length === 0 ? 0 : 1)
