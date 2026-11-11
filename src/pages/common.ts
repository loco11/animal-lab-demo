/** 页面通用：查询区构建、写操作守卫、结果提示 */

import { canAction, getCurrentUser } from '../core/auth'
import { getState } from '../core/store'
import type { OpResult } from '../core/biz/result'
import { moneyText } from '../core/utils'
import { el, tagHtml, toast, type TableColumn } from '../ui'
import { escapeHtml } from '../core/utils'

export interface QueryField {
  key: string
  label: string
  type: 'text' | 'select' | 'date' | 'number' | 'daterange'
  /** daterange 的结束值 key */
  key2?: string
  options?: { value: string; label: string }[]
  placeholder?: string
}

/** 构建查询区：返回 { node, values() }，查询条件变化提交后才影响列表 */
export function buildQuery(
  fields: QueryField[],
  initial: Record<string, string>,
  onSearch: (values: Record<string, string>) => void,
  onReset: () => void,
): { node: HTMLElement; values: () => Record<string, string> } {
  const wrap = el('div', 'panel query')
  const grid = el('div', 'query__grid')
  wrap.appendChild(grid)

  // 规范 10 章：字段名称放在控件内，通过占位文字展示，不另置字段标签
  fields.forEach((f) => {
    const box = el('div', 'field')
    if (f.type === 'daterange') {
      // 日期范围合并为一个字段：开始 ~ 结束
      const range = el('div', 'query__range')
      const start = el('input') as HTMLInputElement
      start.type = 'date'
      start.dataset.queryKey = f.key
      start.value = initial[f.key] ?? ''
      start.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') onSearch(values())
      })
      const sep = el('span', '', '~')
      const end = el('input') as HTMLInputElement
      end.type = 'date'
      const key2 = f.key2 ?? `${f.key}End`
      end.dataset.queryKey = key2
      end.value = initial[key2] ?? ''
      end.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') onSearch(values())
      })
      range.appendChild(start)
      range.appendChild(sep)
      range.appendChild(end)
      box.appendChild(range)
      grid.appendChild(box)
      return
    }
    let control: HTMLElement
    if (f.type === 'select') {
      const sel = el('select') as HTMLSelectElement
      sel.innerHTML = `<option value="">请选择${escapeHtml(f.label)}</option>${(f.options ?? [])
        .map((o) => `<option value="${o.value}">${escapeHtml(o.label)}</option>`)
        .join('')}`
      sel.value = initial[f.key] ?? ''
      control = sel
    } else {
      const input = el('input') as HTMLInputElement
      input.type = f.type === 'date' ? 'date' : f.type === 'number' ? 'number' : 'text'
      input.value = initial[f.key] ?? ''
      input.placeholder = `请输入${f.label}`
      // 规范 10 章：文本框回车与点击查询执行同一查询
      input.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') onSearch(values())
      })
      control = input
    }
    control.dataset.queryKey = f.key
    box.appendChild(control)
    grid.appendChild(box)
  })

  const actions = el('div', 'query__actions')
  const searchBtn = el('button', 'btn btn-primary', '查询')
  searchBtn.addEventListener('click', () => onSearch(values()))
  const resetBtn = el('button', 'btn btn-default', '重置')
  resetBtn.addEventListener('click', () => {
    grid.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-query-key]').forEach((c) => (c.value = ''))
    onReset()
  })
  actions.appendChild(searchBtn)
  actions.appendChild(resetBtn)
  grid.appendChild(actions)

  function values(): Record<string, string> {
    const out: Record<string, string> = {}
    grid.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-query-key]').forEach((c) => {
      out[c.dataset.queryKey as string] = c.value.trim()
    })
    return out
  }

  return { node: wrap, values }
}

/** 写操作统一守卫：先检查数据范围与操作权限，避免点了才发现不可用 */
export function runGuarded(actionKey: string, fn: () => void): void {
  if (getState().wholeSchool) {
    toast('全校视图为只读汇总，处理业务请先选定实验室', 'warning')
    return
  }
  if (!getCurrentUser().enabled) {
    toast('当前身份未获得该实验室的管理授权', 'error')
    return
  }
  if (actionKey && !canAction(actionKey)) {
    toast('当前角色未获得该操作权限', 'error')
    return
  }
  fn()
}

export function showResult(result: OpResult): boolean {
  toast(result.message, result.ok ? 'success' : 'error')
  return result.ok
}

/** 无权限或只读时的按钮禁用理由 */
export function actionHint(actionKey: string): string {
  if (getState().wholeSchool) return '全校视图为只读汇总'
  if (!getCurrentUser().enabled) return '当前身份未获得该实验室管理授权'
  if (!canAction(actionKey)) return '当前角色未获得该操作权限'
  return ''
}

export function moneyTag(fen: number): string {
  return `<strong>${moneyText(fen)}</strong>`
}

export function col<T>(title: string, key: keyof T | ((row: T) => string), width?: string): TableColumn<T> {
  return {
    key: String(key),
    title,
    width,
    render: typeof key === 'function' ? (row) => key(row) : (row) => String((row as Record<string, unknown>)[key as string] ?? ''),
  }
}

export function stateTag(text: string, tone: 'default' | 'primary' | 'success' | 'warning' | 'danger'): string {
  return tagHtml(text, tone)
}

export function yesNo(v: boolean): string {
  return v ? tagHtml('启用', 'success') : tagHtml('停用', 'default')
}
