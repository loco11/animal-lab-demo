/** 库存：入库、业务出库、损耗、盘点调整。所有数量变更都生成唯一流水 */

import type { StockCategoryDef, StockCheck, StockFlow, StockSourceType } from '../../types'
import { assertAction, getCurrentUser } from '../auth'
import { data, log, updateData } from '../data'
import { nowDateTime, uid } from '../utils'
import { done, fail, type OpResult } from './result'

export interface StockAdjustInput {
  itemId: string
  quantity: number
  reason: string
  refType: StockFlow['refType']
  refId: string
  /** 业务日期（YYYY-MM-DD），缺省为当天；用于补录历史入库 */
  at?: string
  /** 入库来源类型：中心自产/供应商到货/调拨/其他 */
  sourceType?: StockSourceType
  /** 入库来源为外部供应商时的供应商 ID */
  supplierId?: string
  /** 入库来源对应的供应商条目 */
  supplierItemId?: string
}

/** 入库：数量为负或 0 阻止，失败不改变台账 */
export function stockIn(input: StockAdjustInput): OpResult {
  const guard = assertAction('stock:in')
  if (!guard.ok) return fail(guard.message)
  if (input.sourceType === 'supplier') {
    if (!input.supplierId) return fail('来源为供应商到货时必须选择供应商')
    const supplier = data().suppliers.find((s) => s.id === input.supplierId && s.labId === getCurrentUser().labId)
    if (!supplier) return fail('供应商不存在')
    if (!input.supplierItemId) return fail('来源为供应商到货时必须选择供应条目')
    const item = data().supplierItems.find(
      (i) => i.id === input.supplierItemId && i.supplierId === input.supplierId && i.labId === getCurrentUser().labId,
    )
    if (!item) return fail('供应条目不存在或不属于该供应商')
  }
  return changeStock({ ...input, type: 'in' })
}

/** 业务出库：库存不足阻止，保证内部订单必须整单出库 */
export function businessOut(input: StockAdjustInput): OpResult {
  if (input.quantity <= 0) return fail('出库数量必须大于 0')
  const item = data().stockItems.find((s) => s.id === input.itemId)
  if (!item) return fail('库存品目不存在')
  if (item.quantity < input.quantity) {
    return fail(`库存不足：当前 ${item.quantity}${item.unit}，需要 ${input.quantity}${item.unit}`)
  }
  return changeStock({ ...input, type: 'out' })
}

/** 损耗登记：死亡、淘汰、过期、损坏、丢失等即时扣减。只动台账与流水，不关联订单、不产生费用 */
export function stockLoss(input: { itemId: string; quantity: number; reason: string }): OpResult {
  const guard = assertAction('stock:loss')
  if (!guard.ok) return fail(guard.message)
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) return fail('损耗数量必须为正整数')
  if (!input.reason.trim()) return fail('请填写损耗原因')

  const item = data().stockItems.find((s) => s.id === input.itemId)
  if (!item) return fail('库存品目不存在')
  if (item.labId !== getCurrentUser().labId) return fail('不能操作其他实验室的库存')
  if (input.quantity > item.quantity) {
    return fail(`损耗数量不能超过当前库存：现存 ${item.quantity}${item.unit}`)
  }

  const before = item.quantity
  const after = before - input.quantity
  const flowId = uid('flw')

  updateData((d) => ({
    ...d,
    stockItems: d.stockItems.map((s) => (s.id === item.id ? { ...s, quantity: after } : s)),
    stockFlows: [
      {
        id: flowId,
        labId: item.labId,
        itemId: item.id,
        type: 'loss',
        quantity: -input.quantity,
        before,
        after,
        reason: input.reason.trim(),
        refType: 'loss',
        refId: item.id,
        operator: getCurrentUser().name,
        createdAt: nowDateTime(),
      },
      ...d.stockFlows,
    ],
  }))

  log(`损耗登记 ${item.name} ${input.quantity}${item.unit}（${input.reason.trim()}）`, 'loss', item.id)
  return done(`损耗已登记，当前库存 ${after}${item.unit}`, flowId)
}

/** 盘点单号：按提交时刻生成，同一次提交共享 */
function checkBatchNo(): string {
  const t = nowDateTime()
  return `PD-${t.slice(0, 10).replace(/-/g, '')}-${t.slice(11).replace(/:/g, '')}`
}

