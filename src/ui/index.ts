/**
 * 通用 UI 渲染层（替代 UI 框架组件库）。
 * 全部按《部门后管界面规范 v0.25》实现：表格 / 分页 / 按钮 / 弹窗 / Toast / 空状态 / 页签。
 * 9 个业务页面统一从这里取组件，保证视觉一致。
 */

import { escapeHtml } from '../core/utils'

/* ---------------- DOM 基础 ---------------- */

export function el(tag: string, className = '', html = ''): HTMLElement {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (html) node.innerHTML = html
  return node
}

/* ---------------- Toast ---------------- */

let toastLayer: HTMLElement | null = null

export function toast(message: string, type: 'info' | 'success' | 'error' | 'warning' = 'info'): void {
  if (!toastLayer) {
    toastLayer = el('div', 'toast-layer')
    document.body.appendChild(toastLayer)
  }
  const item = el('div', `toast is-${type}`, escapeHtml(message))
  toastLayer.appendChild(item)
  setTimeout(() => item.remove(), 2600)
}

/* ---------------- 弹窗（原生 dialog） ---------------- */

export interface DialogAction {
  text: string
  primary?: boolean
  danger?: boolean
  /** 点击后是否关闭弹窗，默认 true */
  keepOpen?: boolean
  onClick?: () => void
}

export interface DialogOptions {
  title: string
  bodyHtml: string
  wide?: boolean
  actions?: DialogAction[]
}

export function openDialog(opts: DialogOptions): HTMLDialogElement {
  const dlg = document.createElement('dialog')
  dlg.className = 'dlg' + (opts.wide ? ' is-wide' : '')
  dlg.innerHTML = `
    <div class="dlg__head"><h2 class="dlg__title">${escapeHtml(opts.title)}</h2></div>
    <div class="dlg__body">${opts.bodyHtml}</div>
    <div class="dlg__foot"></div>
  `
  const foot = dlg.querySelector('.dlg__foot') as HTMLElement
  const actions = opts.actions?.length ? opts.actions : [{ text: '关闭', primary: true }]
  actions.forEach((a) => {
    const btn = el('button', `btn ${a.primary ? 'btn-primary' : a.danger ? 'btn-danger' : 'btn-default'}`, a.text)
    btn.addEventListener('click', () => {
      a.onClick?.()
      if (!a.keepOpen) dlg.close()
    })
    foot.appendChild(btn)
  })
  document.body.appendChild(dlg)
  dlg.addEventListener('close', () => dlg.remove())
  dlg.showModal()
  return dlg
}

export function confirmDialog(title: string, message: string, confirmText = '确定'): Promise<boolean> {
  return new Promise((resolve) => {
    let result = false
    const dlg = openDialog({
      title,
      bodyHtml: `<p class="para">${escapeHtml(message)}</p>`,
      actions: [
        { text: '取消', onClick: () => (result = false) },
        { text: confirmText, primary: true, onClick: () => (result = true) },
      ],
    })
    dlg.addEventListener('close', () => resolve(result))
  })
}

/* ---------------- 抽屉（右侧滑出） ---------------- */

export interface DrawerOptions {
  title: string
  bodyHtml?: string
  actions?: DialogAction[]
  /** 宽度（px），默认 560 */
  width?: number
}

export interface DrawerInstance {
  node: HTMLElement
  body: HTMLElement
  close(): void
}

