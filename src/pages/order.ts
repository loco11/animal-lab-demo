/** 统一订单：三种类型共用一个列表，按类型显示可执行动作 */

import {
  approveOrder,
  confirmExternalAmount,
  createAgentOrder,
  listOrders,
  orderById,
  rejectOrder,
  selectableServices,
  shipOrder,
} from '../core/biz/orders'
import { generateExternalFee, plainFeeOf } from '../core/biz/fee'
import { markOrdersSent } from '../core/biz/purchase'
import { entryFeeding, freeCages } from '../core/biz/feeding'
import { AUDIT_MODE_TEXT, AUDIT_STATUS_TEXT, FULFILL_TEXT, KIND_TEXT, auditTone, fulfillTone } from '../core/labels'
import { data, scoped } from '../core/data'
import { downloadCSV, moneyText, parseYuan, todayStr } from '../core/utils'
import type { Order, OrderKind } from '../types'
import type { PageDef } from '../router'
import { currentPath, currentQuery, navigate, rerender, routePath } from '../router'
import { el, openDialog, renderPager, renderTable, renderTabs, tagHtml, toast, type RowAction, type TableColumn } from '../ui'
import { detailGrid, formDialog, historyTable, pageShell } from '../ui/form'
import { buildQuery, runGuarded, showResult, type QueryField } from './common'

type TabKey = 'all' | OrderKind

export interface OrderListView {
  tab: TabKey
  page: number
  pageSize: number
  filters: Record<string, string>
}

const view: OrderListView = {
  tab: (currentQuery().kind as TabKey) || 'all',
  page: 1,
  pageSize: 10,
  filters: {
    ...{ code: '', applicant: '', fulfill: '' },
    ...(currentQuery().fulfill ? { fulfill: currentQuery().fulfill } : {}),
  } as Record<string, string>,
}

/** 上一次渲染的路由（含查询串）；变化时才从路由同步视图，本页交互重绘不重置 */
let routeKey = ''

function syncFromRoute(): void {
  if (routeKey === currentPath()) return
  routeKey = currentPath()
  const q = currentQuery()
  const isInternalPage = routePath() === '/order/internal'
  view.filters = { code: '', applicant: '', fulfill: q.fulfill ?? (isInternalPage ? 'pending_out' : ''), sent: '' }
  view.tab = isInternalPage ? 'internal' : (q.kind as TabKey) || 'all'
  view.page = 1
}

export const orderPage: PageDef = {
  title: '订单管理',
  render(host: HTMLElement) {
    syncFromRoute()
    const isInternalPage = routePath() === '/order/internal'
    const page = pageShell(host, {
    })

    // 独立「内部动物订购」页不渲染类型页签，页面身份由左侧菜单体现
    if (!isInternalPage) {
      // 暂只保留「全部订单」单一页签；内部动物订购已拆独立菜单，外购动物走采购模块，后续按需恢复
      view.tab = 'all'
      const all = allOrders()
      renderTabs(
        page,
        [{ key: 'all', text: '全部订单', count: all.length }],
        view.tab,
        (key) => {
          view.tab = key as TabKey
          view.page = 1
          rerender()
        },
      )
    }

    renderOrderList(page, view, { defaultFulfillOnReset: isInternalPage ? 'pending_out' : '' })
  },
}

