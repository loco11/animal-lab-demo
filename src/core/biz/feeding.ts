/** 饲养、笼位与耗材：入场才占用笼位，占用区间「开始日含、结束日不含」 */

import type { Cage, CageOccupancy, Feeding, SupplyUsage } from '../../types'
import { assertAction, getCurrentUser } from '../auth'
import { data, log, scoped, updateData } from '../data'
import { addOrderEvent } from './orders'
import { businessOut, categoryDef } from './stock'
import { auditPassed } from '../labels'
import { todayStr, uid, daysBetween, moneyText } from '../utils'
import { done, fail, type OpResult } from './result'

export function listFeedings(): Feeding[] {
  return scoped(data().feedings)
}

export function listCages(): Cage[] {
  return scoped(data().cages)
}

export function feedingById(id: string): Feeding | undefined {
  return data().feedings.find((f) => f.id === id)
}

export function feedingByOrder(orderId: string): Feeding | undefined {
  return data().feedings.find((f) => f.orderId === orderId)
}

export function occupanciesOf(feedingId: string): CageOccupancy[] {
  return data().occupancies.filter((o) => o.feedingId === feedingId)
}

export function supplyUsagesOf(feedingId: string): SupplyUsage[] {
  return data().supplyUsages.filter((u) => u.feedingId === feedingId)
}

/** 某日开始可用空闲笼位：必须属于当前实验室、未停用、且当日无占用 */
export function freeCages(fromDate: string): Cage[] {
  const busy = new Set(
    data()
      .occupancies.filter((o) => o.end === null || o.end > fromDate)
      .map((o) => o.cageId),
  )
  return scoped(data().cages).filter((c) => c.status !== 'disabled' && !busy.has(c.id))
}

export function cageOccupiedCageIdsAt(date: string): Set<string> {
  return new Set(
    data()
      .occupancies.filter((o) => o.start <= date && (o.end === null || o.end > date))
      .map((o) => o.cageId),
  )
}

/* ---------------- 入场 ---------------- */

export function entryFeeding(orderId: string, cageIds: string[], entryAt: string, animalNote = ''): OpResult {
  const guard = assertAction('feeding:entry')
  if (!guard.ok) return fail(guard.message)

  const order = data().orders.find((o) => o.id === orderId)
  if (!order) return fail('订单不存在')
  if (order.kind !== 'breeding') return fail('只有饲养订单需要入场')
  if (!auditPassed(order.auditStatus)) return fail('订单未通过确认，不能入场')
  if (order.fulfillStatus !== 'incoming') return fail('该订单不在待入场状态')
  if (!entryAt) return fail('请选择入场日期')
  if (!cageIds.length) return fail('请至少分配一个笼位')

  const user = getCurrentUser()
  const cages = data().cages.filter((c) => cageIds.includes(c.id))
  if (cages.length !== cageIds.length) return fail('选择的笼位不存在')
  if (cages.some((c) => c.labId !== user.labId)) return fail('不能选用其他实验室的笼位')
  if (cages.some((c) => c.status === 'disabled')) return fail('已停用的笼位不能用于入场')

  const busy = new Set<string>()
  data().occupancies.forEach((o) => {
    if (o.end === null || o.end > entryAt) busy.add(o.cageId)
  })
  const conflict = cages.filter((c) => busy.has(c.id))
  if (conflict.length) return fail(`笼位 ${conflict.map((c) => c.code).join('、')} 在 ${entryAt} 已被占用`)

  const feedingId = uid('fd')
  const now = todayStr()
  updateData((d) => ({
    ...d,
    feedings: [
      {
        id: feedingId,
        labId: order.labId,
        orderId: order.id,
        animalName: order.itemName,
        spec: animalNote.trim() || `${order.itemName} ${order.quantity} 只`,
        quantity: order.quantity,
        unitPriceFen: order.unitPriceFen,
        status: 'breeding',
        entryAt,
        cageIds,
      },
      ...d.feedings,
    ],
    occupancies: [
      ...cages.map<CageOccupancy>((c) => ({
        id: uid('oc'),
        labId: order.labId,
        cageId: c.id,
        feedingId,
        start: entryAt,
        end: null,
        reason: '入场占用',
        operator: user.name,
        createdAt: now,
      })),
      ...d.occupancies,
    ],
    cages: d.cages.map((c) => (cageIds.includes(c.id) ? { ...c, status: 'occupied' as const } : c)),
    orders: d.orders.map((o) => (o.id === order.id ? { ...o, fulfillStatus: 'breeding' as const, updatedAt: now } : o)),
  }))

  addOrderEvent(order.id, {
    at: entryAt,
    actor: user.name,
    action: '实际入场并占用笼位',
    note: `笼位 ${cages.map((c) => c.code).join('、')}`,
  })
  log(`饲养订单 ${order.code} 入场，占用 ${cageIds.length} 个笼位`, 'feeding', feedingId)
  return done(`入场成功，占用 ${cageIds.length} 个笼位`, feedingId)
}

