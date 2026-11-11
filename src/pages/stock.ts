/** 库存管理：品目台账（按类别归档）、库存流水与盘点调整；类别为校级预置档案 */

import {
  adjustStock,
  batchStockCheck,
  categoryDef,
  categoryText,
  createStockItem,
  enabledCategories,
  importStockItems,
  stockIn,
  stockLoss,
  type StockImportRow,
} from '../core/biz/stock'
import { data, scoped } from '../core/data'
import { downloadCSV } from '../core/utils'
import { recentWeekRange } from '../core/utils'
import { openDetail as openOrderDetail } from './order'
import { openDetail as openFeedingDetail } from './feeding'
import type { StockCheck, StockFlow, StockItem } from '../types'
import type { PageDef } from '../router'
import { currentPath, currentQuery, rerender } from '../router'
import { el, openDialog, renderPager, renderTable, renderTabs, tagHtml, toast, type RowAction } from '../ui'
import { formDialog, pageShell, renderForm } from '../ui/form'
import { escapeHtml } from '../core/utils'
import { todayStr } from '../core/utils'
import { buildQuery, runGuarded, showResult } from './common'

type TabKey = 'item' | 'flow' | 'check'

const view = {
  tab: 'item' as TabKey,
  page: 1,
  pageSize: 10,
  low: currentQuery().low === '1',
  filters: {} as Record<string, string>,
  /** 流水筛选默认近一周 */
  flowFilters: recentWeekRange() as Record<string, string>,
  /** 盘点记录筛选默认近一周 */
  checkFilters: recentWeekRange() as Record<string, string>,
}

/** 上一次渲染的路由（含查询串）；变化时才从路由同步视图，本页交互重绘不重置 */
let routeKey = ''

function syncFromRoute(): void {
  if (routeKey === currentPath()) return
  routeKey = currentPath()
  const q = currentQuery()
  view.tab = 'item'
  view.page = 1
  view.filters = {}
  view.flowFilters = recentWeekRange()
  view.checkFilters = recentWeekRange()
  view.low = q.low === '1'
}

export const stockPage: PageDef = {
  title: '库存管理',
  render(host: HTMLElement) {
    syncFromRoute()
    const page = pageShell(host, {})

    renderTabs(
      page,
      [
        { key: 'item', text: '品目台账', count: scoped(data().stockItems).length },
        { key: 'flow', text: '库存流水', count: scoped(data().stockFlows).length },
        { key: 'check', text: '盘点记录', count: scoped(data().stockChecks).length },
      ],
      view.tab,
      (key) => {
        view.tab = key as TabKey
        view.page = 1
        rerender()
      },
    )

    if (view.tab === 'item') {
      const query = buildQuery(
        [
          { key: 'name', label: '品目名称', type: 'text' },
          {
            key: 'category',
            label: '类别',
            type: 'select',
            options: enabledCategories().map((c) => ({ value: c.id, label: c.name })),
          },
          { key: 'location', label: '存放位置', type: 'text' },
        ],
        view.filters,
        (values) => {
          view.filters = values
          view.page = 1
          rerender()
        },
        () => {
          view.filters = {}
          view.low = false
          view.page = 1
          rerender()
        },
      )
      page.appendChild(query.node)

      const toolbar = el('div', 'toolbar')
      toolbar.innerHTML =
        '<div class="toolbar__actions"><button class="btn btn-primary" data-act="in">入库登记</button>' +
        '<button class="btn btn-default" data-act="loss">损耗登记</button>' +
        '<button class="btn btn-default" data-act="check">盘点调整</button>' +
        '<button class="btn btn-default" data-act="create-item">新增品目</button>' +
        '<button class="btn btn-default" data-act="import">批量导入</button>' +
        `<button class="btn btn-default" data-act="low">${view.low ? '显示全部库存' : '只看预警品目'}</button></div>`
      toolbar.querySelector('button[data-act="create-item"]')?.addEventListener('click', () => runGuarded('stock:in', openCreateItem))
      toolbar.querySelector('button[data-act="import"]')?.addEventListener('click', () => runGuarded('stock:in', openImportItems))
      toolbar.querySelector('button[data-act="in"]')?.addEventListener('click', () => runGuarded('stock:in', openStockIn))
      toolbar.querySelector('button[data-act="loss"]')?.addEventListener('click', () => runGuarded('stock:loss', openStockLoss))
      toolbar.querySelector('button[data-act="check"]')?.addEventListener('click', () => runGuarded('stock:check', openCheck))
      toolbar.querySelector('button[data-act="low"]')?.addEventListener('click', () => {
        view.low = !view.low
        view.page = 1
        rerender()
      })
      renderByTab(page, toolbar)
      return
    }

    if (view.tab === 'flow') {
      const query = buildQuery(
        [
          { key: 'start', key2: 'end', label: '日期', type: 'daterange' },
          {
            key: 'type',
            label: '类型',
            type: 'select',
            options: [
              { value: 'in', label: '入库' },
              { value: 'out', label: '出库' },
              { value: 'loss', label: '损耗' },
              { value: 'check', label: '盘点调整' },
            ],
          },
          { key: 'name', label: '品目名称', type: 'text' },
          { key: 'operator', label: '操作人', type: 'text' },
        ],
        view.flowFilters,
        (values) => {
          view.flowFilters = values
          view.page = 1
          rerender()
        },
        () => {
          view.flowFilters = recentWeekRange()
          view.page = 1
          rerender()
        },
      )
      page.appendChild(query.node)

      const toolbar = el('div', 'toolbar')
      toolbar.innerHTML =
        '<div class="toolbar__actions"><button class="btn btn-default" data-act="export">导出 CSV</button></div>' +
        `<span class="hint">${flowSummary(flowRows())}</span>`
      toolbar.querySelector('button[data-act="export"]')?.addEventListener('click', () => exportFlows(flowRows()))
      renderByTab(page, toolbar)
      return
    }

    const query = buildQuery(
      [
        { key: 'start', key2: 'end', label: '日期', type: 'daterange' },
        { key: 'name', label: '品目名称', type: 'text' },
        { key: 'operator', label: '操作人', type: 'text' },
        {
          key: 'diff',
          label: '差异',
          type: 'select',
          options: [
            { value: 'yes', label: '有差异' },
            { value: 'no', label: '无差异' },
          ],
        },
      ],
      view.checkFilters,
      (values) => {
        view.checkFilters = values
        view.page = 1
        rerender()
      },
      () => {
        view.checkFilters = recentWeekRange()
        view.page = 1
        rerender()
      },
    )
    page.appendChild(query.node)

    const toolbar = el('div', 'toolbar')
    toolbar.innerHTML =
      '<div class="toolbar__actions">' +
      '<button class="btn btn-primary" data-act="batch-check">发起盘点</button>' +
      '<button class="btn btn-default" data-act="export-check">导出 CSV</button>' +
      '</div>' +
      `<span class="hint">${checkSummary(checkRows())}</span>`
    toolbar.querySelector('button[data-act="batch-check"]')?.addEventListener('click', () => runGuarded('stock:check', openBatchCheck))
    toolbar.querySelector('button[data-act="export-check"]')?.addEventListener('click', () => exportChecks(checkRows()))
    renderByTab(page, toolbar)
  },
}

