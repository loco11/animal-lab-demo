/** 外购：按供应商汇总需求、导出清单、标记已发送、代登记异常（不入库、无交付完成） */

import type { AnomalyStatus, AnomalyType, Order, PurchaseAnomaly, PurchaseBatch, Supplier, SupplierItem } from '../../types'
import { assertAction, getCurrentUser } from '../auth'
import { data, log, scoped, updateData } from '../data'
import { addOrderEvent } from './orders'
import { todayStr, uid } from '../utils'
import { done, fail, type OpResult } from './result'

export function listSuppliers(): Supplier[] {
  return scoped(data().suppliers)
}

/** 供应条目类型 */
export const SUPPLIER_ITEM_KINDS = [
  { value: 'animal', label: '动物品系' },
  { value: 'supply', label: '物资品种' },
] as const

/** 供应商是外购动物的供应方，不设供应商门户，也不新增一级菜单 */
export interface SupplierItemInput {
  kind: 'animal' | 'supply'
  name: string
  spec: string
  unit: string
  priceFen: number
  note?: string
}

/** 供应商条目：固定编码，名称可重复不校验冲突 */
export function listSupplierItems(supplierId?: string): SupplierItem[] {
  return data().supplierItems.filter(
    (i) => i.labId === getCurrentUser().labId && (!supplierId || i.supplierId === supplierId),
  )
}

function nextSupplierItemCode(offset = 0): string {
  const max = data().supplierItems.reduce((m, i) => {
    const n = Number(i.code.replace(/[^0-9]/g, ''))
    return Number.isFinite(n) ? Math.max(m, n) : m
  }, 0)
  return `SI-${String(max + 1 + offset).padStart(4, '0')}`
}

function validateItemInput(input: SupplierItemInput): string {
  if (!input.name.trim()) return '请填写条目名称'
  if (!input.spec.trim()) return '请填写规格型号'
  if (!input.unit.trim()) return '请填写计量单位'
  if (!Number.isInteger(input.priceFen) || input.priceFen < 0) return '单价必须为非负数'
  return ''
}

export function createSupplier(input: {
  name: string
  contact: string
  phone: string
  note?: string
  items?: SupplierItemInput[]
}): OpResult {
  const guard = assertAction('supplier:edit')
  if (!guard.ok) return fail(guard.message)
  if (!input.name.trim()) return fail('请填写供应商名称')
  const items = input.items ?? []
  for (const item of items) {
    const msg = validateItemInput(item)
    if (msg) return fail(`条目「${item.name.trim() || '未填写'}」：${msg}`)
  }

  const id = uid('su')
  const newItems: SupplierItem[] = items.map((item, index) => ({
    id: uid('si'),
    code: nextSupplierItemCode(index),
    labId: getCurrentUser().labId,
    supplierId: id,
    kind: item.kind,
    name: item.name.trim(),
    spec: item.spec.trim(),
    unit: item.unit.trim(),
    priceFen: item.priceFen,
    enabled: true,
    note: item.note?.trim() || undefined,
  }))
  updateData((d) => ({
    ...d,
    suppliers: [
      {
        id,
        labId: getCurrentUser().labId,
        name: input.name.trim(),
        contact: input.contact.trim(),
        phone: input.phone.trim(),
        enabled: true,
        note: input.note?.trim() || undefined,
      },
      ...d.suppliers,
    ],
    supplierItems: [...newItems, ...d.supplierItems],
  }))
  log(`新增供应商 ${input.name}（${newItems.length} 个条目）`, 'supplier', id)
  return done(`供应商「${input.name.trim()}」已新增${newItems.length ? `，含 ${newItems.length} 个供应条目` : ''}`, id)
}

/** 编辑供应商基础信息（条目在「品系/价格」中单独维护） */
export function updateSupplier(
  id: string,
  input: { name: string; contact: string; phone: string; note?: string },
): OpResult {
  const guard = assertAction('supplier:edit')
  if (!guard.ok) return fail(guard.message)
  const supplier = data().suppliers.find((s) => s.id === id)
  if (!supplier) return fail('供应商不存在')
  if (supplier.labId !== getCurrentUser().labId) return fail('不能操作其他实验室的供应商')
  if (!input.name.trim()) return fail('请填写供应商名称')
  updateData((d) => ({
    ...d,
    suppliers: d.suppliers.map((s) =>
      s.id === id
        ? {
            ...s,
            name: input.name.trim(),
            contact: input.contact.trim(),
            phone: input.phone.trim(),
            note: input.note?.trim() || undefined,
          }
        : s,
    ),
  }))
  log(`编辑供应商 ${input.name}`, 'supplier', id)
  return done(`供应商「${input.name.trim()}」已保存`)
}