export function openDrawer(opts: DrawerOptions): DrawerInstance {
  const mask = el('div', 'drawer-mask')
  const drawer = el('div', 'drawer')
  if (opts.width) drawer.style.width = `${opts.width}px`

  drawer.innerHTML = `
    <div class="drawer__head">
      <h2 class="drawer__title">${escapeHtml(opts.title)}</h2>
      <button class="drawer__close" type="button" aria-label="关闭">×</button>
    </div>
    <div class="drawer__body">${opts.bodyHtml ?? ''}</div>
    <div class="drawer__foot"></div>
  `

  const body = drawer.querySelector('.drawer__body') as HTMLElement
  const foot = drawer.querySelector('.drawer__foot') as HTMLElement

  function onKey(ev: KeyboardEvent): void {
    if (ev.key === 'Escape') closeDrawer()
  }
  function closeDrawer(): void {
    document.removeEventListener('keydown', onKey)
    mask.remove()
  }

  drawer.querySelector('.drawer__close')?.addEventListener('click', closeDrawer)

  const actions = opts.actions?.length ? opts.actions : [{ text: '关闭', primary: true }]
  actions.forEach((a) => {
    const btn = el('button', `btn ${a.primary ? 'btn-primary' : a.danger ? 'btn-danger' : 'btn-default'}`, a.text)
    btn.addEventListener('click', () => {
      a.onClick?.()
      if (!a.keepOpen) closeDrawer()
    })
    foot.appendChild(btn)
  })

  mask.appendChild(drawer)
  document.body.appendChild(mask)
  document.addEventListener('keydown', onKey)
  requestAnimationFrame(() => mask.classList.add('is-open'))

  return { node: drawer, body, close: closeDrawer }
}

/* ---------------- 数据状态（规范 6 章） ---------------- */

const ICON_EMPTY = `<svg class="state-area__icon" viewBox="0 0 64 64" aria-hidden="true">
  <rect x="8" y="20" width="48" height="30" rx="2" fill="none" stroke="#D8D8D8" stroke-width="2"/>
  <path d="M8 26 L32 38 L56 26" fill="none" stroke="#D8D8D8" stroke-width="2"/></svg>`
const ICON_ERROR = `<svg class="state-area__icon" style="width:40px;height:40px" viewBox="0 0 40 40" aria-hidden="true">
  <circle cx="20" cy="20" r="18" fill="none" stroke="#D8D8D8" stroke-width="2"/>
  <path d="M20 12 V22" stroke="#D8D8D8" stroke-width="2"/>
  <circle cx="20" cy="28" r="1.5" fill="#D8D8D8"/></svg>`

export type StateKind = 'empty' | 'loading' | 'error' | 'noresult'

export function renderState(host: HTMLElement, kind: StateKind, text?: string): void {
  const area = el('div', 'state-area')
  if (kind === 'loading') {
    area.innerHTML = '<div class="spinner"></div>'
  } else if (kind === 'error') {
    area.innerHTML = `${ICON_ERROR}<p class="state-area__text">${escapeHtml(text ?? '数据加载失败')}</p>`
  } else {
    area.innerHTML = `${ICON_EMPTY}<p class="state-area__text">${escapeHtml(
      text ?? (kind === 'noresult' ? '未找到符合条件的数据' : '暂无数据'),
    )}</p>`
  }
  host.appendChild(area)
}

/* ---------------- 表格（规范 2 章） ---------------- */

export interface TableColumn<T> {
  key: string
  title: string
  width?: string
  align?: 'left' | 'right'
  ellipsis?: boolean
  render?: (row: T, index: number) => string
}

export interface RowAction {
  text: string
  act: string
  danger?: boolean
  disabled?: boolean
}

export interface TableOptions<T> {
  cols: TableColumn<T>[]
  rows: T[]
  rowKey?: (row: T) => string
  selectable?: boolean
  selectedIds?: Set<string>
  actions?: (row: T) => RowAction[]
  emptyText?: string
  /** 已提交有效查询条件：无匹配记录时按“查询无结果”展示（规范 9 章） */
  queryActive?: boolean
  /** 无权限时的提示文本 */
  noPermissionText?: string
}

export interface TableHandlers<T> {
  onAction?: (act: string, row: T) => void
  onSelectionChange?: (ids: string[]) => void
}

