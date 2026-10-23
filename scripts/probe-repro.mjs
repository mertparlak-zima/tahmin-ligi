// Repro v4 probe: PredictionsTab deseni
import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'

const DIST = 'D:/development/drive-trace/tmp/opencode/gea-repro/dist'
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }

const server = createServer(async (req, res) => {
  const rel = req.url === '/' ? 'index.html' : req.url.slice(1)
  const file = path.join(DIST, rel)
  const target = existsSync(file) ? file : path.join(DIST, 'index.html')
  res.writeHead(200, { 'content-type': MIME[path.extname(target)] ?? 'text/plain' })
  res.end(await readFile(target))
})
await new Promise(r => server.listen(8899, r))

const browser = await chromium.launch()
const page = await browser.newPage()
const errors = []
page.on('pageerror', err => errors.push(err instanceof Error ? (err.stack ?? String(err)) : String(err)))

await page.goto('http://localhost:8899', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2000)

console.log('results-page =', await page.locator('.results-page').count(), '(1 beklenir)')
console.log('day-group =', await page.locator('.day-group').count(), '(2 beklenir)')
console.log('result-item =', await page.locator('.result-item').count(), '(2 beklenir)')
console.log('hatalar:', errors.length)
errors.slice(0, 4).forEach(e => console.log('HATA:', e.slice(0, 2500)))

await browser.close()
server.close()
process.exit(0)