/** 供应商下新增供应条目 */
export function createSupplierItem(supplierId: string, input: SupplierItemInput): OpResult {
  const guard = assertAction('supplier:edit')
  if (!guard.ok) return fail(guard.message)
  const supplier = data().suppliers.find((s) => s.id === supplierId && s.labId === getCurrentUser().labId)
  if (!supplier) return fail('供应商不存在')
  const msg = validateItemInput(input)
  if (msg) return fail(msg)
  const item: SupplierItem = {
    id: uid('si'),
    code: nextSupplierItemCode(),
    labId: supplier.labId,
    supplierId,
    kind: input.kind,
    name: input.name.trim(),
    spec: input.spec.trim(),
    unit: input.unit.trim(),
    priceFen: input.priceFen,
    enabled: true,
    note: input.note?.trim() || undefined,
  }
  updateData((d) => ({ ...d, supplierItems: [item, ...d.supplierItems] }))
  log(`新增供应条目 ${item.code} ${item.name}`, 'supplier', item.id)
  return done(`条目 ${item.code}「${item.name}」已新增`, item.id)
}

export function updateSupplierItem(id: string, input: SupplierItemInput): OpResult {
  const guard = assertAction('supplier:edit')
  if (!guard.ok) return fail(guard.message)
  const item = data().supplierItems.find((i) => i.id === id)
  if (!item) return fail('供应条目不存在')
  if (item.labId !== getCurrentUser().labId) return fail('不能操作其他实验室的条目')
  const msg = validateItemInput(input)
  if (msg) return fail(msg)
  updateData((d) => ({
    ...d,
    supplierItems: d.supplierItems.map((i) =>
      i.id === id
        ? { ...i, kind: input.kind, name: input.name.trim(), spec: input.spec.trim(), unit: input.unit.trim(), priceFen: input.priceFen, note: input.note?.trim() || undefined }
        : i,
    ),
  }))
  log(`编辑供应条目 ${item.code} ${input.name}`, 'supplier', id)
  return done(`条目 ${item.code} 已保存`)
}

export function toggleSupplierItem(id: string, enabled: boolean): OpResult {
  const guard = assertAction('supplier:edit')
  if (!guard.ok) return fail(guard.message)
  const item = data().supplierItems.find((i) => i.id === id)
  if (!item) return fail('供应条目不存在')
  if (item.labId !== getCurrentUser().labId) return fail('不能操作其他实验室的条目')
  updateData((d) => ({ ...d, supplierItems: d.supplierItems.map((i) => (i.id === id ? { ...i, enabled } : i)) }))
  log(`${enabled ? '启用' : '停用'}供应条目 ${item.code}`, 'supplier', id)
  return done(`条目 ${item.code}「${item.name}」已${enabled ? '启用' : '停用'}`)
}

/** 停用/启用供应商：停用后不再出现在服务与汇总选择中 *//** 停用/启用供应商：停用后不再出现在服务与汇总选择中 */
export function toggleSupplier(id: string, enabled: boolean): OpResult {
  const guard = assertAction('supplier:edit')
  if (!guard.ok) return fail(guard.message)
  const supplier = data().suppliers.find((s) => s.id === id)
  if (!supplier) return fail('供应商不存在')
  if (supplier.labId !== getCurrentUser().labId) return fail('不能操作其他实验室的供应商')
  updateData((d) => ({
    ...d,
    suppliers: d.suppliers.map((s) => (s.id === id ? { ...s, enabled } : s)),
  }))
  log(`${enabled ? '启用' : '停用'}供应商 ${supplier.name}`, 'supplier', id)
  return done(`供应商「${supplier.name}」已${enabled ? '启用' : '停用'}`)
}

export function listBatches(): PurchaseBatch[] {
  return scoped(data().purchaseBatches)
}

export function listAnomalies(): PurchaseAnomaly[] {
  return scoped(data().anomalies)
}

/** 订单的实际供应商：优先订单自身快照，缺省从服务继承 */
function orderSupplier(o: Order): string | undefined {
  return o.supplierId || data().services.find((s) => s.id === o.serviceId)?.supplierId
}

