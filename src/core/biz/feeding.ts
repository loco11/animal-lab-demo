/** 饲养、笼位与耗材：入场才占用笼位，占用区间「开始日含、结束日不含」 */

import type { Cage, CageOccupancy, Feeding, SupplyUsage } from '../../types'
import { assertAction, getCurrentUser } from '../auth'
import { data, log, scoped, updateData } from '../data'
import { addOrderEvent } from './orders'
import { businessOut, categoryDef } from './stock'
import { auditPassed } from '../labels'
import { todayStr, uid, daysBetween, moneyText, addDays } from '../utils'
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

/** 某时间段内可用空闲笼位：属于当前实验室、未停用、非待消杀，且在 [fromDate, toDate] 无占用与预留 */
export function freeCages(fromDate: string, toDate?: string, cageType?: string): Cage[] {
  // 先触发清理过期预留
  checkAndReleaseExpiredReservations()

  const endDate = toDate || fromDate
  const busy = new Set<string>()

  data().occupancies.forEach((o) => {
    // 检查时间是否有重合: o.start <= endDate && (o.end === null || o.end > fromDate)
    if (o.start <= endDate && (o.end === null || o.end > fromDate)) {
      busy.add(o.cageId)
    }
  })

  return scoped(data().cages).filter((c) => {
    if (c.status === 'disabled' || c.status === 'cleaning') return false
    if (busy.has(c.id)) return false
    if (cageType && c.cageType && c.cageType !== cageType) return false
    return true
  })
}

export function cageOccupiedCageIdsAt(date: string): Set<string> {
  return new Set(
    data()
      .occupancies.filter((o) => o.start <= date && (o.end === null || o.end > date))
      .map((o) => o.cageId),
  )
}

/** 检查并自动释放逾期未到校的预留笼位（超过拟入场日 2 天） */
export function checkAndReleaseExpiredReservations(): number {
  const now = todayStr()
  const orders = data().orders
  const expiredOrders = orders.filter(
    (o) =>
      o.kind === 'breeding' &&
      o.fulfillStatus === 'incoming' &&
      o.reserveStatus === 'reserved' &&
      o.reserveExpireAt &&
      now > o.reserveExpireAt,
  )

  if (!expiredOrders.length) return 0

  let releasedCount = 0
  updateData((d) => {
    let updatedCages = [...d.cages]
    let updatedOccs = [...d.occupancies]
    let updatedOrders = [...d.orders]

    expiredOrders.forEach((ord) => {
      releasedCount++
      const allocated = ord.allocatedCageIds || []
      // 清除该订单的 reserve 占位
      updatedOccs = updatedOccs.filter((o) => !(o.orderId === ord.id && o.type === 'reserve'))
      // 释放笼位
      updatedCages = updatedCages.map((c) => {
        if (allocated.includes(c.id) && c.status === 'reserved') {
          return { ...c, status: 'free' as const }
        }
        return c
      })
      // 退回订单至待确认重排
      updatedOrders = updatedOrders.map((o) => {
        if (o.id === ord.id) {
          return {
            ...o,
            auditStatus: 'pending' as const,
            reserveStatus: 'expired_released' as const,
            allocatedCageIds: [],
            updatedAt: now,
            history: [
              ...o.history,
              {
                at: now,
                actor: '系统自动风控',
                action: '逾期未到校，自动释放预分配笼位',
                note: `拟入场日为 ${ord.expectStartDate || '—'}，最晚保留至 ${ord.reserveExpireAt}；现已超期2天，已释放预留笼位并退回待确认重新排位`,
              },
            ],
          }
        }
        return o
      })
    })

    return {
      ...d,
      cages: updatedCages,
      occupancies: updatedOccs,
      orders: updatedOrders,
    }
  })

  if (releasedCount > 0) {
    log(`系统自动释放 ${releasedCount} 笔逾期未办理入住的预留笼位`, 'feeding')
  }
  return releasedCount
}

