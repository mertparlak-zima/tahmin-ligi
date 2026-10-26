// Gerçek DB üzerinde uçtan uca HERKESÇE AÇIK tahmin akışı testi (#24 Faz 1).
// Şifre/login yoktur; uclar public'tir. `npm run dev:db` sunucusu ayakta
// olmalı (gerçek Supabase, .env gerekli).
// Kullanım: node --env-file=.env scripts/e2e-local.mjs

const BASE = 'http://localhost:8787'

const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok })
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
}

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({}))
  return { status: res.status, json }
}

// 1) Public lig verisi (açık/kilitli maçlar buradan okunur — bootstrap yok)
const league1 = await api('/api/league')
const matches = league1.json?.matches ?? []
const openMatches = matches.filter(m => !m.isStarted && m.statusGroup === 'upcoming')
const lockedMatch = matches.find(m => m.isStarted || m.statusGroup !== 'upcoming')
check('public /api/league 200', league1.status === 200, `${matches.length} maç, ${openMatches.length} tahmine açık`)

// 2) Oyuncu ekle (herkese açık uç; her çalıştırmada benzersiz isim)
const testName = `Test Oyuncu ${Date.now() % 100000}`
const player = await api('/api/players', {
  method: 'POST',
  body: { name: testName, color: '#c792ea' },
})
check('oyuncu ekleme 201', player.status === 201, player.json?.player?.name ?? player.json?.error)
const playerId = player.json?.player?.id

// 3) Açık maça tahmin gir (ilk 2 maç: H ve D)
const picks = openMatches.slice(0, 2).map((m, i) => ({ matchId: m.id, outcome: i === 0 ? 'H' : 'D' }))
const save = await api('/api/predictions', {
  method: 'PUT',
  body: { playerId, items: picks },
})
check('tahmin kaydı', save.status === 200, `saved=${save.json?.saved}`)

// 4) Mühür: girilen tahmin public payload'da sonucu SIZMAMALI
const league2 = await api('/api/league')
const sealedMatch = league2.json?.matches?.find(m => m.id === picks[0]?.matchId)
const sealedOk =
  sealedMatch &&
  sealedMatch.predictionsVisible === false &&
  sealedMatch.predictionCount >= 1 &&
  sealedMatch.predictions.every(p => !('outcome' in p))
check('tahmin mührü', Boolean(sealedOk), `visible=${sealedMatch?.predictionsVisible}, count=${sealedMatch?.predictionCount}`)

// 5) Kilitli maça yazma → 409
if (lockedMatch) {
  const locked = await api('/api/predictions', {
    method: 'PUT',
    body: { playerId, items: [{ matchId: lockedMatch.id, outcome: 'A' }] },
  })
  check('kilitli maç 409', locked.status === 409, locked.json?.error)
} else {
  check('kilitli maç 409', false, 'kilitli maç bulunamadı')
}

// 6) Aynı isim farklı yazımla → benzersizlik 400
const dup = await api('/api/players', {
  method: 'POST',
  body: { name: testName.toLocaleLowerCase('tr'), color: '#ffffff' },
})
check('benzersiz isim 400', dup.status === 400, dup.json?.error)

// 7) Tahmin silme (outcome='')
const del = await api('/api/predictions', {
  method: 'PUT',
  body: { playerId, items: [{ matchId: picks[1].matchId, outcome: '' }] },
})
check('tahmin silme', del.status === 200, `deleted=${del.json?.deleted}`)

// 8) Test oyuncusunu GERÇEKTEN sil — önce kalan tahmini temizle
//    (picks[0]'a girilen H hâlâ duruyor), sonra sil.
const delPreds = await api('/api/predictions', {
  method: 'PUT',
  body: { playerId, items: [{ matchId: picks[0].matchId, outcome: '' }] },
})
check('test tahminleri temizlendi', delPreds.status === 200, `status=${delPreds.status}`)

const cleanup = await api('/api/players', {
  method: 'DELETE',
  body: { id: playerId },
})
check('test oyuncusu silindi', cleanup.status === 200, `status=${cleanup.status}`)

const failed = results.filter(r => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} test geçti ${failed.length === 0 ? '✅' : '❌'}`)
process.exit(failed.length === 0 ? 0 : 1)