/** 把外购订单标记为已发送供应商（按订单处理，不再要求先建批次） */
export function markOrdersSent(orderIds: string[]): OpResult {
  const guard = assertAction('purchase:send')
  if (!guard.ok) return fail(guard.message)
  if (!orderIds.length) return fail('请选择要标记的订单')
  const orders = data().orders.filter((o) => orderIds.includes(o.id))
  if (orders.length !== orderIds.length) return fail('部分订单不存在')
  if (orders.some((o) => o.labId !== getCurrentUser().labId)) return fail('不能处理其他实验室的订单')
  if (orders.some((o) => o.kind !== 'external')) return fail('只能处理外购订单')
  if (orders.some((o) => o.auditStatus !== 'approved')) return fail('未通过确认的订单不能发送')
  if (orders.some((o) => o.fulfillStatus === 'sent')) return fail('存在已发送的订单，不能重复处理')

  updateData((d) => ({
    ...d,
    orders: d.orders.map((o) =>
      orderIds.includes(o.id) ? { ...o, fulfillStatus: 'sent' as const, updatedAt: todayStr() } : o,
    ),
  }))
  orders.forEach((o) => {
    addOrderEvent(o.id, { at: todayStr(), actor: getCurrentUser().name, action: '标记已发送供应商' })
  })
  log(`外购订单标记已发送 ${orders.length} 笔`, 'purchase', orderIds.join(','))
  return done(`已标记 ${orders.length} 笔订单为已处理（已发送供应商）`)
}

/** 可汇总的外购订单：已通过确认、尚未进入批次、且已关联供应商 */
export function collectableOrders(): Order[] {
  const inBatch = new Set(data().purchaseBatches.flatMap((b) => b.orderIds))
  return scoped(data().orders).filter(
    (o) =>
      o.kind === 'external' &&
      o.auditStatus === 'approved' &&
      o.fulfillStatus === 'pending_collect' &&
      !inBatch.has(o.id) &&
      !!orderSupplier(o),
  )
}

export function createBatch(supplierId: string, orderIds: string[]): OpResult {
  const guard = assertAction('purchase:batch')
  if (!guard.ok) return fail(guard.message)
  if (!supplierId) return fail('请选择供应商')
  if (!orderIds.length) return fail('请至少选择一笔外购订单')

  const supplier = data().suppliers.find((s) => s.id === supplierId)
  if (!supplier) return fail('供应商不存在')

  const orders = data().orders.filter((o) => orderIds.includes(o.id))
  if (orders.length !== orderIds.length) return fail('选择的订单不存在')
  if (orders.some((o) => o.kind !== 'external')) return fail('只能汇总外购订单')
  if (orders.some((o) => o.labId !== getCurrentUser().labId)) return fail('不能汇总其他实验室的订单')
  if (orders.some((o) => o.auditStatus !== 'approved')) return fail('未通过确认的订单不能汇总')
  if (orders.some((o) => o.fulfillStatus !== 'pending_collect')) return fail('订单已加入批次或已发送')
  if (orders.some((o) => orderSupplier(o) !== supplierId)) return fail('只能汇总同一供应商的订单')

  const batchId = uid('pb')
  updateData((d) => ({
    ...d,
    purchaseBatches: [
      {
        id: batchId,
        labId: supplier.labId,
        supplierId,
        orderIds,
        status: 'draft',
        operator: getCurrentUser().name,
        createdAt: todayStr(),
      },
      ...d.purchaseBatches,
    ],
    orders: d.orders.map((o) =>
      orderIds.includes(o.id) ? { ...o, fulfillStatus: 'pending_send' as const, updatedAt: todayStr() } : o,
    ),
  }))

  orders.forEach((o) =>
    addOrderEvent(o.id, { at: todayStr(), actor: getCurrentUser().name, action: `加入外购批次（供应商：${supplier.name}）` }),
  )
  log(`按供应商 ${supplier.name} 汇总 ${orderIds.length} 笔外购订单`, 'purchase', batchId)
  return done(`已汇总 ${orderIds.length} 笔订单，可导出清单后标记已发送`, batchId)
}

export function markSent(batchId: string): OpResult {
  const guard = assertAction('purchase:send')
  if (!guard.ok) return fail(guard.message)
  const batch = data().purchaseBatches.find((b) => b.id === batchId)
  if (!batch) return fail('批次不存在')
  if (batch.labId !== getCurrentUser().labId) return fail('不能操作其他实验室的批次')
  if (batch.status === 'sent') return fail('该批次已发送，不会重复生成发送记录')

  updateData((d) => ({
    ...d,
    purchaseBatches: d.purchaseBatches.map((b) =>
      b.id === batchId ? { ...b, status: 'sent' as const, sentAt: todayStr() } : b,
    ),
    orders: d.orders.map((o) =>
      batch.orderIds.includes(o.id) ? { ...o, fulfillStatus: 'sent' as const, updatedAt: todayStr() } : o,
    ),
  }))

  batch.orderIds.forEach((id) =>
    addOrderEvent(id, { at: todayStr(), actor: getCurrentUser().name, action: '已发送供应商', note: '学校端不登记到货或领取完成，进度停在“已发送供应商”' }),
  )
  log(`外购批次 ${batchId} 标记已发送供应商`, 'purchase', batchId)
  return done(`已标记发送，共 ${batch.orderIds.length} 笔订单状态更新为“已发送供应商”`)
}