/* ---------------- 笼位变更 ---------------- */

export interface CageChangeInput {
  feedingId: string
  addCageIds: string[]
  removeCageIds: string[]
  date: string
  reason: string
}

export function changeCages(input: CageChangeInput): OpResult {
  const guard = assertAction('feeding:change')
  if (!guard.ok) return fail(guard.message)
  const feeding = feedingById(input.feedingId)
  if (!feeding) return fail('饲养业务不存在')
  if (feeding.labId !== getCurrentUser().labId) return fail('不能操作其他实验室的饲养业务')
  if (feeding.status !== 'breeding') return fail('只有在养的饲养业务可以变更笼位')
  if (!input.addCageIds.length && !input.removeCageIds.length) return fail('请选择要增加或减少的笼位')
  if (!input.date) return fail('请选择变更生效日期')
  if (input.date < (feeding.entryAt ?? '')) return fail('变更日期不能早于入场日期')
  if (!input.reason.trim()) return fail('请填写变更原因')

  if (input.addCageIds.some((id) => feeding.cageIds.includes(id))) return fail('不能重复增加已在用的笼位')
  const remaining = feeding.cageIds.filter((id) => !input.removeCageIds.includes(id)).length + input.addCageIds.length
  if (remaining < 1) return fail('至少需保留一个笼位；全部释放请使用“退出”')

  const user = getCurrentUser()
  const addCages = data().cages.filter((c) => input.addCageIds.includes(c.id))
  if (addCages.length !== input.addCageIds.length) return fail('选择的笼位不存在')
  if (addCages.some((c) => c.labId !== user.labId)) return fail('不能选用其他实验室的笼位')
  if (addCages.some((c) => c.status === 'disabled')) return fail('已停用的笼位不能使用')

  const busyAt = cageOccupiedCageIdsAt(input.date)
  const conflict = addCages.filter((c) => busyAt.has(c.id))
  if (conflict.length) return fail(`笼位 ${conflict.map((c) => c.code).join('、')} 在 ${input.date} 已被占用`)

  const now = todayStr()
  updateData((d) => ({
    ...d,
    occupancies: [
      ...addCages.map<CageOccupancy>((c) => ({
        id: uid('oc'),
        labId: feeding.labId,
        cageId: c.id,
        feedingId: feeding.id,
        start: input.date,
        end: null,
        reason: input.reason.trim(),
        operator: user.name,
        createdAt: now,
      })),
      ...d.occupancies.map((o) =>
        o.feedingId === feeding.id && o.end === null && input.removeCageIds.includes(o.cageId)
          ? { ...o, end: input.date, reason: `${input.reason.trim()}（释放）` }
          : o,
      ),
    ],
    cages: d.cages.map((c) =>
      input.addCageIds.includes(c.id)
        ? { ...c, status: 'occupied' as const }
        : input.removeCageIds.includes(c.id)
          ? { ...c, status: 'free' as const }
          : c,
    ),
    feedings: d.feedings.map((f) =>
      f.id === feeding.id
        ? {
            ...f,
            cageIds: [...f.cageIds.filter((id) => !input.removeCageIds.includes(id)), ...input.addCageIds],
          }
        : f,
    ),
  }))

  addOrderEvent(feeding.orderId, {
    at: input.date,
    actor: user.name,
    action: `笼位变更：增加 ${input.addCageIds.length} 个、释放 ${input.removeCageIds.length} 个`,
    note: input.reason.trim(),
  })
  log(`饲养 ${feeding.id} 于 ${input.date} 变更笼位`, 'feeding', feeding.id)
  return done(`笼位变更已生效，当前占用 ${remaining} 个笼位`)
}

