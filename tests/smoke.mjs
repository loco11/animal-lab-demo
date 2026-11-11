/**
 * 浏览器冒烟脚本：遍历主要页面，收集控制台错误并截图。
 * 用法：npm run preview 后执行 `node tests/smoke.mjs [baseUrl]`
 */
import playwrightPkg from '/Users/wuli/.npm/_npx/bbb8a2c4738e2b0c/node_modules/playwright/index.js'
const { chromium } = playwrightPkg
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve, dirname } from 'node:path'

const base = process.argv[2] ?? 'http://localhost:4173/'
const outDir = resolve(dirname(fileURLToPath(import.meta.url)), '../docs/screenshots') + '/'
mkdirSync(outDir, { recursive: true })

const routes = [
  ['login', '#/login'],
  ['dashboard', '#/dashboard'],
  ['service', '#/service'],
  ['order', '#/order'],
  ['stock', '#/stock'],
  ['purchase', '#/purchase'],
  ['feeding', '#/feeding'],
  ['cage', '#/cage'],
  ['fee', '#/fee'],
  ['system-menu', '#/system/menu'],
  ['system-role', '#/system/role'],
  ['system-user', '#/system/user'],
]

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(`[console] ${msg.text()}`)
})
page.on('pageerror', (err) => errors.push(`[pageerror] ${err.message}`))
page.on('requestfailed', (req) => errors.push(`[requestfailed] ${req.url()}`))

await page.goto(base, { waitUntil: 'networkidle' })
await page.waitForTimeout(300)

for (const [name, hash] of routes) {
  await page.goto(`${base}${hash}`, { waitUntil: 'load' })
  await page.waitForTimeout(250)
  await page.screenshot({ path: `${outDir}${name}.png`, fullPage: true })
}

// 1280x800 窄屏检查
await page.setViewportSize({ width: 1280, height: 800 })
for (const name of ['dashboard', 'order', 'fee']) {
  await page.goto(`${base}#/${name}`, { waitUntil: 'load' })
  await page.waitForTimeout(250)
  await page.screenshot({ path: `${outDir}1280-${name}.png`, fullPage: true })
}

await browser.close()

if (errors.length) {
  console.log('发现异常：')
  errors.forEach((e) => console.log(' -', e))
  process.exit(1)
}
console.log('冒烟检查通过：无控制台错误与失败请求')