function renderByTab(page: HTMLElement, toolbar: HTMLElement): void {
  // 规范 5／7 章：工具栏与表格共用一个白色容器
  const tableHost = el('div', 'panel panel-table')
  tableHost.appendChild(toolbar)
  if (view.tab === 'item') {
    const rows = paginate(itemRows())
    renderTable<StockItem>(
      tableHost,
      {
        cols: [
          { key: 'name', title: '品目', width: '180px' },
          { key: 'spec', title: '规格', ellipsis: true },
          { key: 'category', title: '类别', render: (r) => categoryText(r.category) },
          { key: 'location', title: '存放位置' },
          { key: 'quantity', title: '当前库存', align: 'right', render: (r) => `${r.quantity}${r.unit}` },
          { key: 'safe', title: '安全库存', align: 'right', render: (r) => `${r.safeStock}${r.unit}` },
          {
            key: 'warn',
            title: '状态',
            render: (r) => (r.quantity <= r.safeStock ? tagHtml('低于安全库存', 'warning') : tagHtml('正常', 'success')),
          },
        ],
        rows,
        actions: () => [{ text: '流水', act: 'flow' }, { text: '损耗', act: 'loss' }, { text: '盘点', act: 'check' }] as RowAction[],
        queryActive: Object.values(view.filters).some(Boolean) || view.low,
        emptyText: '暂无库存品目',
      },
      {
        onAction: (act, row) => {
          if (act === 'flow') openItemFlows(row)
          if (act === 'loss') runGuarded('stock:loss', () => openStockLoss(row))
          if (act === 'check') runGuarded('stock:check', () => openCheck(row))
        },
      },
    )
    page.appendChild(tableHost)
    renderPager(tableHost, {
      total: itemRows().length,
      page: view.page,
      pageSize: view.pageSize,
      onChange: (p, size) => {
        view.page = p
        view.pageSize = size
        rerender()
      },
    })
    return
  }

  if (view.tab === 'flow') {
    const rows = paginate(flowRows())
    renderTable<StockFlow>(
      tableHost,
      {
        cols: [
          { key: 'createdAt', title: '日期' },
          { key: 'item', title: '品目', render: (r) => itemName(r.itemId) },
          {
            key: 'type',
            title: '类型',
            render: (r) =>
              r.type === 'in'
                ? tagHtml('入库', 'success')
                : r.type === 'out'
                  ? tagHtml('出库', 'primary')
                  : r.type === 'loss'
                    ? tagHtml('损耗', 'danger')
                    : tagHtml('盘点调整', 'warning'),
          },
          { key: 'quantity', title: '数量变化', align: 'right', render: (r) => `${r.quantity > 0 ? '+' : ''}${r.quantity}` },
          { key: 'before', title: '变更前', align: 'right' },
          { key: 'after', title: '变更后', align: 'right' },
          {
            key: 'reason',
            title: '原因 / 关联',
            ellipsis: true,
            render: (r) => {
              if (!r.supplierId) return `${r.reason}`
              const item = r.supplierItemId ? data().supplierItems.find((i) => i.id === r.supplierItemId) : undefined
              return item ? `${r.reason}（${supplierName(r.supplierId)}·${item.name}）` : `${r.reason}（${supplierName(r.supplierId)}）`
            },
          },
          { key: 'operator', title: '操作人' },
        ],
        rows,
        actions: flowActions,
        emptyText: '暂无库存流水',
      },
      {
        onAction: (act, row) => openFlowSource(act, row),
      },
    )
    page.appendChild(tableHost)
    renderPager(tableHost, {
      total: flowRows().length,
      page: view.page,
      pageSize: view.pageSize,
      onChange: (p, size) => {
        view.page = p
        view.pageSize = size
        rerender()
      },
    })
    return
  }

  const rows = paginate(checkRows())
  renderTable<StockCheck>(
    tableHost,
    {
      cols: [
        { key: 'batchNo', title: '盘点单号', ellipsis: true, render: (r) => r.batchNo },
        { key: 'createdAt', title: '盘点时间' },
        { key: 'item', title: '品目', render: (r) => itemName(r.itemId) },
        { key: 'before', title: '账面数', align: 'right' },
        { key: 'counted', title: '实盘数', align: 'right' },
        {
          key: 'diff',
          title: '差异',
          align: 'right',
          render: (r) =>
            r.diff === 0
              ? '0'
              : r.diff > 0
                ? tagHtml(`盘盈 +${r.diff}`, 'warning')
                : tagHtml(`盘亏 ${r.diff}`, 'danger'),
        },
        { key: 'reason', title: '原因', ellipsis: true },
        { key: 'operator', title: '操作人' },
      ],
      rows,
      actions: () => [{ text: '流水', act: 'flow' }] as RowAction[],
      emptyText: '暂无盘点记录',
    },
    {
      onAction: (act, row) => {
        if (act === 'flow') openCheckFlow(row)
      },
    },
  )
  page.appendChild(tableHost)
  renderPager(tableHost, {
    total: checkRows().length,
    page: view.page,
    pageSize: view.pageSize,
    onChange: (p, size) => {
      view.page = p
      view.pageSize = size
      rerender()
    },
  })
}