/** 盘点调整：以实际盘点数为准，禁止调到负库存，必须填写原因 */export function adjustStock(input: StockAdjustInput): OpResult {
  const guard = assertAction('stock:check')
  if (!guard.ok) return fail(guard.message)
  if (input.quantity < 0) return fail('盘点数量不能为负，库存不得被调整为负值')
  const item = data().stockItems.find((s) => s.id === input.itemId)
  if (!item) return fail('库存品目不存在')
  if (item.labId !== getCurrentUser().labId) return fail('不能操作其他实验室的库存')
  if (!input.reason.trim()) return fail('盘点调整必须填写原因')

  const before = item.quantity
  const diff = input.quantity - before
  const flowId = uid('flw')
  const operator = getCurrentUser().name

  updateData((d) => ({
    ...d,
    stockItems: d.stockItems.map((s) => (s.id === input.itemId ? { ...s, quantity: input.quantity } : s)),
    stockFlows: [
      {
        id: flowId,
        labId: item.labId,
        itemId: item.id,
        type: 'check',
        quantity: diff,
        before,
        after: input.quantity,
        reason: input.reason,
        refType: 'check',
        refId: input.refId,
        operator,
        createdAt: nowDateTime(),
      },
      ...d.stockFlows,
    ],
    stockChecks: [
      {
        id: uid('chk'),
        labId: item.labId,
        batchNo: checkBatchNo(),
        flowId,
        itemId: item.id,
        before,
        counted: input.quantity,
        diff,
        reason: input.reason,
        operator,
        createdAt: nowDateTime(),
      },
      ...d.stockChecks,
    ],
  }))

  log(`盘点调整 ${item.name}：${before} → ${input.quantity}（差异 ${diff}）`, 'stock', item.id)
  return done(`盘点已记录，差异 ${diff}${item.unit}`)
}

export interface BatchCheckEntry {
  itemId: string
  counted: number
}

/** 批量盘点：一次提交多个品目的实盘数；零差异也生成记录（证明盘过），差异生成 check 流水 */
export function batchStockCheck(input: { entries: BatchCheckEntry[]; reason: string }): OpResult {
  const guard = assertAction('stock:check')
  if (!guard.ok) return fail(guard.message)
  if (!input.entries.length) return fail('没有可盘点的品目')
  if (!input.reason.trim()) return fail('请选择盘点原因')

  const labId = getCurrentUser().labId
  const operator = getCurrentUser().name
  const now = nowDateTime()
  const batchNo = checkBatchNo()
  const items = data().stockItems
  const flows: StockFlow[] = []
  const checks: StockCheck[] = []
  const quantities = new Map<string, number>()
  let diffCount = 0
  let upSum = 0
  let downSum = 0

  for (const entry of input.entries) {
    const item = items.find((s) => s.id === entry.itemId)
    if (!item) return fail('库存品目不存在')
    if (item.labId !== labId) return fail('不能操作其他实验室的库存')
    if (!Number.isInteger(entry.counted) || entry.counted < 0) {
      return fail(`实盘数必须为非负整数：${item.name}`)
    }
    const diff = entry.counted - item.quantity
    const flowId = uid('flw')
    flows.push({
      id: flowId,
      labId,
      itemId: item.id,
      type: 'check',
      quantity: diff,
      before: item.quantity,
      after: entry.counted,
      reason: input.reason.trim(),
      refType: 'check',
      refId: item.id,
      operator,
      createdAt: now,
    })
    checks.push({
      id: uid('chk'),
      labId,
      batchNo,
      flowId,
      itemId: item.id,
      before: item.quantity,
      counted: entry.counted,
      diff,
      reason: input.reason.trim(),
      operator,
      createdAt: now,
    })
    quantities.set(item.id, entry.counted)
    if (diff !== 0) {
      diffCount++
      if (diff > 0) upSum += diff
      else downSum += diff
    }
  }

  updateData((d) => ({
    ...d,
    stockItems: d.stockItems.map((s) => (quantities.has(s.id) ? { ...s, quantity: quantities.get(s.id)! } : s)),
    stockFlows: [...flows, ...d.stockFlows],
    stockChecks: [...checks, ...d.stockChecks],
  }))

  log(`批量盘点 ${checks.length} 项（差异 ${diffCount} 项，盘盈 ${upSum}，盘亏 ${downSum}）`, 'stock', batchNo)
  return done(`盘点完成：共 ${checks.length} 项，差异 ${diffCount} 项（盘盈 ${upSum}，盘亏 ${downSum}）`, batchNo)
}