export function renderTable<T>(host: HTMLElement, opts: TableOptions<T>, handlers: TableHandlers<T> = {}): void {
  const { cols, rows, selectable, actions } = opts
  const rowKey = opts.rowKey ?? ((r: T) => String((r as Record<string, unknown> & { id?: string }).id ?? ''))
  const selected = opts.selectedIds ?? new Set<string>()

  const wrap = el('div', 'table-wrap')
  const table = el('table') as HTMLTableElement
  const thead = el('thead')
  const headRow = el('tr')

  if (selectable) {
    const th = el('th', 'col-check')
    const box = el('input') as HTMLInputElement
    box.type = 'checkbox'
    box.checked = rows.length > 0 && rows.every((r) => selected.has(rowKey(r)))
    box.indeterminate = box.checked === false && rows.some((r) => selected.has(rowKey(r)))
    box.addEventListener('change', () => {
      rows.forEach((r) => (box.checked ? selected.add(rowKey(r)) : selected.delete(rowKey(r))))
      handlers.onSelectionChange?.([...selected])
    })
    th.appendChild(box)
    headRow.appendChild(th)
  }

  cols.forEach((c) => {
    const th = el('th', c.align === 'right' ? 'is-right' : '')
    th.textContent = c.title
    if (c.width) th.style.width = c.width
    headRow.appendChild(th)
  })
  if (actions) headRow.appendChild(el('th', 'col-actions', '操作'))
  thead.appendChild(headRow)

  const tbody = el('tbody')
  if (!rows.length) {
    const td = el('td') as HTMLTableCellElement
    td.colSpan = cols.length + (selectable ? 1 : 0) + (actions ? 1 : 0)
    // 规范 9 章：已提交有效查询条件但无匹配记录时，统一展示“未找到符合条件的数据”
    const emptyText = opts.queryActive ? '未找到符合条件的数据' : (opts.emptyText ?? '暂无数据')
    const state = el('div', 'state-area')
    state.innerHTML = `${ICON_EMPTY}<p class="state-area__text">${escapeHtml(emptyText)}</p>`
    td.appendChild(state)
    tbody.appendChild(el('tr')).appendChild(td)
  } else {
    rows.forEach((row, index) => {
      const tr = el('tr') as HTMLTableRowElement
      tr.dataset.idx = String(index)
      if (selectable) {
        const td = el('td', 'col-check')
        const box = el('input') as HTMLInputElement
        box.type = 'checkbox'
        box.checked = selected.has(rowKey(row))
        box.addEventListener('change', () => {
          if (box.checked) selected.add(rowKey(row))
          else selected.delete(rowKey(row))
          handlers.onSelectionChange?.([...selected])
        })
        td.appendChild(box)
        tr.appendChild(td)
      }
      cols.forEach((c) => {
        const td = el('td', [c.align === 'right' ? 'is-right' : '', c.ellipsis ? 'is-ellipsis' : ''].join(' ').trim())
        td.innerHTML = c.render ? c.render(row, index) : escapeHtml((row as Record<string, unknown>)[c.key])
        // 超长截断时提供完整内容气泡；未截断不显示（规范 2 章）
        if (c.ellipsis && (td.textContent ?? '').length > 16) td.title = td.textContent ?? ''
        tr.appendChild(td)
      })
      if (actions) {
        const td = el('td', 'col-actions')
        const list = actions(row).filter(Boolean)
        if (!list.length) {
          td.innerHTML = '<span class="hint">—</span>'
        } else {
          list.forEach((a) => {
            const btn = el('button', `btn-text${a.danger ? ' is-danger' : ''}`, a.text)
            btn.dataset.act = a.act
            if (a.disabled) (btn as HTMLButtonElement).disabled = true
            td.appendChild(btn)
          })
        }
        tr.appendChild(td)
      }
      tbody.appendChild(tr)
    })
  }

  if (handlers.onAction) {
    tbody.addEventListener('click', (ev) => {
      const btn = (ev.target as HTMLElement).closest('button[data-act]') as HTMLButtonElement | null
      if (!btn) return
      const tr = btn.closest('tr') as HTMLTableRowElement
      const row = rows[Number(tr.dataset.idx)]
      if (row) handlers.onAction?.(btn.dataset.act as string, row)
    })
  }

  table.appendChild(thead)
  table.appendChild(tbody)
  wrap.appendChild(table)
  host.appendChild(wrap)
}

/* ---------------- 分页（规范 8 章） ---------------- */

export interface PagerOptions {
  total: number
  page: number
  pageSize: number
  onChange: (page: number, pageSize: number) => void
}