function itemRows(): StockItem[] {
  let list = scoped(data().stockItems)
  if (view.filters.category) list = list.filter((s) => s.category === view.filters.category)
  if (view.filters.name) list = list.filter((s) => s.name.includes(view.filters.name))
  if (view.filters.location) list = list.filter((s) => s.location.includes(view.filters.location))
  if (view.low) list = list.filter((s) => s.quantity <= s.safeStock)
  return list
}

function paginate<T>(list: T[]): T[] {
  const start = (view.page - 1) * view.pageSize
  return list.slice(start, start + view.pageSize)
}

function itemName(itemId: string): string {
  return data().stockItems.find((s) => s.id === itemId)?.name ?? '—'
}

function supplierName(supplierId: string): string {
  return data().suppliers.find((s) => s.id === supplierId)?.name ?? '—'
}

const CHECK_REASONS = ['日常核对', '盘亏核实', '盘盈核实', '账目误差', '待查', '其他']
const SOURCE_TYPES = [
  { value: 'internal', label: '中心自产' },
  { value: 'supplier', label: '供应商到货' },
  { value: 'transfer', label: '调拨入库' },
  { value: 'other', label: '其他' },
]

function checkRows(): StockCheck[] {
  const f = view.checkFilters
  let list = scoped(data().stockChecks)
  if (f.start) list = list.filter((r) => r.createdAt.slice(0, 10) >= f.start)
  if (f.end) list = list.filter((r) => r.createdAt.slice(0, 10) <= f.end)
  if (f.name) list = list.filter((r) => itemName(r.itemId).includes(f.name))
  if (f.operator) list = list.filter((r) => r.operator.includes(f.operator))
  if (f.diff === 'yes') list = list.filter((r) => r.diff !== 0)
  if (f.diff === 'no') list = list.filter((r) => r.diff === 0)
  return list
}