/** 审核排位与预分配锁定物理笼位 */
export function allocateCages(
  orderId: string,
  cageIds: string[],
  startDate?: string,
  feedDays?: number,
): OpResult {
  const guard = assertAction('order:approve')
  if (!guard.ok) return fail(guard.message)

  const order = data().orders.find((o) => o.id === orderId)
  if (!order) return fail('订单不存在')
  if (order.kind !== 'breeding') return fail('只有饲养订单需要排位分配笼位')
  if (order.fulfillStatus !== 'incoming') return fail('订单不在待入场状态')
  if (!cageIds.length) return fail('请至少选择一个物理笼位')

  const user = getCurrentUser()
  const start = startDate || order.expectStartDate || todayStr()
  const days = feedDays || order.feedDays || 14
  const end = addDays(start, days)
  const reserveExpireAt = addDays(start, 2) // 拟入场日 + 2天保留

  const cages = data().cages.filter((c) => cageIds.includes(c.id))
  if (cages.length !== cageIds.length) return fail('部分笼位不存在')
  if (cages.some((c) => c.labId !== user.labId)) return fail('不能选用其他实验室的笼位')
  if (cages.some((c) => c.status === 'disabled')) return fail('已停用的笼位不能排位')
  if (cages.some((c) => c.status === 'cleaning')) return fail('待消杀中的笼位不可预分配')

  // 冲突排查（忽略自身以前可能存在的 reserve）
  const conflictOcc = data().occupancies.filter(
    (o) =>
      cageIds.includes(o.cageId) &&
      !(o.orderId === order.id && o.type === 'reserve') &&
      o.start <= end &&
      (o.end === null || o.end > start),
  )
  if (conflictOcc.length) {
    const conflictCageIds = [...new Set(conflictOcc.map((o) => o.cageId))]
    const names = cages.filter((c) => conflictCageIds.includes(c.id)).map((c) => c.code)
    return fail(`笼位 ${names.join('、')} 在区间 [${start} ~ ${end}] 已被占用或已有其他预约锁定`)
  }

  const now = todayStr()
  updateData((d) => {
    const cleanOcc = d.occupancies.filter((o) => !(o.orderId === order.id && o.type === 'reserve'))
    const reserveOccs: CageOccupancy[] = cages.map((c) => ({
      id: uid('oc'),
      labId: order.labId,
      cageId: c.id,
      orderId: order.id,
      type: 'reserve',
      start,
      end,
      expireAt: reserveExpireAt,
      reason: '排位预分配锁定',
      operator: user.name,
      createdAt: now,
    }))

    return {
      ...d,
      occupancies: [...reserveOccs, ...cleanOcc],
      cages: d.cages.map((c) => (cageIds.includes(c.id) ? { ...c, status: 'reserved' as const } : c)),
      orders: d.orders.map((o) =>
        o.id === order.id
          ? {
              ...o,
              auditStatus: 'approved' as const,
              reserveStatus: 'reserved' as const,
              allocatedCageIds: cageIds,
              expectStartDate: start,
              expectEndDate: end,
              feedDays: days,
              reserveExpireAt,
              updatedAt: now,
              history: [
                ...o.history,
                {
                  at: now,
                  actor: user.name,
                  action: '审核排位同意，锁定物理笼位',
                  note: `预分配物理笼位：${cages.map((c) => c.code).join('、')}；拟入住区间：${start} ~ ${end}；最晚保留至 ${reserveExpireAt} 23:59（超期2天未到将自动释放）`,
                },
              ],
            }
          : o,
      ),
    }
  })

  log(`订单 ${order.code} 完成时空排位，锁定 ${cageIds.length} 个笼位`, 'feeding', order.id)
  return done(`审核排位成功！已锁定 ${cages.map((c) => c.code).join('、')}，最晚保留至 ${reserveExpireAt}`)
}

/* ---------------- 入场 ---------------- */

