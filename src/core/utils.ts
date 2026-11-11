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