function checkSummary(rows: StockCheck[]): string {
  const up = rows.filter((r) => r.diff > 0).reduce((sum, r) => sum + r.diff, 0)
  const down = rows.filter((r) => r.diff < 0).reduce((sum, r) => sum + r.diff, 0)
  const diffN = rows.filter((r) => r.diff !== 0).length
  return `共 ${rows.length} 条 · 有差异 ${diffN} 项 · 盘盈合计 +${up} · 盘亏合计 ${down}`
}

function exportChecks(rows: StockCheck[]): void {
  downloadCSV(
    '盘点记录.csv',
    ['盘点单号', '盘点时间', '品目', '账面数', '实盘数', '差异', '原因', '操作人'],
    rows.map((r) => [
      r.batchNo,
      r.createdAt,
      itemName(r.itemId),
      String(r.before),
      String(r.counted),
      `${r.diff > 0 ? '+' : ''}${r.diff}`,
      r.reason,
      r.operator,
    ]),
  )
}

function openCheckFlow(row: StockCheck): void {
  const flow = data().stockFlows.find((f) => f.id === row.flowId)
  openDialog({
    title: `盘点流水 ${itemName(row.itemId)}`,
    bodyHtml: flow
      ? `<table><thead><tr><th>日期</th><th>类型</th><th>数量</th><th>变更前</th><th>变更后</th><th>原因</th><th>操作人</th></tr></thead><tbody><tr><td>${flow.createdAt}</td><td>盘点调整</td><td>${flow.quantity > 0 ? '+' : ''}${flow.quantity}</td><td>${flow.before}</td><td>${flow.after}</td><td>${escapeHtml(flow.reason)}</td><td>${escapeHtml(flow.operator)}</td></tr></tbody></table>`
      : '<div class="state-area"><p class="state-area__text">未找到对应流水</p></div>',
    wide: true,
  })
}

function flowRows(): StockFlow[] {
  const f = view.flowFilters
  let list = scoped(data().stockFlows)
  if (f.start) list = list.filter((r) => r.createdAt.slice(0, 10) >= f.start)
  if (f.end) list = list.filter((r) => r.createdAt.slice(0, 10) <= f.end)
  if (f.type) list = list.filter((r) => r.type === f.type)
  if (f.name) list = list.filter((r) => itemName(r.itemId).includes(f.name))
  if (f.operator) list = list.filter((r) => r.operator.includes(f.operator))
  return list
}

function flowTypeText(t: StockFlow['type']): string {
  return t === 'in' ? '入库' : t === 'out' ? '出库' : t === 'loss' ? '损耗' : '盘点调整'
}

function flowSummary(rows: StockFlow[]): string {
  const total = (t: StockFlow['type']) => rows.filter((r) => r.type === t).reduce((sum, r) => sum + r.quantity, 0)
  const sign = (n: number) => `${n > 0 ? '+' : ''}${n}`
  return `共 ${rows.length} 条 · 入库合计 ${sign(total('in'))} · 出库合计 ${sign(total('out'))} · 损耗合计 ${sign(total('loss'))} · 盘点调整 ${sign(total('check'))}`
}

function flowActions(row: StockFlow): RowAction[] {
  if (row.refType === 'order') {
    const order = data().orders.find((o) => o.id === row.refId)
    return [{ text: order ? `查看订单 ${order.code}` : '查看订单', act: 'order' }]
  }
  if (row.refType === 'feeding') return [{ text: '查看饲养单', act: 'feeding' }]
  return []
}

function openFlowSource(act: string, row: StockFlow): void {
  if (act === 'order') {
    const order = data().orders.find((o) => o.id === row.refId)
    if (order) openOrderDetail(order)
  }
  if (act === 'feeding') {
    const feeding = data().feedings.find((f) => f.id === row.refId)
    if (feeding) openFeedingDetail(feeding)
  }
}

function exportFlows(rows: StockFlow[]): void {
  downloadCSV(
    '库存流水.csv',
    ['日期', '品目', '类型', '数量变化', '变更前', '变更后', '原因/关联', '操作人'],
    rows.map((r) => [
      r.createdAt,
      itemName(r.itemId),
      flowTypeText(r.type),
      String(r.quantity),
      String(r.before),
      String(r.after),
      r.reason,
      r.operator,
    ]),
  )
}

function itemOptions(): { value: string; label: string }[] {
  return scoped(data().stockItems).map((s) => ({
    value: s.id,
    label: `${categoryText(s.category)}｜${s.name}（现存 ${s.quantity}${s.unit}）`,
  }))
}