/** 订单列表主体：查询区 + 工具栏 + 表格 + 分页（页签栏由各页面自行渲染） */
export function renderOrderList(container: HTMLElement, v: OrderListView, opts: { defaultFulfillOnReset: string }): void {
  const queryFields: QueryField[] = [
    { key: 'code', label: '订单编号', type: 'text' },
    { key: 'applicant', label: '姓名', type: 'text' },
  ]
  if (v.tab === 'internal') {
    queryFields.push({
      key: 'fulfill',
      label: '履约',
      type: 'select',
      options: [
        { value: 'pending_out', label: FULFILL_TEXT.pending_out },
        { value: 'completed', label: FULFILL_TEXT.completed },
      ],
    })
  }
  if (v.tab === 'external') {
    queryFields.push({
      key: 'sent',
      label: '发送状态',
      type: 'select',
      options: [
        { value: 'unsent', label: '未发送' },
        { value: 'sent', label: '已发送' },
      ],
    })
  }
  const query = buildQuery(
    queryFields,
    v.filters,
    (values) => {
      v.filters = values
      v.page = 1
      rerender()
    },
    () => {
      v.filters = { code: '', applicant: '', fulfill: opts.defaultFulfillOnReset, sent: '' }
      v.page = 1
      rerender()
    },
  )
  container.appendChild(query.node)

  const toolbar = el('div', 'toolbar')
  toolbar.innerHTML =
    '<div class="toolbar__actions">' +
    '<button class="btn btn-primary" data-act="agent-external">代录入外部订单</button>' +
    '<button class="btn btn-default" data-act="mobile" style="color:#16529b;border-color:#cbd5e1;background:#f0f5fb;font-weight:600;display:none">移动办事端 (企业微信)</button>' +
    '<button class="btn btn-default" data-act="export">导出数据</button></div>'
  toolbar.querySelector('button[data-act="agent-external"]')?.addEventListener('click', () => {
    runGuarded('order:create', () => openAgentExternalOrder())
  })
  toolbar.querySelector('button[data-act="mobile"]')?.addEventListener('click', () => {
    navigate('/mobile')
  })
  toolbar.querySelector('button[data-act="export"]')?.addEventListener('click', () => {
    const list = filteredList(v)
    if (!list.length) {
      toast('当前列表没有可导出的订单', 'error')
      return
    }
    const rows = list.map((o) => {
      const sid = o.supplierId || (o.kind === 'external' ? data().services.find((s) => s.id === o.serviceId)?.supplierId : undefined)
      return [
        o.code,
        KIND_TEXT[o.kind],
        o.itemName,
        o.spec,
        String(o.quantity),
        o.unit,
        o.applicantName,
        o.applicantOrg,
        sid ? supplierName(sid) : '—',
        AUDIT_STATUS_TEXT[o.auditStatus],
        FULFILL_TEXT[o.fulfillStatus],
        (o.unitPriceFen / 100).toFixed(2),
        ((o.confirmedAmountFen ?? o.quantity * o.unitPriceFen) / 100).toFixed(2),
        o.createdAt,
      ]
    })
    const name = v.tab === 'internal' ? '内部动物订购清单' : v.tab === 'external' ? '外购订单清单' : '订单清单'
    downloadCSV(
      `${name}_${todayStr()}.csv`,
      ['订单编号', '类型', '品目', '规格', '数量', '单位', '申请人', '申请单位', '供应商', '审核状态', '发送/履约状态', '单价（元）', '金额（元）', '提交日期'],
      rows,
    )
    toast(`已导出 ${list.length} 条`, 'success')
  })

  const rows = paginate(v, filteredList(v))
  // 规范 5／7 章：工具栏与表格共用一个白色容器
  const tableHost = el('div', 'panel panel-table')
  tableHost.appendChild(toolbar)
  const applicantCols: TableColumn<Order>[] = [
    { key: 'code', title: '订单编号' },
    { key: 'name', title: '姓名', render: (r) => applicantPureName(r) },
    { key: 'no', title: '学工号', render: (r) => r.applicantNo ?? '—' },
    { key: 'college', title: '学院', render: (r) => r.college ?? r.applicantOrg ?? '—' },
    { key: 'phone', title: '手机号', render: (r) => r.applicantPhone ?? '—' },
    { key: 'item', title: '品目 / 规格', ellipsis: true, render: (r) => `${r.itemName}｜${r.spec}` },
  ]
  const bizCols: TableColumn<Order>[] = [
    { key: 'quantity', title: '数量', align: 'right', render: (r) => `${r.quantity}` },
    { key: 'unit', title: '单位', render: (r) => r.unit },
    { key: 'amount', title: '金额（元）', align: 'right', render: (r) => moneyText(r.confirmedAmountFen ?? r.quantity * r.unitPriceFen) },
    { key: 'status', title: '状态', render: (r) => tagHtml(FULFILL_TEXT[r.fulfillStatus], fulfillTone(r.fulfillStatus)) },
    { key: 'createdAt', title: '提交日期' },
  ]
  const supplierCol: TableColumn<Order> = {
    key: 'supplier',
    title: '供应商',
    render: (r) => supplierName(r.supplierId || data().services.find((s) => s.id === r.serviceId)?.supplierId),
  }
  const cols: TableColumn<Order>[] =
    v.tab === 'internal'
      ? [...applicantCols, ...bizCols]
      : v.tab === 'external'
        ? [...applicantCols, supplierCol, ...bizCols]
        : [
            { key: 'code', title: '订单编号' },
            { key: 'kind', title: '类型', render: (r) => KIND_TEXT[r.kind] },
            {
              key: 'item',
              title: '品目 / 规格',
              ellipsis: true,
              render: (r) => {
                const sid = r.supplierId || (r.kind === 'external' ? data().services.find((s) => s.id === r.serviceId)?.supplierId : undefined)
                const supHint = sid ? `<br><span class="hint" style="color:#0369a1;">发往：${supplierName(sid)}</span>` : ''
                return `${r.itemName}｜${r.spec}${supHint}`
              },
            },
            { key: 'quantity', title: '数量', align: 'right', render: (r) => `${r.quantity}${r.unit}` },
            { key: 'price', title: '单价（元）', align: 'right', render: (r) => moneyText(r.unitPriceFen) },
            {
              key: 'amount',
              title: '金额（元）',
              align: 'right',
              render: (r) => moneyText(r.confirmedAmountFen ?? r.quantity * r.unitPriceFen),
            },
            { key: 'applicant', title: '申请人', render: (r) => `${r.applicantName}<br><span class="hint">${r.applicantOrg}</span>` },
            {
              key: 'source',
              title: '来源',
              render: (r) => (r.source === 'agent' ? tagHtml('代录', 'primary') : tagHtml('使用端', 'default')),
            },
            { key: 'auditMode', title: '审核方式', render: (r) => AUDIT_MODE_TEXT[r.auditMode] },
            { key: 'auditStatus', title: '审核', render: (r) => tagHtml(AUDIT_STATUS_TEXT[r.auditStatus], auditTone(r.auditStatus)) },
            { key: 'fulfill', title: '履约', render: (r) => tagHtml(FULFILL_TEXT[r.fulfillStatus], fulfillTone(r.fulfillStatus)) },
            { key: 'createdAt', title: '提交日期' },
          ]
  renderTable<Order>(
    tableHost,
    {
      cols,
      rows,
      actions: rowActions,
      queryActive: Object.values(v.filters).some(Boolean),
      emptyText: '没有符合条件的订单',
    },
    {
      onAction: (act, row) => handleAction(act, row),
    },
  )
  container.appendChild(tableHost)

  // 规范 2 章：分页在白色容器内、表格下方
  renderPager(tableHost, {
    total: filteredList(v).length,
    page: v.page,
    pageSize: v.pageSize,
    onChange: (p, size) => {
      v.page = p
      v.pageSize = size
      rerender()
    },
  })
}

