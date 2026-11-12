/** 外购汇总：未处理按供应商分面板勾选、生成跨供应商发送批次；已处理按批次汇总；导出按供应商分文件或打包 zip */

import { listBatches, listSuppliers, markOrdersSent } from '../core/biz/purchase'
import { data } from '../core/data'
import { getCurrentUser } from '../core/auth'
import type { Order, PurchaseBatch } from '../types'
import { downloadCSV, downloadZip, moneyText, todayStr } from '../core/utils'
import type { PageDef } from '../router'
import { rerender } from '../router'
import { el, openDialog, renderTabs, tagHtml, toast } from '../ui'
import { pageShell } from '../ui/form'
import { buildQuery, runGuarded, showResult } from './common'
import { openDetail as openOrderDetail, renderOrderList, type OrderListView } from './order'

type TabKey = 'external' | 'pending' | 'done'

interface AggregatedItem {
  key: string
  itemName: string
  spec: string
  unit: string
  quantity: number
  amountFen: number
  orderCount: number
  /** 单价一致时为该价格，多价时为 null */
  priceFen: number | null
  /** 来源订单（用于订单数弹窗） */
  orders: Order[]
}

interface SupplierGroup {
  supplierId: string
  orders: Order[]
  amountFen: number
  items: AggregatedItem[]
}

const view = {
  tab: 'pending' as TabKey,
  filters: {} as Record<string, string>,
}

/** 未处理页勾选的订单 id（跨供应商聚合） */
const selectedOrders = new Set<string>()

/** 外购动物 tab 复用的订单列表状态（锁定 external 类型） */
const externalView: OrderListView = {
  tab: 'external',
  page: 1,
  pageSize: 10,
  filters: { code: '', applicant: '', fulfill: '', sent: '' },
}

export const purchasePage: PageDef = {
  title: '外购汇总',
  render(host: HTMLElement) {
    const page = pageShell(host, {})

    const pendingCount = pendingOrders().length
    const batches = listBatches().filter((b) => b.labId === getCurrentUser().labId)
    const externalCount = data().orders.filter((o) => o.kind === 'external' && o.labId === getCurrentUser().labId).length
    renderTabs(
      page,
      [
        { key: 'pending', text: '未处理', count: pendingCount },
        { key: 'done', text: '已处理', count: batches.length },
        { key: 'external', text: '外购动物订单', count: externalCount },
      ],
      view.tab,
      (key) => {
        view.tab = key as TabKey
        rerender()
      },
    )

    if (view.tab === 'external') {
      renderOrderList(page, externalView, { defaultFulfillOnReset: '' })
      return
    }

    if (view.tab === 'done') {
      renderDoneTab(page, batches)
      return
    }

    renderPendingTab(page)
  },
}

/* ---------------- 未处理 ---------------- */