function openCreateItem(): void {
  formDialog(
    '新增物资品目建档',
    [
      { kind: 'note', text: '首次使用可批量导入现有台账，日常仅新物资需要建档。', full: true },
      {
        kind: 'select',
        key: 'category',
        label: '物资类别',
        required: true,
        options: enabledCategories().map((c) => ({ value: c.id, label: c.name })),
        value: view.filters.category || enabledCategories()[0]?.id || '',
        hint: '类别为校级预置档案；损耗登记的原因选项随类别提供',
      },
      { kind: 'text', key: 'name', label: '品目名称', required: true, placeholder: '如：普通级 实验树鼩、造模高脂饲料、不锈钢螺丝钉' },
      { kind: 'text', key: 'spec', label: '规格型号', required: true, placeholder: '如：SPF级 4周龄、20kg/袋、M4×20' },
      { kind: 'text', key: 'unit', label: '计量单位', required: true, placeholder: '如：只、袋、瓶、盒、包' },
      { kind: 'text', key: 'location', label: '存放库区/位置', placeholder: '如：A栋102室SPF饲养房、耗材库架02' },
      {
        kind: 'number',
        key: 'safeStock',
        label: '安全库存',
        value: '0',
        hint: '低于此数量触发预警；0 表示不预警，低值常备物资建议设置',
      },
      { kind: 'note', text: '建档后自动纳入库存台账，可立即办理入库进账，无需在此录入初始数量。', full: true },
    ],
    (values) => {
      const result = createStockItem({
        category: values.category,
        name: values.name,
        spec: values.spec,
        unit: values.unit,
        location: values.location,
        safeStock: Number(values.safeStock || 0),
      })
      showResult(result)
      if (result.ok) {
        view.filters.category = values.category
        view.page = 1
      }
      return result.ok
    },
    '确认建档',
  )
}

function openStockIn(): void {
  formDialog(
    '入库登记',
    [
      { kind: 'select', key: 'itemId', label: '库存品目', required: true, options: itemOptions() },
      { kind: 'number', key: 'quantity', label: '入库数量', required: true },
      { kind: 'date', key: 'at', label: '入库日期', required: true, value: todayStr(), hint: '补录历史入库时按实际日期填写' },
      {
        kind: 'select',
        key: 'sourceType',
        label: '来源类型',
        required: true,
        options: SOURCE_TYPES,
        value: 'internal',
        hint: '中心自产为内部来源；供应商到货需选择供应商',
      },
      {
        kind: 'select',
        key: 'supplierId',
        label: '供应商',
        options: scoped(data().suppliers).filter((s) => s.enabled).map((s) => ({ value: s.id, label: s.name })),
        hint: '来源为供应商到货时必选',
      },
      {
        kind: 'select',
        key: 'supplierItemId',
        label: '供应条目',
        options: [],
        hint: '选择供应商后加载其供应条目（品系/品种）',
      },
      { kind: 'text', key: 'reason', label: '入库来源 / 原因', required: true, full: true, placeholder: '如：供应商送货、中心自繁登记、调拨入库' },
    ],
    (values) => {
      const qty = Number(values.quantity)
      if (values.sourceType === 'supplier' && !values.supplierId) {
        toast('来源为供应商到货时必须选择供应商', 'warning')
        return false
      }
      if (values.sourceType === 'supplier' && !values.supplierItemId) {
        toast('来源为供应商到货时必须选择供应条目', 'warning')
        return false
      }
      const result = stockIn({
        itemId: values.itemId,
        quantity: qty,
        reason: values.reason.trim(),
        refType: 'manual',
        refId: values.itemId,
        at: values.at,
        sourceType: values.sourceType as 'internal' | 'supplier' | 'transfer' | 'other',
        supplierId: values.sourceType === 'supplier' ? values.supplierId : undefined,
        supplierItemId: values.sourceType === 'supplier' ? values.supplierItemId : undefined,
      })
      showResult(result)
      return result.ok
    },
    '确认入库',
    (formNode) => {
      const typeSel = formNode.querySelector<HTMLSelectElement>('[data-key="sourceType"]')
      const supplierSel = formNode.querySelector<HTMLSelectElement>('[data-key="supplierId"]')
      if (!typeSel || !supplierSel) return
      const itemSel = formNode.querySelector<HTMLSelectElement>('[data-key="supplierItemId"]')
      const fillItems = () => {
        if (!supplierSel || !itemSel) return
        const items = data().supplierItems.filter((i) => i.supplierId === supplierSel.value && i.enabled)
        itemSel.innerHTML =
          '<option value="">请选择供应条目</option>' +
          items
            .map((i) => `<option value="${i.id}">${escapeHtml(i.code)}｜${escapeHtml(i.name)}（${escapeHtml(i.spec)}）</option>`)
            .join('')
        itemSel.value = ''
      }
      const sync = () => {
        const isSupplier = typeSel.value === 'supplier'
        supplierSel.disabled = !isSupplier
        if (!isSupplier) {
          supplierSel.value = ''
          if (itemSel) itemSel.innerHTML = ''
        } else {
          fillItems()
        }
      }
      supplierSel.addEventListener('change', fillItems)
      typeSel.addEventListener('change', sync)
      sync()
    },
  )
}