/* ---------------- 退出 ---------------- */

export function exitFeeding(feedingId: string, exitAt: string, reason: string): OpResult {
  const guard = assertAction('feeding:exit')
  if (!guard.ok) return fail(guard.message)
  const feeding = feedingById(feedingId)
  if (!feeding) return fail('饲养业务不存在')
  if (feeding.labId !== getCurrentUser().labId) return fail('不能操作其他实验室的饲养业务')
  if (feeding.status === 'exited') return fail('该饲养业务已退出')
  if (feeding.status !== 'breeding') return fail('只有入场后的饲养业务可以退出')
  if (!exitAt) return fail('请选择退出日期')
  if (exitAt < (feeding.entryAt ?? '')) return fail('退出日期不能早于入场日期')
  if (!reason.trim()) return fail('请填写退出原因')

  const user = getCurrentUser()
  const released = feeding.cageIds
  updateData((d) => ({
    ...d,
    occupancies: d.occupancies.map((o) =>
      o.feedingId === feeding.id && o.end === null ? { ...o, end: exitAt, reason: `退出：${reason.trim()}` } : o,
    ),
    cages: d.cages.map((c) => (released.includes(c.id) ? { ...c, status: 'free' as const } : c)),
    feedings: d.feedings.map((f) =>
      f.id === feeding.id ? { ...f, status: 'exited' as const, exitAt, exitReason: reason.trim(), cageIds: [] } : f,
    ),
    orders: d.orders.map((o) =>
      o.id === feeding.orderId ? { ...o, fulfillStatus: 'exited' as const, updatedAt: todayStr() } : o,
    ),
  }))

  addOrderEvent(feeding.orderId, {
    at: exitAt,
    actor: user.name,
    action: '退出并释放笼位',
    note: `${reason.trim()}；退出不等于已扣费成功，费用需按计费区间生成`,
  })
  log(`饲养 ${feeding.id} 于 ${exitAt} 退出`, 'feeding', feeding.id)
  return done('已退出并释放笼位，历史占用保留，费用需按计费区间另行生成')
}

/* ---------------- 耗材领用 ---------------- */

export function takeSupply(feedingId: string, itemId: string, quantity: number): OpResult {
  const guard = assertAction('feeding:supply')
  if (!guard.ok) return fail(guard.message)
  const feeding = feedingById(feedingId)
  if (!feeding) return fail('饲养业务不存在')
  if (feeding.labId !== getCurrentUser().labId) return fail('不能操作其他实验室的饲养业务')
  if (feeding.status !== 'breeding') return fail('只有在养的饲养业务可以领用耗材')
  if (!Number.isInteger(quantity) || quantity <= 0) return fail('领用数量必须为正整数')

  const item = data().stockItems.find((s) => s.id === itemId)
  if (!item) return fail('请选择耗材')
  const def = categoryDef(item.category)
  if (!def || def.isAnimal) return fail('只能领用非活体动物类库存')

  const today = todayStr()
  const duplicated = data().supplyUsages.some(
    (u) => u.feedingId === feedingId && u.itemId === itemId && u.createdAt === today && u.quantity === quantity,
  )
  if (duplicated) return fail('今日已登记过相同领用，重复点击不会再次扣减库存')

  const out = businessOut({
    itemId,
    quantity,
    reason: `饲养单 ${feeding.spec} 领用`,
    refType: 'feeding',
    refId: feeding.id,
  })
  if (!out.ok) return out

  updateData((d) => ({
    ...d,
    supplyUsages: [
      {
        id: uid('su'),
        labId: feeding.labId,
        itemId,
        feedingId,
        orderId: feeding.orderId,
        quantity,
        operator: getCurrentUser().name,
        createdAt: today,
      },
      ...d.supplyUsages,
    ],
  }))

  log(`领用耗材 ${item.name} ${quantity}${item.unit}`, 'feeding', feeding.id)
  return done(`已登记领用并扣减库存：普通饲料垫料已包含在饲养费用中，不另产生第二笔收费`)
}