function changeStock(input: StockAdjustInput & { type: 'in' | 'out' }): OpResult {
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
    return fail(input.type === 'in' ? '入库数量必须为正整数' : '出库数量必须为正整数')
  }
  if (!input.reason.trim()) return fail('请填写变更原因')

  const item = data().stockItems.find((s) => s.id === input.itemId)
  if (!item) return fail('库存品目不存在')
  if (item.labId !== getCurrentUser().labId) return fail('不能操作其他实验室的库存')
  if (input.type === 'out' && item.quantity < input.quantity) {
    return fail(`库存不足：当前 ${item.quantity}${item.unit}，需要 ${input.quantity}${item.unit}`)
  }

  const before = item.quantity
  const after = input.type === 'in' ? before + input.quantity : before - input.quantity
  const flowId = uid('flw')
  const businessAt = input.at?.trim() ? `${input.at.trim()} ${nowDateTime().slice(11)}` : nowDateTime()

  updateData((d) => ({
    ...d,
    stockItems: d.stockItems.map((s) => (s.id === input.itemId ? { ...s, quantity: after } : s)),
    stockFlows: [
      {
        id: flowId,
        labId: item.labId,
        itemId: item.id,
        type: input.type,
        quantity: input.type === 'in' ? input.quantity : -input.quantity,
        before,
        after,
        reason: input.reason,
        sourceType: input.sourceType,
        supplierId: input.supplierId,
        supplierItemId: input.supplierItemId,
        refType: input.refType,
        refId: input.refId,
        operator: getCurrentUser().name,
        createdAt: businessAt,
      },
      ...d.stockFlows,
    ],
  }))

  log(input.type === 'in' ? `入库 ${input.quantity}${item.unit}` : `出库 ${input.quantity}${item.unit}`, input.refType, input.refId)
  return done(input.type === 'in' ? `入库成功，当前库存 ${after}${item.unit}` : `出库成功，当前库存 ${after}${item.unit}`, flowId)
}

/** 本订单是否已出库过：防止重复点击造成重复扣库存 */
export function hasOutFlowFor(orderId: string): boolean {
  return data().stockFlows.some((f) => f.type === 'out' && f.refType === 'order' && f.refId === orderId)
}

/** 类别档案查询：按 ID 查找启用类别，找不到返回 undefined */
export function categoryDef(categoryId: string): StockCategoryDef | undefined {
  return data().stockCategories.find((c) => c.id === categoryId && c.enabled)
}

/** 全部启用类别，按排序展示（建档、筛选共用） */
export function enabledCategories(): StockCategoryDef[] {
  return data()
    .stockCategories.filter((c) => c.enabled)
    .sort((a, b) => a.sort - b.sort)
}

export function categoryText(c: string): string {
  return categoryDef(c)?.name ?? '未分类'
}

export interface CreateStockItemInput {
  category: string
  name: string
  spec: string
  unit: string
  location: string
  /** 安全库存：低于该数量触发预警，0 表示不预警 */
  safeStock?: number
}

/** 新增物资品目建档：类别来自校级预置档案；动态扩展品目（无需初始库存，建档后由入库登记进账） */
export function createStockItem(input: CreateStockItemInput): OpResult {
  const guard = assertAction('stock:in')
  if (!guard.ok) return fail(guard.message)
  if (!categoryDef(input.category)) return fail('库存类别不存在或已停用')
  if (!input.name.trim()) return fail('品目名称不能为空')
  if (!input.spec.trim()) return fail('规格型号不能为空')
  if (!input.unit.trim()) return fail('计量单位不能为空')
  const safeStock = input.safeStock ?? 0
  if (!Number.isInteger(safeStock) || safeStock < 0) return fail('安全库存必须为非负整数')

  const labId = getCurrentUser().labId
  const id = uid('stk')
  const newItem = {
    id,
    labId,
    category: input.category,
    name: input.name.trim(),
    spec: input.spec.trim(),
    unit: input.unit.trim(),
    quantity: 0,
    safeStock,
    location: input.location.trim() || '通用库区',
    refPriceFen: 0,
  }

  updateData((d) => ({
    ...d,
    stockItems: [newItem, ...d.stockItems],
  }))

  log(`新建物资档案：${newItem.name}（${newItem.spec}，${categoryText(newItem.category)}）`, 'stock', id)
  return done(`物资「${newItem.name}」建档成功，可直接办理入库登记`, id)
}