/** 批次明细：导出 CSV 与页面预览使用同一份数据 */
export function batchRows(batchId: string): string[][] {
  const batch = data().purchaseBatches.find((b) => b.id === batchId)
  if (!batch) return []
  const orders = data().orders.filter((o) => batch.orderIds.includes(o.id))
  return orders.map((o) => [
    o.code,
    o.itemName,
    o.spec,
    String(o.quantity),
    o.unit,
    o.applicantName,
    o.applicantOrg,
    `${(o.unitPriceFen / 100).toFixed(2)}`,
    `${(((o.confirmedAmountFen ?? o.quantity * o.unitPriceFen) as number) / 100).toFixed(2)}`,
  ])
}

export const BATCH_CSV_HEADER = [
  '订单编号',
  '品目',
  '规格',
  '数量',
  '单位',
  '申请人',
  '申请人所属',
  '单价（元）',
  '金额（元）',
]

export interface AnomalyInput {
  orderId: string
  type: AnomalyType
  description: string
  feedbackBy: string
}

/** 异常登记：关联原订单，保留反馈与处理记录，不改变交付状态或金额 */
export function registerAnomaly(input: AnomalyInput): OpResult {
  const guard = assertAction('purchase:anomaly')
  if (!guard.ok) return fail(guard.message)
  const order = data().orders.find((o) => o.id === input.orderId)
  if (!order) return fail('订单不存在')
  if (order.kind !== 'external') return fail('只有外购订单可登记异常')
  if (!input.description.trim()) return fail('请填写反馈内容')

  const id = uid('an')
  const supplierId = data().purchaseBatches.find((b) => b.orderIds.includes(order.id))?.supplierId ?? ''
  updateData((d) => ({
    ...d,
    anomalies: [
      {
        id,
        labId: order.labId,
        orderId: order.id,
        supplierId,
        type: input.type,
        description: input.description.trim(),
        feedbackBy: input.feedbackBy.trim() || '管理员代登记',
        status: 'pending',
        createdAt: todayStr(),
        logs: [{ at: todayStr(), text: '管理员代登记学生反馈', actor: getCurrentUser().name }],
      },
      ...d.anomalies,
    ],
  }))
  addOrderEvent(order.id, {
    at: todayStr(),
    actor: getCurrentUser().name,
    action: '登记外购异常',
    note: '由管理员代登记反馈，不自动退款或调整费用',
  })
  log(`登记外购异常 ${ANOMALY_TEXT[input.type]}，关联订单 ${order.code}`, 'purchase', id)
  return done(`已登记异常并关联订单 ${order.code}，可在异常列表中继续跟进`, id)
}

export function updateAnomalyStatus(id: string, status: AnomalyStatus, text: string): OpResult {
  const guard = assertAction('purchase:anomaly')
  if (!guard.ok) return fail(guard.message)
  const anomaly = data().anomalies.find((a) => a.id === id)
  if (!anomaly) return fail('异常记录不存在')

  updateData((d) => ({
    ...d,
    anomalies: d.anomalies.map((a) =>
      a.id === id
        ? {
            ...a,
            status,
            logs: [...a.logs, { at: todayStr(), text: text.trim() || ANOMALY_STATUS_TEXT[status], actor: getCurrentUser().name }],
          }
        : a,
    ),
  }))
  log(`外购异常 ${id} 更新为 ${ANOMALY_STATUS_TEXT[status]}`, 'purchase', id)
  return done(`处理状态已更新为「${ANOMALY_STATUS_TEXT[status]}」，配送完成状态与金额未改变`)
}

export const ANOMALY_TEXT: Record<AnomalyType, string> = {
  short: '少供',
  dead: '死亡',
  other: '其他',
}

export const ANOMALY_STATUS_TEXT: Record<AnomalyStatus, string> = {
  pending: '待处理',
  following: '跟进中',
  resolved: '已记录处理结果',
}