/* ---------------- 批量导入 ---------------- */

/** 固定导入模板：表头 + 3 行示例；列顺序与页面说明一致 */
const IMPORT_TEMPLATE_ROWS = [
  ['类别', '品目名称', '规格型号', '计量单位', '存放位置', '安全库存', '期初数量'],
  ['实验动物', 'BALB/c小鼠', 'SPF级 6周龄', '只', '屏障环境 A 区', '10', '100'],
  ['饲料垫料', '辐照灭菌垫料', '5kg/包', 'kg', '耗材库房', '20', '80'],
  ['维修配件', '六角螺栓', 'M6×30', '盒', '维修间', '5', '30'],
]

function downloadTemplate(): void {
  const blob = new Blob(['\ufeff' + IMPORT_TEMPLATE_ROWS.map((r) => r.join(',')).join('\n')], {
    type: 'text/csv;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = '品目导入模板.csv'
  a.click()
  URL.revokeObjectURL(url)
}

/** 简单 CSV 解析：支持 BOM、引号包裹与逗号转义；返回按行的单元格数组 */
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"'
          i++
        } else {
          quoted = false
        }
      } else {
        cell += ch
      }
    } else if (ch === '"') {
      quoted = true
    } else if (ch === ',') {
      row.push(cell)
      cell = ''
    } else if (ch === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else if (ch !== '\r') {
      cell += ch
    }
  }
  if (cell !== '' || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows
}

function openImportItems(): void {
  const bodyHtml =
    '<p class="hint">1. 先下载固定模板（CSV，含 3 行示例，可直接覆盖为贵校实际台账）；2. 用 Excel 填好后另存为 CSV；3. 选择文件后点「开始导入」。</p>' +
    '<div class="toolbar__actions" style="margin:10px 0;gap:8px;align-items:center">' +
    '<button class="btn btn-default" data-act="tpl">下载导入模板（CSV）</button>' +
    '<input type="file" accept=".csv,text/csv" data-act="file" style="max-width:280px" />' +
    '</div>' +
    '<p class="hint">列顺序：类别｜品目名称｜规格型号｜计量单位｜存放位置｜安全库存｜期初数量。类别必须为系统已有类别名称；期初数量大于 0 时自动生成「期初库存导入」入库流水；同名同规格同类别视为重复行。</p>' +
    '<div data-act="result" style="margin-top:8px"></div>'
  const dlg = openDialog({
    title: '批量导入品目建档',
    bodyHtml,
    wide: true,
    actions: [
      { text: '取消' },
      {
        text: '开始导入',
        primary: true,
        keepOpen: true,
        onClick: () => {
          void runImport()
        },
      },
    ],
  })

  const resultBox = dlg.querySelector('[data-act="result"]') as HTMLElement
  const fileInput = dlg.querySelector('input[type="file"]') as HTMLInputElement
  dlg.querySelector('button[data-act="tpl"]')?.addEventListener('click', downloadTemplate)

  async function runImport(): Promise<void> {
    const file = fileInput.files?.[0]
    if (!file) {
      resultBox.innerHTML = '<p class="hint" style="color:#b91c1c">请先选择按模板填写的 CSV 文件</p>'
      return
    }
    const text = await file.text()
    const rawRows = parseCsv(text).filter((r) => r.some((c) => c.trim() !== ''))
    const hasHeader = rawRows[0]?.[0]?.trim() === '类别'
    const dataRows = hasHeader ? rawRows.slice(1) : rawRows
    if (!dataRows.length) {
      resultBox.innerHTML = '<p class="hint" style="color:#b91c1c">文件中没有可导入的数据行</p>'
      return
    }
    const rows: StockImportRow[] = dataRows.map((cells, i) => ({
      line: i + (hasHeader ? 2 : 1),
      categoryName: cells[0] ?? '',
      name: cells[1] ?? '',
      spec: cells[2] ?? '',
      unit: cells[3] ?? '',
      location: cells[4] ?? '',
      safeStock: cells[5] ?? '',
      initialQuantity: cells[6] ?? '',
    }))
    const result = importStockItems(rows)
    const failedHtml = result.failed.length
      ? `<p class="hint" style="color:#b91c1c">失败明细：</p><table><thead><tr><th>行号</th><th>品目</th><th>原因</th></tr></thead><tbody>${result.failed
          .map((f) => `<tr><td>${f.line}</td><td>${escapeHtml(f.name)}</td><td>${escapeHtml(f.reason)}</td></tr>`)
          .join('')}</tbody></table>`
      : ''
    resultBox.innerHTML = `<p class="hint">${escapeHtml(result.message)}</p>${failedHtml}`
    toast(result.message, result.created > 0 ? (result.failed.length ? 'warning' : 'success') : 'error')
    if (result.created > 0) rerender()
  }
}

