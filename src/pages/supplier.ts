/** 供应商管理：一个供应商可挂多个供应条目（动物品系/物资品种），条目有系统固定编码 */

import {
  createSupplier,
  createSupplierItem,
  listSupplierItems,
  listSuppliers,
  toggleSupplier,
  toggleSupplierItem,
  updateSupplier,
  updateSupplierItem,
  type SupplierItemInput,
} from '../core/biz/purchase'
import type { Supplier, SupplierItem } from '../types'
import type { PageDef } from '../router'
import { rerender } from '../router'
import { confirmDialog, el, openDialog, renderTable, tagHtml, type RowAction } from '../ui'
import { formDialog, pageShell } from '../ui/form'
import { buildQuery, runGuarded, showResult } from './common'
import { escapeHtml, moneyText } from '../core/utils'

const view = {
  filters: {} as Record<string, string>,
}

const KIND_TEXT: Record<SupplierItem['kind'], string> = { animal: '动物品系', supply: '物资品种' }

export const supplierPage: PageDef = {
  title: '供应商管理',
  render(host: HTMLElement) {
    const page = pageShell(host, {})

    const query = buildQuery(
      [
        { key: 'name', label: '供应商名称', type: 'text' },
        {
          key: 'status',
          label: '状态',
          type: 'select',
          options: [
            { value: 'enabled', label: '启用' },
            { value: 'disabled', label: '停用' },
          ],
        },
      ],
      view.filters,
      (values) => {
        view.filters = values
        rerender()
      },
      () => {
        view.filters = {}
        rerender()
      },
    )
    page.appendChild(query.node)

    const tableHost = el('div', 'panel panel-table')
    const toolbar = el('div', 'toolbar')
    toolbar.innerHTML =
      '<div class="toolbar__actions"><button class="btn btn-primary" data-act="create">新增供应商</button></div>' +
      '<span class="hint">一个供应商可添加多个供应条目；条目编码由系统生成，名称可重复</span>'
    toolbar.querySelector('button[data-act="create"]')?.addEventListener('click', () =>
      runGuarded('supplier:edit', () => openCreateSupplier()),
    )
    tableHost.appendChild(toolbar)

    renderTable<Supplier>(
      tableHost,
      {
        cols: [
          { key: 'name', title: '供应商名称', ellipsis: true },
          {
            key: 'items',
            title: '供应条目',
            render: (r) => {
              const items = listSupplierItems(r.id)
              return `<span class="hint">${items.length} 条</span>`
            },
          },
          { key: 'contact', title: '联系人' },
          { key: 'phone', title: '联系电话' },
          { key: 'note', title: '备注', ellipsis: true, render: (r) => r.note ?? '—' },
          {
            key: 'enabled',
            title: '状态',
            render: (r) => (r.enabled ? tagHtml('启用', 'success') : tagHtml('停用', 'default')),
          },
        ],
        rows: filteredSuppliers(),
        actions: (row) =>
          [
            { text: '供应条目', act: 'items' },
            { text: '编辑', act: 'edit' },
            row.enabled
              ? { text: '停用', act: 'disable', danger: true }
              : { text: '启用', act: 'enable' },
          ] as RowAction[],
        emptyText: '暂无供应商',
      },
      {
        onAction: (act, row) => {
          if (act === 'items') openItemsDialog(row)
          if (act === 'edit') runGuarded('supplier:edit', () => openEditSupplier(row))
          if (act === 'disable') runGuarded('supplier:edit', () => confirmDisable(row))
          if (act === 'enable') runGuarded('supplier:edit', () => showResult(toggleSupplier(row.id, true)))
        },
      },
    )
    page.appendChild(tableHost)
  },
}

function filteredSuppliers(): Supplier[] {
  const { name, status } = view.filters
  let list = listSuppliers()
  if (name) list = list.filter((s) => s.name.includes(name))
  if (status === 'enabled') list = list.filter((s) => s.enabled)
  if (status === 'disabled') list = list.filter((s) => !s.enabled)
  return list
}

async function confirmDisable(supplier: Supplier): Promise<void> {
  const ok = await confirmDialog(
    '停用供应商',
    `停用后「${supplier.name}」将不再出现在服务与采购汇总选择中，确定停用？`,
    '确定停用',
  )
  if (ok) showResult(toggleSupplier(supplier.id, false))
}

/* ---------------- 新增/编辑供应商 ---------------- */

