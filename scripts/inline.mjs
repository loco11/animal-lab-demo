/**
 * 把 dist 内的 JS/CSS 内联进单个 index.html，产出可直接双击打开的静态页。
 * 用法：npm run build:single
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dist = resolve(root, 'dist')
const htmlPath = resolve(dist, 'index.html')

if (!existsSync(htmlPath)) {
  console.error('未找到 dist/index.html，请先执行 npm run build')
  process.exit(1)
}

let html = readFileSync(htmlPath, 'utf8')
let count = 0

html = html.replace(/<script[^>]*src="([^"]+\.js)"[^>]*><\/script>/g, (_, src) => {
  const file = resolve(dist, src.replace(/^\.?\//, ''))
  if (!existsSync(file)) return ''
  count++
  // 原 <script type="module"> 默认延迟执行；内联到 head 后需等 DOM 就绪，否则 #app 尚不存在
  return `<script>\ndocument.addEventListener('DOMContentLoaded', function () {\n${readFileSync(file, 'utf8')}\n});\n</script>`
})

html = html.replace(/<link[^>]*href="([^"]+\.css)"[^>]*>/g, (_, href) => {
  const file = resolve(dist, href.replace(/^\.?\//, ''))
  if (!existsSync(file)) return ''
  count++
  return `<style>\n${readFileSync(file, 'utf8')}\n</style>`
})

html = html.replace(/<link[^>]*rel="modulepreload"[^>]*>/g, '')

writeFileSync(htmlPath, html, 'utf8')
console.log(`已内联 ${count} 个资源 → dist/index.html（${(Buffer.byteLength(html) / 1024).toFixed(1)} KB）`)