/* ---------------- 批量导入 ---------------- */

/** 模板导入行：字段为 CSV 原始文本，校验与数值转换集中在业务层 */
export interface StockImportRow {
  /** CSV 行号（含表头计数），用于回显失败行 */
  line: number
  categoryName: string
  name: string
  spec: string
  unit: string
  location: string
  safeStock: string
  initialQuantity: string
}

export interface StockImportResult {
  ok: boolean
  message: string
  created: number
  failed: { line: number; name: string; reason: string }[]
}

/**
 * 批量导入品目建档：按模板列顺序逐行校验。
 * 期初数量大于 0 时生成「期初库存导入」入库流水，保证台账与流水一致；同名同规格同类别视为重复行。
 */
export function importStockItems(rows: StockImportRow[]): StockImportResult {
  const guard = assertAction('stock:in')
  if (!guard.ok) return { ok: false, message: guard.message, created: 0, failed: [] }

  const failed: StockImportResult['failed'] = []
  let created = 0
  const labId = getCurrentUser().labId
  const categories = enabledCategories()

  for (const row of rows) {
    const name = row.name.trim()
    const fail = (reason: string) => failed.push({ line: row.line, name: name || `第 ${row.line} 行`, reason })

    const def = categories.find((c) => c.name === row.categoryName.trim())
    if (!def) {
      fail(`类别「${row.categoryName.trim() || '空'}」不存在`)
      continue
    }
    if (!name) {
      fail('品目名称不能为空')
      continue
    }
    if (!row.spec.trim()) {
      fail('规格型号不能为空')
      continue
    }
    if (!row.unit.trim()) {
      fail('计量单位不能为空')
      continue
    }
    const safeStock = row.safeStock.trim() === '' ? 0 : Number(row.safeStock)
    const initialQuantity = row.initialQuantity.trim() === '' ? 0 : Number(row.initialQuantity)
    if (!Number.isInteger(safeStock) || safeStock < 0) {
      fail('安全库存必须为非负整数')
      continue
    }
    if (!Number.isInteger(initialQuantity) || initialQuantity < 0) {
      fail('期初数量必须为非负整数')
      continue
    }
    const duplicated = data().stockItems.some(
      (s) => s.labId === labId && s.category === def.id && s.name === name && s.spec === row.spec.trim(),
    )
    if (duplicated) {
      fail('已存在同名同规格品目')
      continue
    }

    const createdResult = createStockItem({
      category: def.id,
      name,
      spec: row.spec,
      unit: row.unit,
      location: row.location,
      safeStock,
    })
    if (!createdResult.ok) {
      fail(createdResult.message)
      continue
    }
    if (initialQuantity > 0) {
      const stocked = stockIn({
        itemId: createdResult.id!,
        quantity: initialQuantity,
        reason: '期初库存导入',
        refType: 'manual',
        refId: createdResult.id!,
      })
      if (!stocked.ok) {
        fail(stocked.message)
        continue
      }
    }
    created++
  }

  return {
    ok: created > 0,
    message: `批量导入完成：成功 ${created} 条${failed.length ? `，失败 ${failed.length} 条` : ''}`,
    created,
    failed,
  }
}

/* ---------------- 可用与锁定库存计算 ---------------- */

/** 计算品目已被未出库自产订单占用的锁定库存 */
export function lockedStockOf(itemId: string): number {
  return data().orders
    .filter((o) => o.kind === 'internal' && o.stockItemId === itemId && o.fulfillStatus === 'pending_out')
    .reduce((sum, o) => sum + (o.quantity || 0), 0)
}

/** 计算品目当前实时可用库存（实际在库 - 未出库预留锁定） */
export function availableStockOf(itemId: string): number {
  const item = data().stockItems.find((s) => s.id === itemId)
  if (!item) return 0
  const locked = lockedStockOf(itemId)
  return Math.max(0, item.quantity - locked)
}