function openBatchCheck(): void {
  const items = scoped(data().stockItems)
    .slice()
    .sort((a, b) => (a.category === b.category ? a.name.localeCompare(b.name) : a.category.localeCompare(b.category)))
  const rowsHtml = items
    .map(
      (s) =>
        `<tr><td>${escapeHtml(s.name)}</td><td>${escapeHtml(categoryText(s.category))}</td>` +
        `<td style="text-align:right">${s.quantity}${s.unit}</td>` +
        `<td><input type="number" min="0" step="1" data-item="${s.id}" data-before="${s.quantity}" value="${s.quantity}" style="width:110px" /></td>` +
        `<td data-diff="${s.id}" style="text-align:right">0</td></tr>`,
    )
    .join('')
  const dlg = openDialog({
    title: '发起盘点',
    bodyHtml:
      '<p class="hint">实盘数与账面数不一致时生成差异流水；一致也会留痕（零差异记录）。日常死亡、过期、损坏请先用「损耗登记」。</p>' +
      '<div class="form-grid" style="grid-template-columns:repeat(2,minmax(0,1fr));margin:10px 0">' +
      '<div class="field"><span class="field__label">盘点原因 *</span><select data-key="reason">' +
      CHECK_REASONS.map((r) => `<option value="${escapeHtml(r)}"${r === '日常核对' ? ' selected' : ''}>${escapeHtml(r)}</option>`).join('') +
      '</select></div>' +
      '<div class="field"><span class="field__label">说明</span><input type="text" data-key="note" placeholder="可选，如：3 号笼盘亏 2 只" /></div>' +
      '</div>' +
      `<table><thead><tr><th>品目</th><th>类别</th><th style="text-align:right">账面数</th><th>实盘数</th><th style="text-align:right">差异</th></tr></thead><tbody>${rowsHtml}</tbody></table>`,
    wide: true,
    actions: [
      { text: '取消' },
      {
        text: '提交盘点',
        primary: true,
        keepOpen: true,
        onClick: () => {
          const reasonSelect = dlg.querySelector<HTMLSelectElement>('select[data-key="reason"]')!
          const noteInput = dlg.querySelector<HTMLInputElement>('input[data-key="note"]')!
          const reason = noteInput.value.trim() ? `${reasonSelect.value}（${noteInput.value.trim()}）` : reasonSelect.value
          const entries: { itemId: string; counted: number }[] = []
          for (const input of Array.from(dlg.querySelectorAll<HTMLInputElement>('input[data-item]'))) {
            const raw = input.value.trim()
            const counted = Number(raw)
            if (raw === '' || !Number.isInteger(counted) || counted < 0) {
              toast(`实盘数必须为非负整数：${items.find((s) => s.id === input.dataset.item)?.name ?? ''}`, 'error')
              return
            }
            entries.push({ itemId: input.dataset.item!, counted })
          }
          const result = batchStockCheck({ entries, reason })
          showResult(result)
          if (result.ok) dlg.close()
        },
      },
    ],
  })

  const refresh = () => {
    dlg.querySelectorAll<HTMLInputElement>('input[data-item]').forEach((input) => {
      const cell = dlg.querySelector<HTMLElement>(`[data-diff="${input.dataset.item}"]`)
      if (!cell) return
      const n = Number(input.value)
      const diff = Number.isFinite(n) ? n - Number(input.dataset.before) : NaN
      cell.textContent = Number.isNaN(diff) ? '—' : `${diff > 0 ? '+' : ''}${diff}`
      cell.style.color = diff > 0 ? '#b45309' : diff < 0 ? '#b91c1c' : ''
    })
  }
  dlg.querySelectorAll<HTMLInputElement>('input[data-item]').forEach((input) => input.addEventListener('input', refresh))
  refresh()
}