function renderPendingTab(page: HTMLElement): void {
  // 清理已发送/不存在的残留勾选
  for (const id of [...selectedOrders]) {
    const o = data().orders.find((x) => x.id === id)
    if (!o || o.fulfillStatus === 'sent') selectedOrders.delete(id)
  }

  const query = buildQuery(
    [
      { key: 'supplierId', label: '供应商', type: 'select', options: listSuppliers().map((s) => ({ value: s.id, label: s.name })) },
      { key: 'code', label: '订单编号', type: 'text' },
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

  const groups = groupBySupplier(filteredOrders())
  page.appendChild(renderSubmitToolbar(groups))

  if (!groups.length) {
    const empty = el('div', 'panel')
    empty.innerHTML = '<div class="state-area"><p class="state-area__text">没有未处理的外购订单</p></div>'
    page.appendChild(empty)
    return
  }

  for (const group of groups) {
    page.appendChild(renderPendingGroup(group))
  }
}

function renderSubmitToolbar(groups: SupplierGroup[]): HTMLElement {
  const ids = [...selectedOrders]
  const supplierCount = new Set(
    ids
      .map((id) => {
        const o = data().orders.find((x) => x.id === id)
        return o ? supplierIdOf(o) : ''
      })
      .filter(Boolean),
  ).size
  const toolbar = el('div', 'toolbar')
  toolbar.innerHTML =
    '<div class="toolbar__actions">' +
    `<span class="hint">已勾选 <strong>${ids.length}</strong> 笔订单 · ${supplierCount} 家供应商</span>` +
    `<button class="btn btn-primary" data-act="submit"${ids.length ? '' : ' disabled'}>生成发送批次</button>` +
    '</div>' +
    `<span class="hint">共 ${groups.reduce((sum, g) => sum + g.orders.length, 0)} 笔订单、${groups.length} 家供应商；勾选品系行即可跨供应商汇总发送</span>`
  toolbar.querySelector('button[data-act="submit"]')?.addEventListener('click', submitBatch)
  return toolbar
}

function renderPendingGroup(group: SupplierGroup): HTMLElement {
  const panel = el('div', 'panel panel-table')
  const head = el('div', 'toolbar')
  head.innerHTML =
    `<div class="toolbar__actions"><strong>${supplierName(group.supplierId)}</strong>` +
    `<span class="hint">${group.orders.length} 笔订单 · 合计 ${moneyText(group.amountFen)}</span></div>` +
    '<div class="toolbar__actions"><button class="btn btn-default" data-act="detail">明细</button></div>'
  panel.appendChild(head)

  const rows = group.items
    .map((item) => {
      const all = item.orders.every((o) => selectedOrders.has(o.id))
      return (
        `<tr data-key="${item.key}">` +
        `<td><input type="checkbox" class="item-check" data-key="${item.key}"${all ? ' checked' : ''} aria-label="选择品系"></td>` +
        `<td>${item.itemName}</td><td>${item.spec}</td><td>${item.unit}</td>` +
        `<td style="text-align:right">${item.quantity}</td>` +
        `<td style="text-align:right">${item.priceFen === null ? '多价' : moneyText(item.priceFen)}</td>` +
        `<td style="text-align:right">${moneyText(item.amountFen)}</td>` +
        `<td style="text-align:right"><button class="btn-text" data-orders="${item.key}">${item.orderCount}</button></td></tr>`
      )
    })
    .join('')
  const table = el('div', 'table-wrap')
  table.innerHTML =
    '<table><thead><tr><th style="width:40px"><input type="checkbox" class="group-check" aria-label="全选"></th><th>品系</th><th>规格</th><th>单位</th><th style="text-align:right">数量合计</th><th style="text-align:right">单价（元）</th><th style="text-align:right">金额（元）</th><th style="text-align:right">来源订单数</th></tr></thead>' +
    `<tbody>${rows}</tbody></table>`
  panel.appendChild(table)

  const groupCheck = table.querySelector<HTMLInputElement>('input.group-check')
  groupCheck?.addEventListener('change', () => {
    if (groupCheck.checked) group.orders.forEach((o) => selectedOrders.add(o.id))
    else group.orders.forEach((o) => selectedOrders.delete(o.id))
    rerender()
  })

  table.querySelectorAll<HTMLInputElement>('input.item-check').forEach((cb) => {
    cb.addEventListener('change', () => {
      const item = group.items.find((i) => i.key === cb.dataset.key)
      if (!item) return
      if (cb.checked) item.orders.forEach((o) => selectedOrders.add(o.id))
      else item.orders.forEach((o) => selectedOrders.delete(o.id))
      rerender()
    })
  })

  table.querySelectorAll<HTMLButtonElement>('button[data-orders]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const item = group.items.find((i) => i.key === btn.dataset.orders)
      if (item) openItemOrders(item, group.supplierId)
    })
  })
  head.querySelector('button[data-act="detail"]')?.addEventListener('click', () => openGroupDetail(group))

  return panel
}