/* ---------------- 区间计费 ---------------- */

export interface BillingSegment {
  start: string
  end: string
  cages: number
  days: number
  amountFen: number
}

/** 按占用区间切段计算：笼位数 × 天数 × 单价（入场价格快照） */
export function calcSegments(occupancies: CageOccupancy[], start: string, end: string, unitPriceFen: number): BillingSegment[] {
  const bounds = new Set<string>([start, end])
  occupancies.forEach((o) => {
    if (o.start > start && o.start < end) bounds.add(o.start)
    if (o.end && o.end > start && o.end < end) bounds.add(o.end)
  })
  const points = [...bounds].sort()
  const segments: BillingSegment[] = []
  for (let i = 0; i < points.length - 1; i++) {
    const s = points[i]
    const e = points[i + 1]
    const days = daysBetween(s, e)
    if (days <= 0) continue
    const cages = activeCages(occupancies, s, e)
    if (cages <= 0) continue
    segments.push({ start: s, end: e, cages, days, amountFen: cages * days * unitPriceFen })
  }
  return segments
}

function activeCages(occupancies: CageOccupancy[], start: string, end: string): number {
  return occupancies.filter((o) => o.start <= start && (o.end === null || o.end >= end)).length
}

export function billedPeriods(orderId: string): { start: string; end: string }[] {
  return data()
    .fees.filter((f) => f.orderId === orderId && f.periodStart && f.periodEnd)
    .map((f) => ({ start: f.periodStart!, end: f.periodEnd! }))
}

export interface FeeCalc {
  ok: boolean
  message: string
  segments: BillingSegment[]
  amountFen: number
}

export function quoteFeedingFee(feeding: Feeding, start: string, end: string): FeeCalc {
  const empty = { segments: [], amountFen: 0 }
  if (feeding.status === 'incoming') return { ...empty, ok: false, message: '未入场的饲养业务没有可计费区间' }
  if (!start || !end) return { ...empty, ok: false, message: '请选择计费区间' }
  if (end <= start) return { ...empty, ok: false, message: '计费区间至少包含一个自然日（开始日含、结束日不含）' }
  if (end > todayStr()) return { ...empty, ok: false, message: '不能对未来日期计费' }

  const taken = billedPeriods(feeding.orderId)
  if (taken.some((p) => start < p.end && end > p.start)) {
    return { ...empty, ok: false, message: '所选区间与已计费区间重叠，不能重复计算' }
  }

  const segments = calcSegments(occupanciesOf(feeding.id), start, end, feeding.unitPriceFen)
  if (!segments.length) return { ...empty, ok: false, message: '所选区间内没有笼位占用，不产生费用' }
  const amountFen = segments.reduce((sum, s) => sum + s.amountFen, 0)
  return { ok: true, message: '', segments, amountFen }
}

export function generateFeedingFee(feedingId: string, start: string, end: string): OpResult {
  const guard = assertAction('fee:generate')
  if (!guard.ok) return fail(guard.message)
  const feeding = feedingById(feedingId)
  if (!feeding) return fail('饲养业务不存在')

  const calc = quoteFeedingFee(feeding, start, end)
  if (!calc.ok) return fail(calc.message)

  const basis = calc.segments
    .map((s) => `${s.start}~${s.end}：${s.cages} 笼 × ${s.days} 天`)
    .join('；')

  updateData((d) => ({
    ...d,
    fees: [
      {
        id: uid('fe'),
        labId: feeding.labId,
        orderId: feeding.orderId,
        kind: 'breeding',
        channel: 'internal',
        title: `${feeding.animalName} 饲养费用`,
        basis: `${basis}；单价 ${(feeding.unitPriceFen / 100).toFixed(2)} 元/笼·天`,
        amountFen: calc.amountFen,
        periodStart: start,
        periodEnd: end,
        createdAt: todayStr(),
        operator: getCurrentUser().name,
      },
      ...d.fees,
    ],
  }))

  log(`生成饲养费用 ${moneyText(calc.amountFen)}（${start}~${end}）`, 'feeding', feeding.id)
  return done(`已生成费用 ${moneyText(calc.amountFen)}：${basis}`)
}