function openStockLoss(target?: StockItem): void {
  const items = scoped(data().stockItems)
  const current = target ? items.find((s) => s.id === target.id) : undefined
  const form = renderForm([
    {
      kind: 'select',
      key: 'itemId',
      label: '库存品目',
      required: true,
      options: itemOptions(),
      value: current?.id ?? '',
      disabled: !!current,
    },
    { kind: 'number', key: 'quantity', label: '损耗数量', required: true },
    { kind: 'select', key: 'reason', label: '损耗原因', required: true, options: [], hint: '原因选项随品目类别提供' },
    { kind: 'textarea', key: 'note', label: '补充说明', full: true, placeholder: '可选，如：3号繁殖笼死亡 2 只' },
    {
      kind: 'note',
      text: '损耗登记即时扣减库存并生成流水，不关联订单、不产生费用；日常死亡、淘汰、过期、损坏、丢失请及时登记，盘点仅处理登记后仍存在的差异。',
      full: true,
    },
  ])

  // 选择品目后，损耗原因按该品目类别档案切换
  const itemSel = form.node.querySelector<HTMLSelectElement>('[data-key="itemId"]')
  const reasonSel = form.node.querySelector<HTMLSelectElement>('[data-key="reason"]')
  const refreshReasons = () => {
    const item = items.find((s) => s.id === itemSel?.value)
    const reasons = item ? categoryDef(item.category)?.lossReasons ?? [] : []
    reasonSel!.innerHTML = reasons.map((r) => `<option value="${escapeHtml(r)}">${escapeHtml(r)}</option>`).join('')
    reasonSel!.value = reasons[0] ?? ''
  }
  itemSel?.addEventListener('change', refreshReasons)
  refreshReasons()

  const dlg = openDialog({
    title: '损耗登记',
    bodyHtml: '',
    wide: true,
    actions: [
      { text: '取消' },
      {
        text: '确认登记',
        primary: true,
        keepOpen: true,
        onClick: () => {
          const values = form.values()
          let ok = true
          if (!values.itemId) {
            form.setError('itemId', '库存品目不能为空')
            ok = false
          }
          if (!values.quantity) {
            form.setError('quantity', '损耗数量不能为空')
            ok = false
          }
          if (!values.reason) {
            form.setError('reason', '损耗原因不能为空')
            ok = false
          }
          if (!ok) return
          const reason = values.note ? `${values.reason}（${values.note}）` : values.reason
          const result = stockLoss({ itemId: values.itemId, quantity: Number(values.quantity), reason })
          showResult(result)
          if (!result.ok) return
          dlg.close()
        },
      },
    ],
  })
  const body = dlg.querySelector('.dlg__body') as HTMLElement
  body.appendChild(form.node)
}

function openCheck(item?: StockItem): void {
  const current = item ? scoped(data().stockItems).find((s) => s.id === item.id) : undefined
  formDialog(
    '盘点调整',
    [
      {
        kind: 'select',
        key: 'itemId',
        label: '库存品目',
        required: true,
        options: itemOptions(),
        value: current?.id ?? '',
        disabled: !!current,
      },
      {
        kind: 'number',
        key: 'quantity',
        label: '实盘数量',
        required: true,
        value: current ? String(current.quantity) : '',
        hint: current ? `账面 ${current.quantity}${current.unit}` : undefined,
      },
      {
        kind: 'select',
        key: 'reason',
        label: '盘点原因',
        required: true,
        options: CHECK_REASONS.map((r) => ({ value: r, label: r })),
        value: '日常核对',
      },
      { kind: 'text', key: 'note', label: '说明', placeholder: '可选，如：3 号笼盘亏 2 只' },
      {
        kind: 'note',
        text: '日常死亡、淘汰、过期、损坏、丢失请先走损耗登记，盘点只处理登记后仍存在的差异；以实盘数为准生成差异流水，不能调整为负库存。',
        full: true,
      },
    ],
    (values) => {
      const qty = Number(values.quantity)
      const reason = values.note?.trim() ? `${values.reason}（${values.note.trim()}）` : values.reason
      const result = adjustStock({
        itemId: values.itemId,
        quantity: qty,
        reason,
        refType: 'check',
        refId: values.itemId,
      })
      showResult(result)
      return result.ok
    },
    '保存盘点',
  )
}

function openItemFlows(item: StockItem): void {
  const flows = data().stockFlows.filter((f) => f.itemId === item.id)
  openDialog({
    title: `流水明细 ${item.name}`,
    bodyHtml: flows.length
      ? `<table><thead><tr><th>日期</th><th>类型</th><th>数量</th><th>变更后</th><th>原因</th></tr></thead><tbody>${flows
          .map(
            (f) =>
              `<tr><td>${f.createdAt}</td><td>${
                f.type === 'in' ? '入库' : f.type === 'out' ? '出库' : f.type === 'loss' ? '损耗' : '盘点'
              }</td><td>${f.quantity > 0 ? '+' : ''}${f.quantity}</td><td>${f.after}</td><td>${escapeHtml(
                f.reason,
              )}</td></tr>`,
          )
          .join('')}</tbody></table>`
      : '<div class="state-area"><p class="state-area__text">该品目暂无流水</p></div>',
    wide: true,
  })
}