function submitBatch(): void {
  if (!selectedOrders.size) {
    toast('请先勾选要处理的订单', 'warning')
    return
  }
  runGuarded('purchase:send', () => {
    const orderIds = [...selectedOrders]
    const result = markOrdersSent(orderIds)
    if (!result.ok) {
      showResult(result)
      return
    }
    selectedOrders.clear()
    showResult(result)
    if (result.id) openSentResult(result.id)
    rerender()
  })
}

function openSentResult(batchId: string): void {
  const batch = data().purchaseBatches.find((b) => b.id === batchId)
  if (!batch) return
  const orders = data().orders.filter((o) => batch.orderIds.includes(o.id))
  const groups = groupBySupplier(orders)
  openDialog({
    title: '发送完成',
    bodyHtml: `<p>已生成发送批次，共 <strong>${batch.orderIds.length}</strong> 笔订单、<strong>${batch.supplierIds.length}</strong> 家供应商。</p>
      <p class="hint">可立即导出，也可稍后在「已处理」中按批次导出。</p>`,
    actions: [
      { text: '按供应商导出', onClick: () => exportBySupplier(groups) },
      { text: '打包 zip 导出', onClick: () => exportZip(groups) },
      { text: '关闭', primary: true },
    ],
  })
}

/* ---------------- 已处理（按批次） ---------------- */

function renderDoneTab(page: HTMLElement, batches: PurchaseBatch[]): void {
  if (!batches.length) {
    const empty = el('div', 'panel')
    empty.innerHTML = '<div class="state-area"><p class="state-area__text">还没有已处理的外购批次</p></div>'
    page.appendChild(empty)
    return
  }
  for (const batch of batches) {
    page.appendChild(renderBatchPanel(batch))
  }
}