export function entryFeeding(
  orderId: string,
  cageIds?: string[],
  entryAt?: string,
  animalNote = '',
): OpResult {
  const guard = assertAction('feeding:entry')
  if (!guard.ok) return fail(guard.message)

  const order = data().orders.find((o) => o.id === orderId)
  if (!order) return fail('订单不存在')
  if (order.kind !== 'breeding') return fail('只有饲养订单需要入场')
  if (!auditPassed(order.auditStatus)) return fail('订单未通过排位确认，不能入场')
  if (order.fulfillStatus !== 'incoming') return fail('该订单不在待入场状态')

  const actualEntryAt = entryAt || todayStr()
  if (order.reserveExpireAt && actualEntryAt > order.reserveExpireAt) {
    return fail(`该预约已超过最晚保留期限（${order.reserveExpireAt}），请管理员重新排位`)
  }

  // 严格按原分配或传入的笼位
  const targetCageIds = cageIds && cageIds.length ? cageIds : order.allocatedCageIds || []
  if (!targetCageIds.length) return fail('该订单尚未分配物理笼位，请先进行排位')

  const user = getCurrentUser()
  const cages = data().cages.filter((c) => targetCageIds.includes(c.id))
  if (cages.length !== targetCageIds.length) return fail('选择的笼位不存在')
  if (cages.some((c) => c.labId !== user.labId)) return fail('不能选用其他实验室的笼位')
  if (cages.some((c) => c.status === 'disabled')) return fail('已停用的笼位不能用于入场')

  // 冲突检查：检查是否有除本订单预留以外的实际占用冲突
  const busy = new Set<string>()
  data().occupancies.forEach((o) => {
    // 排除本订单的预留占位
    if (o.orderId === order.id && o.type === 'reserve') return
    if (o.end === null || o.end > actualEntryAt) busy.add(o.cageId)
  })
  const conflict = cages.filter((c) => busy.has(c.id))
  if (conflict.length) return fail(`笼位 ${conflict.map((c) => c.code).join('、')} 在 ${actualEntryAt} 已被占用`)

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
        entryAt: actualEntryAt,
        cageIds: targetCageIds,
      },
      ...d.feedings,
    ],
    occupancies: [
      ...cages.map<CageOccupancy>((c) => ({
        id: uid('oc'),
        labId: order.labId,
        cageId: c.id,
        feedingId,
        orderId: order.id,
        type: 'actual',
        start: actualEntryAt,
        end: null,
        reason: '现场核验入住',
        operator: user.name,
        createdAt: now,
      })),
      // 清理该订单先前的 reserve 预留占位
      ...d.occupancies.filter((o) => !(o.orderId === order.id && o.type === 'reserve')),
    ],
    cages: d.cages.map((c) => (targetCageIds.includes(c.id) ? { ...c, status: 'occupied' as const } : c)),
    orders: d.orders.map((o) =>
      o.id === order.id
        ? {
            ...o,
            fulfillStatus: 'breeding' as const,
            feeStatus: 'charged' as const,
            reserveStatus: 'checked_in' as const,
            allocatedCageIds: targetCageIds,
            updatedAt: now,
          }
        : o,
    ),
  }))

  addOrderEvent(order.id, {
    at: actualEntryAt,
    actor: user.name,
    action: '现场核验入住，正式划扣预付基础饲养费',
    note: `分配物理笼位：${cages.map((c) => c.code).join('、')}，记为真实 Day 1，基础费用已正式结转中心账户`,
  })
  log(`饲养订单 ${order.code} 入场，占用 ${targetCageIds.length} 个笼位`, 'feeding', feedingId)
  return done(`入场成功，占用 ${targetCageIds.length} 个笼位`, feedingId)
}

/** 笼位完成消杀，恢复空闲 */
export function completeCageCleaning(cageId: string): OpResult {
  const cage = data().cages.find((c) => c.id === cageId)
  if (!cage) return fail('笼位不存在')
  if (cage.status !== 'cleaning') return fail('该笼位不在待消杀状态')
  updateData((d) => ({
    ...d,
    cages: d.cages.map((c) => (c.id === cageId ? { ...c, status: 'free' as const } : c)),
  }))
  log(`笼位 ${cage.code} 完成清洗消杀，恢复空闲`, 'cage', cageId)
  return done(`笼位 ${cage.code} 已完成消杀，恢复空闲可用`)
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
          ? { ...c, status: 'cleaning' as const }
          : c,
    ),
    feedings: d.feedings.map((f) =>
      f.id === feeding.id
        ? {
            ...f,
            cageIds: [...f.cageIds.filter((id) => !input.removeCageIds.includes(id)), ...input.addCageIds],
            changeLogs: [
              ...(f.changeLogs || []),
              {
                at: input.date,
                action:
                  input.addCageIds.length && input.removeCageIds.length
                    ? `换笼调整（+${input.addCageIds.length}/-${input.removeCageIds.length}）`
                    : input.addCageIds.length
                      ? `分笼扩充（+${input.addCageIds.length} 笼）`
                      : `合笼归并（释放 ${input.removeCageIds.length} 笼）`,
                note: input.reason.trim(),
                operator: user.name,
                beforeCages: f.cageIds.length,
                afterCages: remaining,
              },
            ],
          }
        : f,
    ),
  }))

  const changeActionDesc =
    input.addCageIds.length && input.removeCageIds.length
      ? `换笼调整（+${input.addCageIds.length}/-${input.removeCageIds.length}）`
      : input.addCageIds.length
        ? `分笼扩充（+${input.addCageIds.length} 笼）`
        : `合笼归并（释放 ${input.removeCageIds.length} 笼）`

  addOrderEvent(feeding.orderId, {
    at: input.date,
    actor: user.name,
    action: `管理员巡房笼位调整：${changeActionDesc}，当前在养 ${remaining} 笼`,
    note: `${input.reason.trim()}（费用说明：申请期初费用不退，提前合笼释放笼位由中心线下补发饲料耗材平衡）`,
  })
  log(`饲养 ${feeding.id} 于 ${input.date} 变更笼位`, 'feeding', feeding.id)
  return done(`笼位变更已生效，当前占用 ${remaining} 个笼位`)
}

/* ---------------- 退出 ---------------- */

export function exitFeeding(feedingId: string, exitAt: string, reason: string, toCleaning = false): OpResult {
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
    cages: d.cages.map((c) =>
      released.includes(c.id) ? { ...c, status: toCleaning ? ('cleaning' as const) : ('free' as const) } : c,
    ),
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