function openCreateSupplier(): void {
  const bodyHtml =
    '<div class="form-grid" style="grid-template-columns:repeat(2,minmax(0,1fr))">' +
    '<div class="field is-full"><span class="field__label">供应商名称 *</span><input type="text" data-key="name" /></div>' +
    '<div class="field"><span class="field__label">联系人</span><input type="text" data-key="contact" /></div>' +
    '<div class="field"><span class="field__label">联系电话</span><input type="text" data-key="phone" /></div>' +
    '<div class="field is-full"><span class="field__label">备注</span><input type="text" data-key="note" /></div>' +
    '</div>' +
    '<p class="hint" style="margin:12px 0 6px">供应条目（动物品系 / 物资品种，可添加多条；编码由系统自动生成）</p>' +
    '<table><thead><tr><th>类型</th><th>名称</th><th>规格</th><th>单位</th><th>单价（元）</th><th></th></tr></thead><tbody data-rows></tbody></table>' +
    '<div class="toolbar__actions" style="margin-top:8px"><button class="btn btn-default" data-act="add-row">添加条目</button></div>'
  const dlg = openDialog({
    title: '新增供应商',
    bodyHtml,
    wide: true,
    actions: [{ text: '取消' }],
  })

  const rowsBox = dlg.querySelector('[data-rows]') as HTMLElement
  const addRow = () => {
    const tr = document.createElement('tr')
    tr.innerHTML =
      '<td><select data-f="kind"><option value="animal">动物品系</option><option value="supply">物资品种</option></select></td>' +
      '<td><input type="text" data-f="name" placeholder="如：KM小鼠、维持饲料" /></td>' +
      '<td><input type="text" data-f="spec" placeholder="如：SPF级 4周龄" /></td>' +
      '<td><input type="text" data-f="unit" placeholder="只 / kg" /></td>' +
      '<td><input type="number" min="0" step="0.01" data-f="price" placeholder="0.00" /></td>' +
      '<td><button class="btn-text" data-act="del">删除</button></td>'
    tr.querySelector('button[data-act="del"]')?.addEventListener('click', () => tr.remove())
    rowsBox.appendChild(tr)
  }
  dlg.querySelector('button[data-act="add-row"]')?.addEventListener('click', addRow)
  addRow()

  const submit = el('button', 'btn btn-primary', '确认新增')
  submit.addEventListener('click', () => {
    const get = (k: string) => (dlg.querySelector(`[data-key="${k}"]`) as HTMLInputElement)?.value ?? ''
    const name = get('name').trim()
    if (!name) {
      showResult({ ok: false, message: '请填写供应商名称' })
      return
    }
    const items: SupplierItemInput[] = []
    for (const tr of Array.from(rowsBox.querySelectorAll('tr'))) {
      const f = (k: string) => (tr.querySelector(`[data-f="${k}"]`) as HTMLInputElement | HTMLSelectElement)?.value ?? ''
      const itemName = f('name').trim()
      const spec = f('spec').trim()
      const unit = f('unit').trim()
      const priceRaw = f('price').trim()
      if (!itemName && !spec && !unit && !priceRaw) continue
      if (!itemName || !spec || !unit || priceRaw === '') {
        showResult({ ok: false, message: `条目「${itemName || '未填写'}」：名称、规格、单位、单价均为必填` })
        return
      }
      items.push({
        kind: f('kind') as 'animal' | 'supply',
        name: itemName,
        spec,
        unit,
        priceFen: Math.round(Number(priceRaw) * 100),
      })
    }
    const result = createSupplier({ name, contact: get('contact'), phone: get('phone'), note: get('note'), items })
    showResult(result)
    if (result.ok) {
      dlg.close()
      rerender()
    }
  })
  dlg.querySelector('.dlg__foot')?.appendChild(submit)
}

function openEditSupplier(supplier: Supplier): void {
  formDialog(
    '编辑供应商',
    [
      { kind: 'text', key: 'name', label: '供应商名称', required: true, full: true, value: supplier.name },
      { kind: 'text', key: 'contact', label: '联系人', value: supplier.contact },
      { kind: 'text', key: 'phone', label: '联系电话', value: supplier.phone },
      { kind: 'text', key: 'note', label: '备注', full: true, value: supplier.note ?? '' },
    ],
    (values) => {
      const result = updateSupplier(supplier.id, {
        name: values.name,
        contact: values.contact,
        phone: values.phone,
        note: values.note,
      })
      showResult(result)
      return result.ok
    },
    '保存',
  )
}