function renderBatchPanel(batch: PurchaseBatch): HTMLElement {
  const orders = data().orders.filter((o) => batch.orderIds.includes(o.id))
  const groups = groupBySupplier(orders)
  const amount = orders.reduce((sum, o) => sum + orderAmount(o), 0)
  const supplierNames = batch.supplierIds.map((id) => supplierName(id)).join('、')

  const panel = el('div', 'panel panel-table')
  const head = el('div', 'toolbar')
  head.innerHTML =
    '<div class="toolbar__actions">' +
    '<strong>发送批次</strong>' +
    `<span class="hint">${batch.sentAt} · ${batch.operator}</span>` +
    `<span class="hint">${supplierNames}</span>` +
    `<span class="hint">${batch.orderIds.length} 笔订单 · 合计 ${moneyText(amount)}</span>` +
    tagHtml('已处理', 'success') +
    '</div>' +
    '<div class="toolbar__actions">' +
    '<button class="btn btn-default" data-act="detail">明细</button>' +
    '<button class="btn btn-default" data-act="export">按供应商导出</button>' +
    '<button class="btn btn-default" data-act="zip">打包 zip</button>' +
    '</div>'
  panel.appendChild(head)

  const rows = aggregatedRows(groups)
    .map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`)
    .join('')
  const headerCells = AGG_HEADER.map((h, i) => `<th${i >= 4 ? ' style="text-align:right"' : ''}>${h}</th>`).join('')
  const table = el('div', 'table-wrap')
  table.innerHTML =
    `<table><thead><tr>${headerCells}</tr></thead>` +
    `<tbody>${rows}</tbody></table>`
  panel.appendChild(table)

  head.querySelector('button[data-act="detail"]')?.addEventListener('click', () => openBatchDetail(batch))
  head.querySelector('button[data-act="export"]')?.addEventListener('click', () => exportBySupplier(groups))
  head.querySelector('button[data-act="zip"]')?.addEventListener('click', () => exportZip(groups))

  return panel
}

function openBatchDetail(batch: PurchaseBatch): void {
  const orders = data().orders.filter((o) => batch.orderIds.includes(o.id))
  const dlg = openDialog({
    title: `批次明细（${batch.sentAt}）`,
    bodyHtml: `<table><thead><tr><th>订单编号</th><th>供应商</th><th>品系</th><th>规格</th><th>数量</th><th>申请人</th><th style="text-align:right">金额（元）</th><th>操作</th></tr></thead><tbody>${orders
      .map(
        (o) =>
          `<tr><td>${o.code}</td><td>${supplierName(supplierIdOf(o))}</td><td>${o.itemName}</td><td>${o.spec}</td><td>${o.quantity}${o.unit}</td><td>${o.applicantName}</td><td style="text-align:right">${moneyText(
            orderAmount(o),
          )}</td><td><button class="btn-text" data-order-id="${o.id}">详情</button></td></tr>`,
      )
      .join('')}</tbody></table>`,
    wide: true,
    actions: [{ text: '关闭', primary: true }],
  })
  dlg.style.width = 'min(1080px, calc(100vw - 32px))'
  dlg.querySelectorAll<HTMLButtonElement>('button[data-order-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const order = orders.find((o) => o.id === btn.dataset.orderId)
      if (order) openOrderDetail(order)
    })
  })
}

/* ---------------- 导出 ---------------- */

const SUPPLIER_HEADER = ['品系', '规格', '单位', '数量', '单价（元）', '金额（元）']

function csvText(header: string[], rows: string[][]): string {
  return (
    '\uFEFF' +
    [header, ...rows]
      .map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\r\n')
  )
}

function supplierRows(group: SupplierGroup): string[][] {
  return group.items.map((item) => [
    item.itemName,
    item.spec,
    item.unit,
    String(item.quantity),
    item.priceFen === null ? '多价' : (item.priceFen / 100).toFixed(2),
    (item.amountFen / 100).toFixed(2),
  ])
}

/** 按供应商分别导出单个 CSV（一个供应商一个文件） */
function exportBySupplier(groups: SupplierGroup[]): void {
  if (!groups.length) {
    toast('当前没有可导出的数据', 'error')
    return
  }
  groups.forEach((group) => {
    downloadCSV(`外购清单_${supplierName(group.supplierId)}_${todayStr()}.csv`, SUPPLIER_HEADER, supplierRows(group))
  })
}

/** 打包 zip：多供应商合并为一个 zip（一个供应商一个 CSV 文件） */
function exportZip(groups: SupplierGroup[]): void {
  if (!groups.length) {
    toast('当前没有可导出的数据', 'error')
    return
  }
  const files = groups.map((group) => ({
    name: `外购清单_${supplierName(group.supplierId)}.csv`,
    content: csvText(SUPPLIER_HEADER, supplierRows(group)),
  }))
  downloadZip(`外购清单_${todayStr()}.zip`, files)
}

/* ---------------- 数据 ---------------- */

function pendingOrders(): Order[] {
  return data()
    .orders.filter((o) => o.kind === 'external' && o.labId === getCurrentUser().labId)
    .filter((o) => o.auditStatus === 'approved' && o.fulfillStatus !== 'sent')
}

function filteredOrders(): Order[] {
  let list = pendingOrders()
  const { supplierId, code } = view.filters
  if (supplierId) list = list.filter((o) => supplierIdOf(o) === supplierId)
  if (code) list = list.filter((o) => o.code.includes(code))
  return list
}

function supplierIdOf(order: Order): string {
  return order.supplierId || data().services.find((s) => s.id === order.serviceId)?.supplierId || ''
}

function supplierName(id: string): string {
  if (!id) return '未指定供应商'
  return data().suppliers.find((s) => s.id === id)?.name ?? '—'
}

function groupBySupplier(orders: Order[]): SupplierGroup[] {
  const map = new Map<string, Order[]>()
  for (const order of orders) {
    const sid = supplierIdOf(order) || 'unknown'
    const list = map.get(sid) ?? []
    list.push(order)
    map.set(sid, list)
  }
  return Array.from(map.entries()).map(([supplierId, list]) => ({
    supplierId,
    orders: list,
    amountFen: list.reduce((sum, o) => sum + orderAmount(o), 0),
    items: aggregateItems(list),
  }))
}

function orderAmount(order: Order): number {
  return order.confirmedAmountFen ?? order.quantity * order.unitPriceFen
}

function aggregateItems(orders: Order[]): AggregatedItem[] {
  const map = new Map<string, AggregatedItem>()
  for (const order of orders) {
    const key = `${order.itemName}|${order.spec}`
    const existing = map.get(key)
    if (existing) {
      existing.quantity += order.quantity
      existing.amountFen += orderAmount(order)
      existing.orderCount++
      existing.orders.push(order)
      if (existing.priceFen !== null && existing.priceFen !== order.unitPriceFen) existing.priceFen = null
    } else {
      map.set(key, {
        key,
        itemName: order.itemName,
        spec: order.spec,
        unit: order.unit,
        quantity: order.quantity,
        amountFen: orderAmount(order),
        orderCount: 1,
        priceFen: order.unitPriceFen,
        orders: [order],
      })
    }
  }
  return Array.from(map.values())
}

/* ---------------- 明细弹窗 ---------------- */

const AGG_HEADER = ['供应商', '品系', '规格', '单位', '数量', '单价（元）', '金额（元）']

function aggregatedRows(groups: SupplierGroup[]): string[][] {
  return groups.flatMap((group) =>
    group.items.map((item) => [
      supplierName(group.supplierId),
      item.itemName,
      item.spec,
      item.unit,
      String(item.quantity),
      item.priceFen === null ? '多价' : (item.priceFen / 100).toFixed(2),
      (item.amountFen / 100).toFixed(2),
    ]),
  )
}

function openItemOrders(item: AggregatedItem, supplierId: string): void {
  const dlg = openDialog({
    title: `来源订单（${supplierName(supplierId)}·${item.itemName}）`,
    bodyHtml: `<table><thead><tr><th>订单编号</th><th>规格</th><th>数量</th><th>申请人</th><th style="text-align:right">金额（元）</th><th>提交日期</th><th>操作</th></tr></thead><tbody>${item.orders
      .map(
        (o) =>
          `<tr><td>${o.code}</td><td>${o.spec}</td><td>${o.quantity}${o.unit}</td><td>${o.applicantName}</td><td style="text-align:right">${moneyText(
            orderAmount(o),
          )}</td><td>${o.createdAt}</td><td><button class="btn-text" data-order-id="${o.id}">详情</button></td></tr>`,
      )
      .join('')}</tbody></table>`,
    wide: true,
    actions: [{ text: '关闭', primary: true }],
  })
  dlg.style.width = 'min(1080px, calc(100vw - 32px))'
  dlg.querySelectorAll<HTMLButtonElement>('button[data-order-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const order = item.orders.find((o) => o.id === btn.dataset.orderId)
      if (order) openOrderDetail(order)
    })
  })
}

function openGroupDetail(group: SupplierGroup): void {
  const orders = group.orders
  const dlg = openDialog({
    title: `来源订单明细（${supplierName(group.supplierId)}）`,
    bodyHtml: `<table><thead><tr><th>订单编号</th><th>品系</th><th>规格</th><th>数量</th><th>申请人</th><th style="text-align:right">金额（元）</th><th>提交日期</th><th>操作</th></tr></thead><tbody>${orders
      .map(
        (o) =>
          `<tr><td>${o.code}</td><td>${o.itemName}</td><td>${o.spec}</td><td>${o.quantity}${o.unit}</td><td>${o.applicantName}</td><td style="text-align:right">${moneyText(
            orderAmount(o),
          )}</td><td>${o.createdAt}</td><td><button class="btn-text" data-order-id="${o.id}">详情</button></td></tr>`,
      )
      .join('')}</tbody></table>`,
    wide: true,
    actions: [{ text: '关闭', primary: true }],
  })
  dlg.style.width = 'min(1080px, calc(100vw - 32px))'
  dlg.querySelectorAll<HTMLButtonElement>('button[data-order-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const order = orders.find((o) => o.id === btn.dataset.orderId)
      if (order) openOrderDetail(order)
    })
  })
}
