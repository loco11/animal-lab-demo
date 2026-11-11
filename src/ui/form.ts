/** 表单与页面骨架辅助：统一字段渲染、校验提示和弹窗表单，避免各页面重复实现 */

import { el, openDialog } from './index'
import { escapeHtml } from '../core/utils'

export type FieldSpec =
  | {
      kind: 'text' | 'number' | 'date' | 'textarea' | 'readonly'
      key: string
      label: string
      value?: string
      required?: boolean
      full?: boolean
      placeholder?: string
      disabled?: boolean
      hint?: string
    }
  | {
      kind: 'select'
      key: string
      label: string
      options: { value: string; label: string }[]
      value?: string
      required?: boolean
      full?: boolean
      placeholder?: string
      disabled?: boolean
      hint?: string
    }
  | { kind: 'static'; html: string; full?: boolean }
  | { kind: 'note'; text: string; full?: boolean }

export interface FormInstance {
  node: HTMLElement
  values(): Record<string, string>
  setError(key: string, message?: string): void
}

export function renderForm(fields: FieldSpec[]): FormInstance {
  const grid = el('div', 'form-grid')
  const errors = new Map<string, HTMLElement>()

  fields.forEach((f) => {
    if (f.kind === 'static') {
      const wrap = el('div', f.full ? 'is-full' : '')
      wrap.innerHTML = f.html
      grid.appendChild(wrap)
      return
    }
    if (f.kind === 'note') {
      const wrap = el('div', f.full ? 'is-full' : '')
      wrap.innerHTML = `<p class="hint">${escapeHtml(f.text)}</p>`
      grid.appendChild(wrap)
      return
    }

    const box = el('div', 'field' + (f.full ? ' is-full' : ''))
    const labelText = f.label + (f.required ? ' *' : '')
    box.appendChild(el('span', 'field__label', escapeHtml(labelText)))

    let control: HTMLElement
    if (f.kind === 'select') {
      const sel = el('select') as HTMLSelectElement
      const ph = el('option', '', `请选择${f.label}`) as HTMLOptionElement
      ph.value = ''
      sel.appendChild(ph)
      f.options.forEach((o) => {
        const op = el('option', '', escapeHtml(o.label)) as HTMLOptionElement
        op.value = o.value
        if (o.value === f.value) op.selected = true
        sel.appendChild(op)
      })
      if (f.disabled) sel.disabled = true
      control = sel
    } else if (f.kind === 'textarea' || f.kind === 'readonly') {
      const ta = el('textarea') as HTMLTextAreaElement
      ta.rows = f.kind === 'textarea' ? 3 : 2
      ta.value = f.value ?? ''
      if (f.kind === 'textarea') ta.placeholder = `请输入${f.label}`
      if (f.disabled || f.kind === 'readonly') ta.disabled = true
      control = ta
    } else {
      const input = el('input') as HTMLInputElement
      input.type = f.kind === 'date' ? 'date' : f.kind === 'number' ? 'number' : 'text'
      input.value = f.value ?? ''
      input.placeholder = `请输入${f.label}`
      if (f.disabled) input.disabled = true
      control = input
    }
    control.dataset.key = f.key
    box.appendChild(control)

    if (f.hint) box.appendChild(el('span', 'hint', escapeHtml(f.hint)))
    const err = el('span', 'field__error')
    err.style.display = 'none'
    box.appendChild(err)
    errors.set(f.key, err)
    grid.appendChild(box)
  })

  return {
    node: grid,
    values() {
      const out: Record<string, string> = {}
      fields.forEach((f) => {
        if (f.kind === 'static' || f.kind === 'note') return
        const c = grid.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
          `[data-key="${f.key}"]`,
        )
        out[f.key] = c ? c.value.trim() : ''
      })
      return out
    },
    setError(key, message) {
      const node = errors.get(key)
      if (!node) return
      if (!message) {
        node.style.display = 'none'
        node.textContent = ''
      } else {
        node.style.display = ''
        node.textContent = message
      }
    },
  }
}

/** 弹窗表单：内置必填校验，返回 false 表示取消或校验未通过 */
export function formDialog(
  title: string,
  fields: FieldSpec[],
  onSubmit: (values: Record<string, string>, form: FormInstance) => boolean | void,
  confirmText = '保存',
  onRender?: (formNode: HTMLElement, dlg: HTMLElement) => void,
): void {
  const form = renderForm(fields)
  const dlg = openDialog({
    title,
    bodyHtml: '',
    wide: fields.length > 4,
    actions: [
      { text: '取消' },
      {
        text: confirmText,
        primary: true,
        keepOpen: true,
        onClick: () => {
          const values = form.values()
          let ok = true
          fields.forEach((f) => {
            if (f.kind === 'static' || f.kind === 'note') return
            form.setError(f.key, '')
            if (f.required && !values[f.key]) {
              form.setError(f.key, `${f.label}不能为空`)
              ok = false
            }
          })
          if (!ok) return
          if (onSubmit(values, form) === false) return
          dlg.close()
        },
      },
    ],
  })
  const body = dlg.querySelector('.dlg__body') as HTMLElement
  body.appendChild(form.node)
  onRender?.(form.node, dlg)
}

/* ---------------- 页面骨架 ---------------- */

/** 页面骨架：不渲染页面标题与副标题，页面直接由页签／查询区／表格组成 */
export interface PageMeta {
  notes?: string[]
}

export function pageShell(host: HTMLElement, meta: PageMeta = {}): HTMLElement {
  const page = el('div', 'page')
  if (meta.notes?.length) {
    const notes = el('div', 'panel')
    notes.innerHTML = meta.notes.map((n) => `<p class="para">${escapeHtml(n)}</p>`).join('')
    page.appendChild(notes)
  }
  host.appendChild(page)
  return page
}

export function panel(title?: string, cls = ''): HTMLElement {
  const p = el('div', `panel${cls ? ` ${cls}` : ''}`)
  if (title) p.appendChild(el('h2', 'panel-title', escapeHtml(title)))
  return p
}

export function panelHead(title: string, desc = ''): HTMLElement {
  const head = el('div', 'panel-head')
  head.innerHTML = `<h2 class="panel-title">${escapeHtml(title)}</h2>${
    desc ? `<p class="page-desc">${escapeHtml(desc)}</p>` : ''
  }`
  return head
}

/** 键值明细：详情页统一使用 */
export function detailGrid(pairs: [string, string][], columns = 4): HTMLElement {
  const style = `grid-template-columns: repeat(${columns}, minmax(0, 1fr))`
  const grid = el('div', 'panel form-grid')
  grid.style.gridTemplateColumns = style
  pairs.forEach(([k, v]) => {
    const item = el('div', 'field')
    item.innerHTML = `<span class="field__label">${escapeHtml(k)}</span><span>${v}</span>`
    grid.appendChild(item)
  })
  return grid
}

export function historyTable(host: HTMLElement, rows: string[][]): void {
  const table = el('div', 'panel panel-table')
  table.innerHTML = `<table><thead><tr><th>时间</th><th>操作人</th><th>动作</th><th>说明</th></tr></thead><tbody>${
    rows.length
      ? rows
          .map(
            ([at, actor, action, note]) =>
              `<tr><td>${escapeHtml(at)}</td><td>${escapeHtml(actor)}</td><td>${escapeHtml(action)}</td><td>${escapeHtml(
                note ?? '',
              )}</td></tr>`,
          )
          .join('')
      : `<tr><td colspan="4"><div class="state-area"><p class="state-area__text">暂无记录</p></div></td></tr>`
  }</tbody></table>`
  host.appendChild(table)
}