export function renderPager(host: HTMLElement, opts: PagerOptions): void {
  const { total, page, pageSize, onChange } = opts
  // 规范 8 章：结果总数不足 10 条不显示分页；无数据、查询无结果同样不显示
  if (total < 10) return
  const pages = Math.max(1, Math.ceil(total / pageSize))
  // 表格底部留白改由分页区提供，避免与表格容器底部留白叠加
  host.querySelector('.table-wrap:last-of-type')?.classList.add('has-pager')
  const bar = el('div', 'pagination')
  bar.appendChild(el('span', 'page-total', `共 ${total} 条`))

  const prev = el('button', 'page-btn', '上一页') as HTMLButtonElement
  prev.disabled = page <= 1
  prev.addEventListener('click', () => onChange(Math.max(1, page - 1), pageSize))
  bar.appendChild(prev)

  Array.from({ length: pages }).forEach((_, i) => {
    const n = i + 1
    const btn = el('button', `page-btn${n === page ? ' is-active' : ''}`, String(n)) as HTMLButtonElement
    btn.addEventListener('click', () => onChange(n, pageSize))
    bar.appendChild(btn)
  })

  const next = el('button', 'page-btn', '下一页') as HTMLButtonElement
  next.disabled = page >= pages
  next.addEventListener('click', () => onChange(Math.min(pages, page + 1), pageSize))
  bar.appendChild(next)

  const sizeSel = el('select') as HTMLSelectElement
  sizeSel.style.width = '96px'
  ;[10, 20, 50, 100].forEach((size) => {
    const op = el('option', '', `${size} 条/页`) as HTMLOptionElement
    op.value = String(size)
    if (size === pageSize) op.selected = true
    sizeSel.appendChild(op)
  })
  sizeSel.addEventListener('change', () => onChange(1, Number(sizeSel.value)))
  bar.appendChild(sizeSel)

  // 规范 8 章：展示顺序为 总数 / 上一页 / 页码 / 下一页 / 每页条数 / 跳转
  const jump = el('span', 'page-jump', '跳转')
  const jumpInput = el('input') as HTMLInputElement
  jumpInput.type = 'number'
  jumpInput.min = '1'
  jumpInput.max = String(pages)
  jumpInput.value = String(page)
  const go = (): void => {
    const n = Math.min(pages, Math.max(1, Number(jumpInput.value) || 1))
    if (n !== page) onChange(n, pageSize)
    else jumpInput.value = String(page)
  }
  jumpInput.addEventListener('keydown', (ev) => {
    if ((ev as KeyboardEvent).key === 'Enter') go()
  })
  jumpInput.addEventListener('blur', go)
  jump.appendChild(jumpInput)
  bar.appendChild(jump)

  host.appendChild(bar)
}

/* ---------------- 页签（规范 11 章） ---------------- */

export interface TabItem {
  key: string
  text: string
  count?: number
}

export function renderTabs(host: HTMLElement, items: TabItem[], activeKey: string, onChange: (key: string) => void): void {
  const bar = el('div', 'tabs')
  items.forEach((it) => {
    const btn = el(
      'button',
      `tab${it.key === activeKey ? ' is-active' : ''}`,
      `${escapeHtml(it.text)}${it.count === undefined ? '' : `<span class="tab__count">${it.count}</span>`}`,
    ) as HTMLButtonElement
    btn.addEventListener('click', () => onChange(it.key))
    bar.appendChild(btn)
  })
  host.appendChild(bar)
}

/* ---------------- 工具栏（规范 5 章） ---------------- */

export function renderToolbar(host: HTMLElement, actionsHtml: string, extraHtml = ''): void {
  const bar = el('div', 'toolbar')
  bar.innerHTML = `<div class="toolbar__actions">${actionsHtml}</div>${extraHtml}`
  host.appendChild(bar)
}

/* ---------------- 标签 ---------------- */

export type TagTone = 'default' | 'primary' | 'success' | 'warning' | 'danger'

export function tagHtml(text: string, tone: TagTone = 'default'): string {
  return `<span class="tag${tone === 'default' ? '' : ` is-${tone}`}">${escapeHtml(text)}</span>`
}
