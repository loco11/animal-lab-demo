/** 通用工具：金额一律按「分」计算与存储，日期一律用 YYYY-MM-DD 字符串。 */

/** 生成稳定 ID（演示用，不追求全局唯一性，只需会话内不重复） */
export function uid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}

/** 分 → 元字符串，如 12345 → "123.45" */
export function formatMoney(fen: number): string {
  const yuan = fen / 100
  return yuan.toFixed(2)
}

/** 分 → 带单位的展示，如 12345 → "¥123.45" */
export function moneyText(fen: number): string {
  return `¥${formatMoney(fen)}`
}

/** 元字符串 → 分。非法输入返回 null */
export function parseYuan(input: string): number | null {
  const v = Number(input)
  if (!input.trim() || Number.isNaN(v) || v < 0) return null
  return Math.round(v * 100)
}

export function todayStr(): string {
  return toDateStr(new Date())
}

export function nowDateTime(): string {
  const d = new Date()
  const hh = `${d.getHours()}`.padStart(2, '0')
  const mm = `${d.getMinutes()}`.padStart(2, '0')
  const ss = `${d.getSeconds()}`.padStart(2, '0')
  return `${toDateStr(d)} ${hh}:${mm}:${ss}`
}

export function toDateStr(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, '0')
  const day = `${d.getDate()}`.padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

export function recentWeekRange(): { start: string; end: string } {
  return { start: addDays(todayStr(), -6), end: todayStr() }
}

export function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00`)
  d.setDate(d.getDate() + days)
  return toDateStr(d)
}

/** 区间天数：开始日含、结束日不含 */
export function daysBetween(start: string, end: string): number {
  const s = new Date(`${start}T00:00:00`).getTime()
  const e = new Date(`${end}T00:00:00`).getTime()
  return Math.max(0, Math.round((e - s) / 86400000))
}

export function escapeHtml(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** 导出 CSV（带 BOM，避免 Excel 中文乱码） */
export function downloadCSV(filename: string, header: string[], rows: string[][]): void {
  const body = [header, ...rows]
    .map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\r\n')
  const blob = new Blob([`\uFEFF${body}`], { type: 'text/csv;charset=utf-8;' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}

export function downloadText(filename: string, text: string, mime = 'text/plain'): void {
  const blob = new Blob([text], { type: `${mime};charset=utf-8;` })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}

/* ---------------- ZIP 打包（store 模式，无第三方依赖） ---------------- */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[i] = c >>> 0
  }
  return t
})()

function crc32(data: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/** 将多个文本文件打包为 zip 并下载（store 模式，无压缩，UTF-8 文件名） */
export function downloadZip(zipName: string, files: { name: string; content: string }[]): void {
  const encoder = new TextEncoder()
  const localChunks: Uint8Array[] = []
  const centralChunks: Uint8Array[] = []
  let offset = 0

  for (const f of files) {
    const nameBytes = encoder.encode(f.name)
    const dataBytes = encoder.encode(f.content)
    const crc = crc32(dataBytes)

    const local = new Uint8Array(30 + nameBytes.length)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, 0x04034b50, true)
    lv.setUint16(4, 20, true)
    lv.setUint16(6, 0x0800, true) // UTF-8 文件名
    lv.setUint16(8, 0, true) // store（无压缩）
    lv.setUint16(10, 0, true)
    lv.setUint16(12, 0, true)
    lv.setUint32(14, crc, true)
    lv.setUint32(18, dataBytes.length, true)
    lv.setUint32(22, dataBytes.length, true)
    lv.setUint16(26, nameBytes.length, true)
    lv.setUint16(28, 0, true)
    local.set(nameBytes, 30)

    const central = new Uint8Array(46 + nameBytes.length)
    const cv = new DataView(central.buffer)
    cv.setUint32(0, 0x02014b50, true)
    cv.setUint16(4, 20, true)
    cv.setUint16(6, 20, true)
    cv.setUint16(8, 0x0800, true)
    cv.setUint16(10, 0, true)
    cv.setUint16(12, 0, true)
    cv.setUint16(14, 0, true)
    cv.setUint32(16, crc, true)
    cv.setUint32(20, dataBytes.length, true)
    cv.setUint32(24, dataBytes.length, true)
    cv.setUint16(28, nameBytes.length, true)
    cv.setUint16(30, 0, true)
    cv.setUint16(32, 0, true)
    cv.setUint16(34, 0, true)
    cv.setUint16(36, 0, true)
    cv.setUint32(38, 0, true)
    cv.setUint32(42, offset, true)
    central.set(nameBytes, 46)

    localChunks.push(local, dataBytes)
    centralChunks.push(central)
    offset += local.length + dataBytes.length
  }

  const cdSize = centralChunks.reduce((s, c) => s + c.length, 0)
  const centralDir = new Uint8Array(cdSize)
  let p = 0
  for (const c of centralChunks) {
    centralDir.set(c, p)
    p += c.length
  }

  const eocd = new Uint8Array(22)
  const ev = new DataView(eocd.buffer)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(4, 0, true)
  ev.setUint16(6, 0, true)
  ev.setUint16(8, files.length, true)
  ev.setUint16(10, files.length, true)
  ev.setUint32(12, cdSize, true)
  ev.setUint32(16, offset, true)
  ev.setUint16(20, 0, true)

  const total = new Uint8Array(offset + cdSize + eocd.length)
  let q = 0
  for (const c of localChunks) {
    total.set(c, q)
    q += c.length
  }
  total.set(centralDir, q)
  q += cdSize
  total.set(eocd, q)

  const blob = new Blob([total], { type: 'application/zip' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = zipName
  a.click()
  URL.revokeObjectURL(a.href)
}