/** 内部动物订购：从订单管理拆分出的独立菜单页（复用订单列表，锁定 internal 类型） */
export const internalOrderPage: PageDef = {
  title: '内部动物订购',
  render: (host: HTMLElement) => orderPage.render(host),
}

/* ---------------- 数据 ---------------- */

function allOrders(): Order[] {
  return listOrders()
}

function filteredList(v: OrderListView): Order[] {
  let list = allOrders()
  if (v.tab !== 'all') list = list.filter((o) => o.kind === v.tab)
  const { code, applicant, fulfill, sent } = v.filters
  if (code) list = list.filter((o) => o.code.includes(code))
  if (applicant) list = list.filter((o) => applicantPureName(o).includes(applicant))
  if (fulfill) list = list.filter((o) => o.fulfillStatus === fulfill)
  if (sent === 'sent') list = list.filter((o) => o.fulfillStatus === 'sent')
  if (sent === 'unsent') list = list.filter((o) => o.fulfillStatus !== 'sent')
  return list
}

function paginate<T>(v: OrderListView, list: T[]): T[] {
  const start = (v.page - 1) * v.pageSize
  return list.slice(start, start + v.pageSize)
}

/* ---------------- 行操作 ---------------- */

function applicantPureName(r: Order): string {
  return r.applicantName.includes('·') ? r.applicantName.split('·')[1] : r.applicantName
}

function rowActions(row: Order): RowAction[] {
  const acts: RowAction[] = []
  if (row.fulfillStatus === 'pending_out') {
    acts.push({ text: '出库', act: 'ship' })
  }
  acts.push({ text: '详情', act: 'detail' })
  return acts
}

function handleAction(act: string, row: Order): void {
  const fresh = orderById(row.id) ?? row
  switch (act) {
    case 'detail':
      openDetail(fresh)
      break
    case 'approve':
      runGuarded('order:approve', () => showResult(approveOrder(fresh.id)))
      break
    case 'approve_and_ship':
      runGuarded('order:outstock', () => {
        const approved = approveOrder(fresh.id)
        if (!approved.ok) {
          showResult(approved)
          return
        }
        showResult(shipOrder(fresh.id))
      })
      break
    case 'reject':
      runGuarded('order:reject', () => openReject(fresh))
      break
    case 'ship':
      runGuarded('order:outstock', () => showResult(shipOrder(fresh.id)))
      break
    case 'amount':
      runGuarded('order:approve', () => openAmount(fresh))
      break
    case 'genfee':
      runGuarded('fee:generate', () => showResult(generateExternalFee(fresh)))
      break
    case 'send_supplier':
      runGuarded('purchase:send', () => showResult(markOrdersSent([fresh.id])))
      break
    case 'entry':
      runGuarded('feeding:entry', () => openEntry(fresh))
      break
    default:
      break
  }
}

