/** 外购汇总：把外购订单按供应商分开，每个供应商内按品系汇总数量，导出 CSV 发供应商 */

import { listSuppliers, markOrdersSent } from '../core/biz/purchase'
import { data } from '../core/data'
import { getCurrentUser } from '../core/auth'
import type { Order } from '../types'
import { downloadCSV, moneyText, todayStr } from '../core/utils'
import type { PageDef } from '../router'
import { rerender } from '../router'
import { el, openDialog, renderTabs, tagHtml } from '../ui'
import { pageShell } from '../ui/form'
import { buildQuery, runGuarded, showResult } from './common'
import { openDetail as openOrderDetail } from './order'

type TabKey = 'pending' | 'done'

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

export const purchasePage: PageDef = {
  title: '外购汇总',
  render(host: HTMLElement) {
    const page = pageShell(host, {})

    const pending = currentOrders('pending')
    const done = currentOrders('done')
    renderTabs(
      page,
      [
        { key: 'pending', text: '未处理', count: pending.length },
        { key: 'done', text: '已处理', count: done.length },
      ],
      view.tab,
      (key) => {
        view.tab = key as TabKey
        rerender()
      },
    )

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

    const toolbar = el('div', 'toolbar')
    toolbar.innerHTML =
      '<div class="toolbar__actions">' +
      `<button class="btn btn-primary" data-act="export-all">${view.tab === 'pending' ? '导出未处理清单' : '导出已处理清单'}</button>` +
      '</div>' +
      `<span class="hint">共 ${groups.reduce((sum, g) => sum + g.orders.length, 0)} 笔订单、${groups.length} 家供应商；同一供应商内按品系合并数量</span>`
    toolbar.querySelector('button[data-act="export-all"]')?.addEventListener('click', () => {
      exportAll(groups, view.tab === 'pending' ? '外购未处理清单' : '外购已处理清单')
    })
    page.appendChild(toolbar)

    if (!groups.length) {
      const empty = el('div', 'panel')
      empty.innerHTML = `<div class="state-area"><p class="state-area__text">${
        view.tab === 'pending' ? '没有未处理的外购订单' : '还没有已处理的外购订单'
      }</p></div>`
      page.appendChild(empty)
      return
    }

    for (const group of groups) {
      page.appendChild(renderSupplierGroup(group))
    }
  },
}

function renderSupplierGroup(group: SupplierGroup): HTMLElement {
  const panel = el('div', 'panel panel-table')
  const head = el('div', 'toolbar')
  const statusTag = view.tab === 'pending' ? tagHtml('未处理', 'warning') : tagHtml('已处理（已发供应商）', 'success')
  head.innerHTML =
    `<div class="toolbar__actions"><strong>${supplierName(group.supplierId)}</strong>` +
    `<span class="hint">${group.orders.length} 笔订单 · 合计 ${moneyText(group.amountFen)}</span>` +
    statusTag +
    '</div>' +
    `<div class="toolbar__actions"><button class="btn btn-default" data-act="detail">明细</button>` +
    '<button class="btn btn-default" data-act="export">导出 CSV</button>' +
    (view.tab === 'pending' ? '<button class="btn btn-primary" data-act="send">标记已处理</button>' : '') +
    '</div>'
  panel.appendChild(head)

  const rows = group.items
    .map(
      (item) =>
        `<tr><td>${item.itemName}</td><td>${item.spec}</td><td>${item.unit}</td>` +
        `<td style="text-align:right">${item.quantity}</td>` +
        `<td style="text-align:right">${item.priceFen === null ? '多价' : moneyText(item.priceFen)}</td>` +
        `<td style="text-align:right">${moneyText(item.amountFen)}</td>` +
        `<td style="text-align:right"><button class="btn-text" data-orders="${item.key}">${item.orderCount}</button></td></tr>`,
    )
    .join('')
  const table = el('div', 'table-wrap')
  table.innerHTML =
    '<table><thead><tr><th>品系</th><th>规格</th><th>单位</th><th style="text-align:right">数量合计</th><th style="text-align:right">单价（元）</th><th style="text-align:right">金额（元）</th><th style="text-align:right">来源订单数</th></tr></thead>' +
    `<tbody>${rows}</tbody></table>`
  panel.appendChild(table)

  table.querySelectorAll<HTMLButtonElement>('button[data-orders]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const item = group.items.find((i) => i.key === btn.dataset.orders)
      if (item) openItemOrders(item, group.supplierId)
    })
  })
  head.querySelector('button[data-act="detail"]')?.addEventListener('click', () => openGroupDetail(group))
  head.querySelector('button[data-act="export"]')?.addEventListener('click', () => exportOneGroup(group))
  head.querySelector('button[data-act="send"]')?.addEventListener('click', () =>
    runGuarded('purchase:send', () => {
      const result = markOrdersSent(group.orders.map((o) => o.id))
      showResult(result)
      rerender()
    }),
  )
  return panel
}

/* ---------------- 数据 ---------------- */

function currentOrders(kind: TabKey): Order[] {
  const all = data().orders.filter((o) => o.kind === 'external' && o.labId === getCurrentUser().labId)
  return all.filter((o) =>
    kind === 'done' ? o.fulfillStatus === 'sent' : o.auditStatus === 'approved' && o.fulfillStatus !== 'sent',
  )
}

function filteredOrders(): Order[] {
  let list = currentOrders(view.tab)
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

/* ---------------- 导出与明细 ---------------- */

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

function exportAll(groups: SupplierGroup[], name: string): void {
  const rows = aggregatedRows(groups)
  if (!rows.length) {
    showResult({ ok: false, message: '当前列表没有可导出的订单' })
    return
  }
  downloadCSV(`${name}_${todayStr()}.csv`, AGG_HEADER, rows)
}

function exportOneGroup(group: SupplierGroup): void {
  downloadCSV(`外购清单_${supplierName(group.supplierId)}_${todayStr()}.csv`, AGG_HEADER, aggregatedRows([group]))
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