/* ---------------- 供应条目 ---------------- */

function openItemsDialog(supplier: Supplier): void {
  const bodyHtml =
    `<p class="hint" style="margin-bottom:8px">供应商：${escapeHtml(supplier.name)}（一个供应商可挂多个条目，编码由系统生成）</p>` +
    '<table><thead><tr><th>编码</th><th>类型</th><th>名称</th><th>规格</th><th>单位</th><th style="text-align:right">单价（元）</th><th>状态</th><th>操作</th></tr></thead><tbody data-rows></tbody></table>'
  const dlg = openDialog({
    title: `供应条目（${supplier.name}）`,
    bodyHtml,
    wide: true,
    actions: [{ text: '关闭', primary: true }],
  })
  const rowsBox = dlg.querySelector('[data-rows]') as HTMLElement

  const renderRows = () => {
    const items = listSupplierItems(supplier.id)
    rowsBox.innerHTML = items.length
      ? items
          .map(
            (item) =>
              `<tr><td>${escapeHtml(item.code)}</td><td>${KIND_TEXT[item.kind]}</td><td>${escapeHtml(item.name)}</td><td>${escapeHtml(
                item.spec,
              )}</td><td>${escapeHtml(item.unit)}</td><td style="text-align:right">${moneyText(item.priceFen)}</td><td>${
                item.enabled ? tagHtml('启用', 'success') : tagHtml('停用', 'default')
              }</td><td><button class="btn-text" data-act="edit" data-id="${item.id}">编辑</button> <button class="btn-text" data-act="toggle" data-id="${item.id}">${
                item.enabled ? '停用' : '启用'
              }</button></td></tr>`,
          )
          .join('')
      : '<tr><td colspan="8"><div class="state-area"><p class="state-area__text">暂无供应条目，请点击「新增条目」</p></div></td></tr>'
    rowsBox.querySelectorAll<HTMLButtonElement>('button[data-act="edit"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const item = items.find((i) => i.id === btn.dataset.id)
        if (item) openItemForm(supplier, item, renderRows)
      })
    })
    rowsBox.querySelectorAll<HTMLButtonElement>('button[data-act="toggle"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const item = items.find((i) => i.id === btn.dataset.id)
        if (item) {
          showResult(toggleSupplierItem(item.id, !item.enabled))
          renderRows()
          rerender()
        }
      })
    })
  }
  renderRows()

  const addBtn = el('button', 'btn btn-primary', '新增条目')
  addBtn.addEventListener('click', () => openItemForm(supplier, undefined, renderRows))
  dlg.querySelector('.dlg__foot')?.appendChild(addBtn)
}

function openItemForm(supplier: Supplier, item: SupplierItem | undefined, onDone: () => void): void {
  formDialog(
    item ? `编辑供应条目（${item.code}）` : `新增供应条目（${supplier.name}）`,
    [
      {
        kind: 'select',
        key: 'kind',
        label: '条目类型',
        required: true,
        options: [
          { value: 'animal', label: '动物品系' },
          { value: 'supply', label: '物资品种' },
        ],
        value: item?.kind ?? 'animal',
      },
      { kind: 'text', key: 'name', label: '名称', required: true, value: item?.name, placeholder: '如：KM小鼠、维持饲料' },
      { kind: 'text', key: 'spec', label: '规格', required: true, value: item?.spec, placeholder: '如：SPF级 4周龄、10kg/袋' },
      { kind: 'text', key: 'unit', label: '单位', required: true, value: item?.unit, placeholder: '如：只、kg' },
      {
        kind: 'number',
        key: 'price',
        label: '单价（元）',
        required: true,
        value: item ? String(item.priceFen / 100) : '',
      },
      { kind: 'text', key: 'note', label: '备注', full: true, value: item?.note ?? '' },
    ],
    (values) => {
      const input: SupplierItemInput = {
        kind: values.kind as 'animal' | 'supply',
        name: values.name,
        spec: values.spec,
        unit: values.unit,
        priceFen: Math.round(Number(values.price) * 100),
        note: values.note,
      }
      const result = item ? updateSupplierItem(item.id, input) : createSupplierItem(supplier.id, input)
      showResult(result)
      if (result.ok) {
        onDone()
        rerender()
      }
      return result.ok
    },
    item ? '保存' : '确认新增',
  )
}