/* ---------------- 弹窗 ---------------- */

/** 管理员代录入外部（外购）订单：恢复 order:create 入口，调用 createAgentOrder（供订单、饲养等页面复用） */
export function openAgentExternalOrder(): void {
  // 仅列出已上架、已绑定入围供货商的外购（集采）服务，排除内部自产服务
  const services = selectableServices('external').filter((s) => s.supplierId)
  if (!services.length) {
    toast('暂无已上架的外购服务，请先在服务管理中维护', 'error')
    return
  }
  const customers = scoped(data().customers)
  const serviceOptions = services.map((s) => ({
    value: s.id,
    label: `${s.name}｜${s.spec}｜¥${(s.unitPriceFen / 100).toFixed(2)}/${s.unit}`,
  }))
  const customerOptions = [
    { value: '__new__', label: '新增外部客户（以下方「申请人」信息登记）' },
    ...customers.map((c) => ({ value: c.id, label: `${c.name}（${c.type === 'org' ? '单位' : '个人'}）` })),
  ]

  formDialog(
    '代录入外部订单',
    [
      {
        kind: 'select',
        key: 'serviceId',
        label: '外购服务',
        options: serviceOptions,
        required: true,
        hint: '仅显示已上架、已签约供货商的外购（集采）动物服务',
      },
      { kind: 'number', key: 'quantity', label: '数量', required: true },
      {
        kind: 'select',
        key: 'externalCustomerId',
        label: '外部客户',
        options: customerOptions,
        value: '__new__',
        hint: '外部客户不登录系统，由管理员代录登记',
      },
      { kind: 'text', key: 'applicantName', label: '申请人', required: true },
      { kind: 'text', key: 'applicantOrg', label: '申请单位' },
      { kind: 'text', key: 'phone', label: '联系电话' },
      { kind: 'date', key: 'expectDate', label: '期望日期' },
      { kind: 'textarea', key: 'remark', label: '备注' },
    ],
    (values) => {
      const quantity = parseInt(values.quantity, 10)
      if (!Number.isInteger(quantity) || quantity <= 0) {
        toast('数量必须为正整数', 'error')
        return false
      }
      const externalCustomerId =
        values.externalCustomerId && values.externalCustomerId !== '__new__' ? values.externalCustomerId : undefined
      const result = createAgentOrder({
        kind: 'external',
        serviceId: values.serviceId,
        quantity,
        applicantName: values.applicantName,
        applicantOrg: values.applicantOrg,
        externalCustomerId,
        newCustomerName: externalCustomerId ? undefined : values.applicantName,
        newCustomerContact: externalCustomerId ? undefined : values.applicantName,
        newCustomerPhone: externalCustomerId ? undefined : values.phone,
        expectDate: values.expectDate,
        remark: values.remark,
      })
      showResult(result)
      if (result.ok) rerender()
      return result.ok
    },
    '提交代录',
  )
}

function supplierName(id?: string): string {
  if (!id) return '—'
  return data().suppliers.find((s) => s.id === id)?.name ?? '—'
}

export function openDetail(order: Order): void {
  const customer = order.externalCustomerId
    ? data().customers.find((c) => c.id === order.externalCustomerId)
    : undefined
  const project = order.projectId ? data().projects.find((p) => p.id === order.projectId) : undefined
  const fee = plainFeeOf(order.id)
  const extSupplierId = order.supplierId || (order.kind === 'external' ? data().services.find((s) => s.id === order.serviceId)?.supplierId : undefined)

  const items: [string, string][] = [
    ['订单编号', order.code],
    ['类型', KIND_TEXT[order.kind]],
    ['来源', order.source === 'agent' ? '管理员代录' : '使用端申请'],
    ['服务 / 品目', `${order.serviceName}`],
    ['规格', order.spec],
    ['数量', `${order.quantity}${order.unit}`],
    ['确认单价（快照）', moneyText(order.unitPriceFen)],
    ['申请人', order.applicantName],
    ['申请人所属', order.applicantOrg],
  ]
  if (order.kind === 'external' && extSupplierId) {
    items.push(['外购签约供货商', `${supplierName(extSupplierId)}（厂商直送）`])
  }
  if (order.kind === 'breeding') {
    if (order.animalCount) items.push(['拟养只数', `${order.animalCount} 只`])
    if (order.feedDays) items.push(['拟饲养天数', `${order.feedDays} 天`])
    if (order.recommendedCages) items.push(['测算推荐笼数', `${order.recommendedCages} 笼`])
    if (order.iacucNo) items.push(['IACUC伦理编号', order.iacucNo])
    if (order.preFreezeAmountFen) {
      items.push([
        '科研经费冻结',
        `${moneyText(order.preFreezeAmountFen)}（${order.feeStatus === 'charged' ? '入住已正式扣缴·不退' : '已预先冻结'}）`,
      ])
    }
  }
  items.push(
    [order.kind === 'external' ? '外部客户（不登录系统）' : '经费项目', customer ? customer.name : project?.name ?? '—'],
    ['审核方式', AUDIT_MODE_TEXT[order.auditMode]],
    ['审核状态', tagHtml(AUDIT_STATUS_TEXT[order.auditStatus], auditTone(order.auditStatus))],
    ['履约状态', tagHtml(FULFILL_TEXT[order.fulfillStatus], fulfillTone(order.fulfillStatus))],
    ['期望日期', order.expectDate ?? '—'],
    ['备注', order.remark ?? '—'],
    ['已生成费用', fee ? moneyText(fee.amountFen) : '未生成'],
  )

  const grid = detailGrid(items)

  const dlg = openDialog({
    title: `订单详情 ${order.code}`,
    bodyHtml: '',
    wide: true,
    actions: [
      { text: '查看费用', onClick: () => navigate('/fee') },
      { text: '关闭', primary: true },
    ],
  })
  const body = dlg.querySelector('.dlg__body') as HTMLElement
  grid.style.margin = '0 0 16px'
  body.appendChild(grid)
  historyTable(
    body,
    order.history.map((h) => [h.at, h.actor, h.action, h.note ?? '']),
  )
}

function openReject(order: Order): void {
  formDialog(
    `退回报废申请 ${order.code}`,
    [
      { kind: 'textarea', key: 'reason', label: '退回原因', required: true },
      { kind: 'note', text: '退回后订单不能出库、发送或入场；原因会记入订单历史。', full: true },
    ],
    (values) => {
      const result = rejectOrder(order.id, values.reason)
      showResult(result)
      return result.ok
    },
    '确认退回',
  )
}

function openAmount(order: Order): void {
  formDialog(
    `确认外购订单金额 ${order.code}`,
    [
      {
        kind: 'text',
        key: 'amount',
        label: '发生金额（元）',
        value: order.confirmedAmountFen ? String(order.confirmedAmountFen / 100) : String((order.quantity * order.unitPriceFen) / 100),
        required: true,
      },
      { kind: 'note', text: '外购费用按管理员确认的规格、数量及单价形成；后续出现的少供或死亡不自动改写本金额。', full: true },
    ],
    (values) => {
      const fen = parseYuan(values.amount)
      if (fen === null) {
        toast('请输入合法金额', 'error')
        return false
      }
      const result = confirmExternalAmount(order.id, fen)
      showResult(result)
      return result.ok
    },
    '确认金额',
  )
}

function openEntry(order: Order): void {
  const cages = freeCages(todayStr())
  const bodyHtml =
    `<div class="field"><span class="field__label">入场日期 *</span><input type="date" id="entry-date" value="${todayStr()}" /></div>` +
    `<p class="hint">只能选择当前实验室的空闲笼位（已占用、已停用的笼位不可选）</p>` +
    (cages.length
      ? `<div class="table-wrap" style="margin-top:8px"><table><tbody>${cages
          .map(
            (c) =>
              `<tr><td style="width:50px"><input type="checkbox" value="${c.id}" data-cage="${c.id}" /></td><td>${c.code}</td><td>${c.room}｜${c.env}</td><td>${c.capacity} 只/笼</td></tr>`,
          )
          .join('')}</tbody></table></div>`
      : '<div class="state-area"><p class="state-area__text">当前没有可用空闲笼位，请先在笼位管理中维护</p></div>')

  const dlg = openDialog({
    title: `饲养入场 ${order.code}`,
    bodyHtml,
    wide: true,
    actions: [
      { text: '取消' },
      {
        text: '确认入场',
        primary: true,
        keepOpen: true,
        onClick: () => {
          const date = (dlg.querySelector('#entry-date') as HTMLInputElement).value
          const ids = [...dlg.querySelectorAll<HTMLInputElement>('input[data-cage]')]
            .filter((i) => i.checked)
            .map((i) => i.value)
          const result = entryFeeding(order.id, ids, date)
          if (result.ok) {
            showResult(result)
            dlg.close()
          } else {
            toast(result.message, 'error')
          }
        },
      },
    ],
  })
}

