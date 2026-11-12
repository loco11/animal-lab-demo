/**
 * 关键业务规则自动化验证（Vitest，Node 环境，不依赖 DOM）。
 * 覆盖：数据范围隔离、内部出库与库存、盘点、外购汇总发送与异常、
 * 饲养入场与耗材、区间计费、学校扣费模拟的成功／失败／暂未知与防重。
 */

import { beforeEach, describe, expect, it } from 'vitest'

import { canAction, canViewPath, switchUser } from '../core/auth'
import { toggleRole } from '../core/biz/system'
import { resetState } from '../core/store'
import { getState } from '../core/store'
import { data } from '../core/data'
import { approveOrder, listOrders, shipOrder } from '../core/biz/orders'
import { adjustStock, batchStockCheck, createStockItem, importStockItems, stockIn, stockLoss } from '../core/biz/stock'
import { createSupplier, createSupplierItem, markOrdersSent, registerAnomaly, toggleSupplier, toggleSupplierItem, updateAnomalyStatus, updateSupplier, updateSupplierItem } from '../core/biz/purchase'
import {
  allocateCages,
  checkAndReleaseExpiredReservations,
  completeCageCleaning,
  entryFeeding,
  exitFeeding,
  freeCages,
  generateFeedingFee,
  quoteFeedingFee,
  takeSupply,
} from '../core/biz/feeding'
import { queryResult, retryCharge, setChargeOutcome, submitCharge } from '../core/biz/fee'

const ANIMAL = 'animal'
const order = (id: string) => data().orders.find((o) => o.id === id)!
const stock = (id: string) => data().stockItems.find((s) => s.id === id)!
const feeOf = (orderId: string) => data().fees.find((f) => f.orderId === orderId && !f.periodStart)!
const flowCount = (orderId: string) => data().stockFlows.filter((f) => f.refId === orderId && f.type === 'out').length

beforeEach(() => {
  resetState()
  switchUser('u_animal')
})

describe('T01 实验室数据隔离', () => {
  it('分析测试中心管理员只看到本中心订单', () => {
    switchUser('u_analysis')
    const list = listOrders()
    expect(list.length).toBeGreaterThan(0)
    expect(list.every((o) => o.labId !== ANIMAL)).toBe(true)
  })

  it('直接操作其他实验室订单被拒绝，不改变数据', () => {
    switchUser('u_analysis')
    const before = getState()
    const result = shipOrder('or_ani_i1')
    expect(result.ok).toBe(false)
    expect(result.message).toContain('其他实验室')
    expect(order('or_ani_i1').fulfillStatus).toBe('pending_out')
    expect(getState().data.stockItems).toEqual(before.data.stockItems)
  })
})

describe('T14 / T15 内部订单整单出库', () => {
  it('T14 出库扣库存、生成唯一流水、订单完成，重复点击不重复出库', () => {
    expect(approveOrder('or_ani_i1').ok).toBe(true)
    expect(shipOrder('or_ani_i1').ok).toBe(true)
    expect(stock('st_ani_km').quantity).toBe(90)
    expect(flowCount('or_ani_i1')).toBe(1)
    expect(order('or_ani_i1').fulfillStatus).toBe('completed')

    const second = shipOrder('or_ani_i1')
    expect(second.ok).toBe(false)
    expect(stock('st_ani_km').quantity).toBe(90)
    expect(flowCount('or_ani_i1')).toBe(1)
  })

  it('T11 未通过确认不能出库；T15 库存不足被阻止且不改变台账', () => {
    const result = shipOrder('or_ani_i3')
    expect(result.ok).toBe(false)
    expect(result.message).toContain('库存不足')
    expect(order('or_ani_i3').fulfillStatus).toBe('pending_out')
    expect(flowCount('or_ani_i3')).toBe(0)
    expect(stock('st_ani_sd').quantity).toBe(20)
  })

  it('T26 出库自动按确认价格快照生成费用，重复生成被阻止', () => {
    expect(shipOrder('or_ani_i2').ok).toBe(true)
    const fee = feeOf('or_ani_i2')
    expect(fee.amountFen).toBe(10 * 2700)
    expect(shipOrder('or_ani_i2').ok).toBe(false)
    expect(data().fees.filter((f) => f.orderId === 'or_ani_i2').length).toBe(1)
  })
})

describe('T16 库存盘点调整', () => {
  it('禁止负库存，调整保留原因与差异流水', () => {
    const negative = adjustStock({ itemId: 'st_ani_km', quantity: -1, reason: '测试', refType: 'check', refId: 'st_ani_km' })
    expect(negative.ok).toBe(false)

    const ok = adjustStock({ itemId: 'st_ani_km', quantity: 80, reason: '盘亏核实', refType: 'check', refId: 'st_ani_km' })
    expect(ok.ok).toBe(true)
    expect(stock('st_ani_km').quantity).toBe(80)
    const check = data().stockChecks[0]
    expect(check.diff).toBe(-40)
    expect(check.reason).toBe('盘亏核实')
  })
})

describe('库存损耗登记与类别档案', () => {
  it('损耗登记即时扣减库存并生成 loss 流水，不关联订单、不产生费用', () => {
    const item = stock('st_ani_km')
    const before = item.quantity
    const feeBefore = data().fees.length

    const result = stockLoss({ itemId: item.id, quantity: 2, reason: '死亡' })
    expect(result.ok).toBe(true)
    expect(stock(item.id).quantity).toBe(before - 2)

    const flow = data().stockFlows.find((f) => f.id === result.id)!
    expect(flow.type).toBe('loss')
    expect(flow.refType).toBe('loss')
    expect(flow.quantity).toBe(-2)
    expect(flow.before).toBe(before)
    expect(flow.after).toBe(before - 2)
    expect(flow.reason).toBe('死亡')
    expect(data().fees.length).toBe(feeBefore)
  })

  it('损耗数量必须为正整数、原因必填、不能超过当前库存', () => {
    const item = stock('st_ani_km')
    expect(stockLoss({ itemId: item.id, quantity: 0, reason: '死亡' }).ok).toBe(false)
    expect(stockLoss({ itemId: item.id, quantity: 1.5, reason: '死亡' }).ok).toBe(false)
    expect(stockLoss({ itemId: item.id, quantity: 1, reason: '  ' }).ok).toBe(false)
    expect(stockLoss({ itemId: item.id, quantity: item.quantity + 1, reason: '死亡' }).ok).toBe(false)
    expect(stock(item.id).quantity).toBe(item.quantity)
  })

  it('无权限角色不能损耗登记', () => {
    switchUser('u_finance')
    expect(stockLoss({ itemId: 'st_ani_km', quantity: 1, reason: '死亡' }).ok).toBe(false)
  })

  it('类别档案驱动业务：维修配件可建档入库损耗，饲养领用拒绝活体动物', () => {
    const def = data().stockCategories.find((c) => c.id === 'cat_part')
    expect(def).toBeTruthy()
    expect(def!.isAnimal).toBe(false)
    expect(def!.lossReasons).toContain('损坏')

    const created = createStockItem({
      category: 'cat_part',
      name: '不锈钢螺丝钉',
      spec: 'M4×20',
      unit: '盒',
      location: '维修间',
      safeStock: 5,
    })
    expect(created.ok).toBe(true)
    const screwId = data().stockItems.find((s) => s.name === '不锈钢螺丝钉')!.id
    expect(stock(screwId).safeStock).toBe(5)
    expect(stockIn({ itemId: screwId, quantity: 20, reason: '采购到货', refType: 'manual', refId: screwId }).ok).toBe(true)
    expect(stock(screwId).quantity).toBe(20)
    expect(stockLoss({ itemId: screwId, quantity: 3, reason: '损坏' }).ok).toBe(true)
    expect(stock(screwId).quantity).toBe(17)

    // 饲养领用只允许非活体动物类别
    expect(takeSupply('fd_ani_1', 'st_ani_km', 1).ok).toBe(false)
  })

  it('批量盘点：一次提交多项，零差异也留痕，差异生成流水', () => {
    const result = batchStockCheck({
      entries: [
        { itemId: 'st_ani_km', counted: 118 },
        { itemId: 'st_ani_sd', counted: 20 },
        { itemId: 'st_ani_wt', counted: 61 },
      ],
      reason: '测试盘点',
    })
    expect(result.ok).toBe(true)
    expect(stock('st_ani_km').quantity).toBe(118)
    expect(stock('st_ani_sd').quantity).toBe(20)
    expect(stock('st_ani_wt').quantity).toBe(61)

    const checks = data().stockChecks.filter((c) => c.reason === '测试盘点')
    expect(checks.length).toBe(3)
    expect(new Set(checks.map((c) => c.batchNo)).size).toBe(1)
    expect(checks.find((c) => c.itemId === 'st_ani_sd')!.diff).toBe(0)
    expect(checks.find((c) => c.itemId === 'st_ani_wt')!.diff).toBe(1)

    const flows = data().stockFlows.filter((f) => f.type === 'check' && checks.some((c) => c.flowId === f.id))
    expect(flows.length).toBe(3)
  })

  it('批量盘点拒绝非法实盘数且不改变数据', () => {
    expect(batchStockCheck({ entries: [{ itemId: 'st_ani_km', counted: -1 }], reason: '日常核对' }).ok).toBe(false)
    expect(batchStockCheck({ entries: [{ itemId: 'st_ani_km', counted: 1.5 }], reason: '日常核对' }).ok).toBe(false)
    expect(stock('st_ani_km').quantity).toBe(120)
  })

  it('无权限角色不能批量盘点', () => {
    switchUser('u_finance')
    expect(batchStockCheck({ entries: [{ itemId: 'st_ani_km', counted: 1 }], reason: '日常核对' }).ok).toBe(false)
  })

  it('未知类别不能建档，安全库存必须为非负整数', () => {
    expect(createStockItem({ category: 'cat_ghost', name: '测试品目', spec: 'x', unit: '个', location: '' }).ok).toBe(false)
    expect(
      createStockItem({ category: 'cat_part', name: '测试品目', spec: 'x', unit: '个', location: '', safeStock: -1 }).ok,
    ).toBe(false)
  })
})

describe('入库登记与批量导入', () => {
  it('入库登记支持指定业务日期（补录历史入库）', () => {
    const result = stockIn({
      itemId: 'st_ani_km',
      quantity: 5,
      reason: '补录历史入库',
      refType: 'manual',
      refId: 'st_ani_km',
      at: '2026-10-10',
    })
    expect(result.ok).toBe(true)
    const flow = data().stockFlows.find((f) => f.id === result.id)!
    expect(flow.createdAt.startsWith('2026-10-10 ')).toBe(true)
    expect(flow.createdAt).toMatch(/^2026-10-10 \d{2}:\d{2}:\d{2}$/)
    expect(flow.quantity).toBe(5)
    expect(flow.reason).toBe('补录历史入库')
    expect(stock('st_ani_km').quantity).toBe(125)
  })

  it('入库来源为供应商到货时必须选择供应商与供应条目，并写入流水', () => {
    expect(
      stockIn({ itemId: 'st_ani_km', quantity: 5, reason: '供应商到货', refType: 'manual', refId: 'st_ani_km', sourceType: 'supplier' }).ok,
    ).toBe(false)
    expect(
      stockIn({
        itemId: 'st_ani_km',
        quantity: 5,
        reason: '供应商到货',
        refType: 'manual',
        refId: 'st_ani_km',
        sourceType: 'supplier',
        supplierId: 'su_ani_1',
      }).ok,
    ).toBe(false)
    // 条目不属于该供应商
    expect(
      stockIn({
        itemId: 'st_ani_km',
        quantity: 5,
        reason: '供应商到货',
        refType: 'manual',
        refId: 'st_ani_km',
        sourceType: 'supplier',
        supplierId: 'su_ani_1',
        supplierItemId: 'si_ani_feed',
      }).ok,
    ).toBe(false)
    expect(stock('st_ani_km').quantity).toBe(120)

    const res = stockIn({
      itemId: 'st_ani_km',
      quantity: 5,
      reason: '供应商到货',
      refType: 'manual',
      refId: 'st_ani_km',
      sourceType: 'supplier',
      supplierId: 'su_ani_1',
      supplierItemId: 'si_ani_km',
    })
    expect(res.ok).toBe(true)
    const flow = data().stockFlows.find((f) => f.id === res.id)!
    expect(flow.sourceType).toBe('supplier')
    expect(flow.supplierId).toBe('su_ani_1')
    expect(flow.supplierItemId).toBe('si_ani_km')
  })

  it('中心自产入库为内部来源，不带供应商', () => {
    const res = stockIn({
      itemId: 'st_ani_km',
      quantity: 2,
      reason: '中心自繁登记',
      refType: 'manual',
      refId: 'st_ani_km',
      sourceType: 'internal',
    })
    const flow = data().stockFlows.find((f) => f.id === res.id)!
    expect(flow.sourceType).toBe('internal')
    expect(flow.supplierId).toBeUndefined()
  })

  it('批量导入按模板建档，期初数量生成期初入库流水，失败行有原因', () => {
    const result = importStockItems([
      { line: 2, categoryName: '维修配件', name: '六角螺栓', spec: 'M6×30', unit: '盒', location: '维修间', safeStock: '5', initialQuantity: '30' },
      { line: 3, categoryName: '不存在类别', name: 'X', spec: 'x', unit: '个', location: '', safeStock: '', initialQuantity: '' },
      { line: 4, categoryName: '实验动物', name: '', spec: 'x', unit: '只', location: '', safeStock: '', initialQuantity: '' },
      { line: 5, categoryName: '饲料垫料', name: '辐照灭菌垫料', spec: '5kg/包', unit: 'kg', location: '', safeStock: '20', initialQuantity: '' },
    ])
    expect(result.created).toBe(2)
    expect(result.failed.length).toBe(2)
    expect(result.message).toContain('成功 2 条')
    expect(result.message).toContain('失败 2 条')

    const bolt = data().stockItems.find((s) => s.name === '六角螺栓')!
    expect(bolt.quantity).toBe(30)
    expect(bolt.safeStock).toBe(5)
    const flow = data().stockFlows.find((f) => f.itemId === bolt.id && f.type === 'in')!
    expect(flow.reason).toBe('期初库存导入')
    expect(flow.quantity).toBe(30)
  })

  it('种子出库流水关联历史已完成订单，可直接查看订单号', () => {
    const flow = data().stockFlows.find((f) => f.type === 'out' && f.refType === 'order')
    expect(flow).toBeTruthy()
    const order = data().orders.find((o) => o.id === flow!.refId)
    expect(order).toBeTruthy()
    expect(order!.fulfillStatus).toBe('completed')
    expect(flow!.reason).toContain(order!.code)
  })

  it('批量导入拒绝重复品目，并校验安全库存/期初数量', () => {
    const dup = importStockItems([
      { line: 2, categoryName: '实验动物', name: 'KM小鼠', spec: 'SPF级，4周龄', unit: '只', location: '', safeStock: '', initialQuantity: '' },
    ])
    expect(dup.created).toBe(0)
    expect(dup.failed.length).toBe(1)
    expect(dup.failed[0].reason).toContain('已存在')

    const bad = importStockItems([
      { line: 2, categoryName: '维修配件', name: '扳手', spec: '10寸', unit: '把', location: '', safeStock: '-1', initialQuantity: '' },
      { line: 3, categoryName: '维修配件', name: '钳子', spec: '8寸', unit: '把', location: '', safeStock: '', initialQuantity: '1.5' },
    ])
    expect(bad.created).toBe(0)
    expect(bad.failed.length).toBe(2)
  })
})

describe('T18 / T19 / T20 外购汇总、发送与异常', () => {
  it('生成跨供应商发送批次后订单标记已发送，不产生库存变化且不可重复', () => {
    const before = data().stockItems.reduce((sum, s) => sum + s.quantity, 0)

    const res = markOrdersSent(['or_ani_e2', 'or_ani_e9', 'or_ani_e7'])
    expect(res.ok).toBe(true)
    expect(order('or_ani_e2').fulfillStatus).toBe('sent')
    expect(order('or_ani_e9').fulfillStatus).toBe('sent')
    expect(order('or_ani_e7').fulfillStatus).toBe('sent')

    // 生成一条已发送批次，覆盖 3 家供应商
    const batch = data().purchaseBatches.find((b) => b.id === res.id)!
    expect(batch).toBeTruthy()
    expect(batch.status).toBe('sent')
    expect(batch.orderIds.length).toBe(3)
    expect(batch.supplierIds.length).toBe(3)

    const after = data().stockItems.reduce((sum, s) => sum + s.quantity, 0)
    expect(after).toBe(before)

    // 防止重复发送
    expect(markOrdersSent(['or_ani_e2']).ok).toBe(false)
  })

  it('新增供应商可带多个供应条目，编码自动生成且唯一（名称可重复）', () => {
    const res = createSupplier({
      name: '测试供应商',
      contact: '',
      phone: '',
      items: [
        { kind: 'animal', name: 'KM小鼠', spec: 'SPF级 4周龄', unit: '只', priceFen: 4500 },
        { kind: 'supply', name: '玉米芯垫料', spec: '5kg/包', unit: 'kg', priceFen: 800 },
      ],
    })
    expect(res.ok).toBe(true)
    const items = data().supplierItems.filter((i) => i.supplierId === res.id)
    expect(items.length).toBe(2)
    expect(new Set(items.map((i) => i.code)).size).toBe(2)
    expect(items.every((i) => i.code.startsWith('SI-'))).toBe(true)
  })

  it('供应条目可新增、编辑、停用', () => {
    const added = createSupplierItem('su_ani_1', {
      kind: 'animal',
      name: 'BALB/c小鼠',
      spec: 'SPF级 6周龄',
      unit: '只',
      priceFen: 8500,
    })
    expect(added.ok).toBe(true)
    const item = data().supplierItems.find((i) => i.id === added.id)!
    expect(
      updateSupplierItem(item.id, { kind: 'animal', name: 'BALB/c小鼠', spec: 'SPF级 7周龄', unit: '只', priceFen: 9000 }).ok,
    ).toBe(true)
    expect(toggleSupplierItem(item.id, false).ok).toBe(true)
    expect(data().supplierItems.find((i) => i.id === item.id)!.enabled).toBe(false)
  })

  it('供应商可编辑、停用/启用', () => {
    const edit = updateSupplier('su_ani_4', { name: '贵阳黔灵饲料有限公司', contact: '周经理', phone: '0851-8650-0004', note: '' })
    expect(edit.ok).toBe(true)
    expect(toggleSupplier('su_ani_4', false).ok).toBe(true)
    expect(data().suppliers.find((s) => s.id === 'su_ani_4')!.enabled).toBe(false)
    expect(toggleSupplier('su_ani_4', true).ok).toBe(true)
  })

  it('无权限角色不能维护供应商', () => {
    switchUser('u_finance')
    expect(createSupplier({ name: '测试', contact: '', phone: '' }).ok).toBe(false)
  })

  it('外购订单可按订单标记已处理（发送供应商），单笔也生成批次且不可重复', () => {
    expect(approveOrder('or_ani_e1').ok).toBe(true)
    const res = markOrdersSent(['or_ani_e1'])
    expect(res.ok).toBe(true)
    expect(order('or_ani_e1').fulfillStatus).toBe('sent')
    const batch = data().purchaseBatches.find((b) => b.id === res.id)!
    expect(batch.orderIds).toEqual(['or_ani_e1'])
    expect(markOrdersSent(['or_ani_e1']).ok).toBe(false)
  })

  it('一个发送批次可跨多个供应商', () => {
    const res = markOrdersSent(['or_ani_e2', 'or_ani_e9'])
    expect(res.ok).toBe(true)
    const batch = data().purchaseBatches.find((b) => b.id === res.id)!
    expect(batch.supplierIds.length).toBe(2)
  })

  it('T20 异常关联原订单，不改变交付状态与金额', () => {
    const beforeAmount = order('or_ani_e3').confirmedAmountFen
    const created = registerAnomaly({
      orderId: 'or_ani_e3',
      type: 'short',
      description: '学生反馈少供应 1 只',
      feedbackBy: '黄同学',
    })
    expect(created.ok).toBe(true)
    expect(order('or_ani_e3').fulfillStatus).toBe('sent')
    expect(order('or_ani_e3').confirmedAmountFen).toBe(beforeAmount)

    expect(updateAnomalyStatus(created.id!, 'following', '已联系供应商核实').ok).toBe(true)
    const anomaly = data().anomalies.find((a) => a.id === created.id)!
    expect(anomaly.status).toBe('following')
    expect(anomaly.logs.length).toBeGreaterThan(1)
  })
})

describe('T21 / T23 / T24 / T25 饲养入场、笼位与耗材', () => {
  it('T21 不能选已占用或已停用笼位；入场后开始占用', () => {
    expect(approveOrder('or_ani_b1').ok).toBe(true)

    const occupied = entryFeeding('or_ani_b1', ['cg_ani_a1'], '2026-10-24')
    expect(occupied.ok).toBe(false)
    expect(occupied.message).toContain('已被占用')

    const disabled = entryFeeding('or_ani_b1', ['cg_ani_b3'], '2026-10-24')
    expect(disabled.ok).toBe(false)
    expect(disabled.message).toContain('停用')

    const ok = entryFeeding('or_ani_b1', ['cg_ani_a3'], '2026-10-24')
    expect(ok.ok).toBe(true)
    expect(data().cages.find((c) => c.id === 'cg_ani_a3')!.status).toBe('occupied')
    expect(order('or_ani_b1').fulfillStatus).toBe('breeding')

    // 重复入场被拒绝
    expect(entryFeeding('or_ani_b1', ['cg_ani_a4'], '2026-10-24').ok).toBe(false)
  })

  it('T24 耗材领用扣一次库存，重复点击不重复扣', () => {
    const before = stock('st_ani_feed').quantity
    expect(takeSupply('fd_ani_1', 'st_ani_feed', 5).ok).toBe(true)
    expect(stock('st_ani_feed').quantity).toBe(before - 5)

    const again = takeSupply('fd_ani_1', 'st_ani_feed', 5)
    expect(again.ok).toBe(false)
    expect(stock('st_ani_feed').quantity).toBe(before - 5)
    expect(data().supplyUsages.length).toBe(1)
  })

  it('T23 退出释放笼位并保留历史占用', () => {
    expect(exitFeeding('fd_ani_1', '2026-10-25', '实验结束').ok).toBe(true)
    expect(order('or_ani_b2').fulfillStatus).toBe('exited')
    expect(data().cages.find((c) => c.id === 'cg_ani_a1')!.status).toBe('free')
    const openEnded = data().occupancies.filter((o) => o.feedingId === 'fd_ani_1' && o.end === null)
    expect(openEnded.length).toBe(0)
    expect(data().occupancies.filter((o) => o.feedingId === 'fd_ani_1' && o.end === '2026-10-25').length).toBe(2)
  })
})

describe('T27 饲养区间计费', () => {
  it('10 月 1—3 日 2 笼、3—5 日 3 笼、10 元/笼·天 = 100 元', () => {
    const quote = quoteFeedingFee(data().feedings.find((f) => f.id === 'fd_ani_2')!, '2026-10-01', '2026-10-05')
    expect(quote.ok).toBe(true)
    expect(quote.amountFen).toBe(10000)
    expect(quote.segments.length).toBe(2)
    expect(quote.segments[0]).toMatchObject({ cages: 2, days: 2 })
    expect(quote.segments[1]).toMatchObject({ cages: 3, days: 2 })
  })

  it('同一区间不可重复生成，重叠区间被拒绝', () => {
    expect(generateFeedingFee('fd_ani_2', '2026-10-01', '2026-10-05').ok).toBe(true)
    expect(generateFeedingFee('fd_ani_2', '2026-10-01', '2026-10-05').ok).toBe(false)
    const overlap = generateFeedingFee('fd_ani_2', '2026-10-04', '2026-10-06')
    expect(overlap.ok).toBe(false)
    expect(overlap.message).toContain('重叠')
  })
})

describe('T28 / T29 / T31 / T32 / T33 学校扣费模拟', () => {
  it('T28 成功后不能再次扣费，业务状态不被改写', () => {
    const submit = submitCharge({ feeId: 'fe_ani_1', projectId: 'pj_ani_1', applicantName: '郑老师' })
    expect(submit.ok).toBe(true)

    // T30 重复提交被阻止
    expect(submitCharge({ feeId: 'fe_ani_1', projectId: 'pj_ani_1', applicantName: '郑老师' }).ok).toBe(false)

    setChargeOutcome('success')
    expect(queryResult(submit.id!).ok).toBe(true)
    expect(data().chargeRequests.find((r) => r.id === submit.id!)!.status).toBe('success')
    expect(order('or_ani_i4').fulfillStatus).toBe('completed')

    expect(submitCharge({ feeId: 'fe_ani_1', projectId: 'pj_ani_1', applicantName: '郑老师' }).ok).toBe(false)
  })

  it('T29 失败后可重试，最多一笔成功扣费', () => {
    const req = data().chargeRequests.find((r) => r.id === 'cr_ani_1')!
    expect(retryCharge(req.id).ok).toBe(true)

    setChargeOutcome('failed')
    expect(queryResult(req.id).ok).toBe(false)
    expect(data().chargeRequests.find((r) => r.id === req.id)!.status).toBe('failed')

    setChargeOutcome('success')
    expect(retryCharge(req.id).ok).toBe(true)
    expect(queryResult(req.id).ok).toBe(true)

    const successCount = data().chargeRequests.filter((r) => r.feeId === req.feeId && r.status === 'success').length
    expect(successCount).toBe(1)
    expect(data().chargeRequests.filter((r) => r.feeId === req.feeId).length).toBe(1)
  })

  it('T31 结果暂未知时保持处理中，且不产生新请求', () => {
    expect(shipOrder('or_ani_i1').ok).toBe(false) // 未确认，验证不能出库
    expect(approveOrder('or_ani_i1').ok).toBe(true)
    expect(shipOrder('or_ani_i1').ok).toBe(true)

    const fee = feeOf('or_ani_i1')
    const submit = submitCharge({ feeId: fee.id, projectId: 'pj_ani_1', applicantName: '陈同学' })
    expect(submit.ok).toBe(true)

    setChargeOutcome('unknown')
    expect(queryResult(submit.id!).ok).toBe(true)
    const after = data().chargeRequests.find((r) => r.id === submit.id!)!
    expect(after.status).toBe('processing')
    expect(after.queryCount).toBe(1)
    expect(data().chargeRequests.filter((r) => r.feeId === fee.id).length).toBe(1)

    // 处理中不允许再次提交
    expect(submitCharge({ feeId: fee.id, projectId: 'pj_ani_1', applicantName: '陈同学' }).ok).toBe(false)
  })

  it('T33 外部客户订单不做校内扣费', () => {
    const result = submitCharge({ feeId: 'fe_ani_3', projectId: 'pj_ani_1', applicantName: '示例外部联系人' })
    expect(result.ok).toBe(false)
    expect(result.message).toContain('外部结算待确认')
  })

  it('T32 不能为其他实验室费用扣费', () => {
    const animalFee = 'fe_ani_1'
    switchUser('u_analysis')
    const result = submitCharge({ feeId: animalFee, projectId: 'pj_ana_1', applicantName: '张分析' })
    expect(result.ok).toBe(false)
    expect(result.message).toContain('其他实验室')
  })
})

describe('T04 / T05 角色与权限', () => {
  it('停用角色后不再具备菜单与操作权限', () => {
    switchUser('u_finance')
    expect(canAction('fee:submit')).toBe(true)
    expect(canViewPath('/stock')).toBe(false)

    switchUser('u_super')
    expect(toggleRole('r_finance', false).ok).toBe(true)
    switchUser('u_finance')
    expect(canAction('fee:submit')).toBe(false)
  })

  it('超级管理员保护角色不允许停用', () => {
    expect(toggleRole('r_super', false).ok).toBe(false)
  })
})

describe('笼位时空排位预分配、2天保留释放与现场入住转正', () => {
  it('时空冲突检测：已预定/已占用的时间段被阻止，无重叠区间允许', () => {
    // cg_ani_a3 初始为空闲
    expect(freeCages('2026-11-20', '2026-11-30').some((c) => c.id === 'cg_ani_a3')).toBe(true)

    // 老师为 or_ani_b1 审核排位，锁定 11-20 ~ 11-30 的 cg_ani_a3 笼位
    const alloc = allocateCages('or_ani_b1', ['cg_ani_a3'], '2026-11-20', 10)
    expect(alloc.ok).toBe(true)
    expect(data().cages.find((c) => c.id === 'cg_ani_a3')!.status).toBe('reserved')

    // 在冲突时间段内（11-25）再次检测，cg_ani_a3 不再可用
    expect(freeCages('2026-11-25', '2026-11-28').some((c) => c.id === 'cg_ani_a3')).toBe(false)

    // 重复给另一订单分配冲突时间段的同一笼位会被拒绝
    expect(allocateCages('or_ani_b3', ['cg_ani_a3'], '2026-11-25', 5).ok).toBe(false)
  })

  it('2天保留机制：自动推导拟入场日+2天保留期限', () => {
    const alloc = allocateCages('or_ani_b1', ['cg_ani_a3'], '2026-11-20', 10)
    expect(alloc.ok).toBe(true)

    const ord = order('or_ani_b1')
    expect(ord.auditStatus).toBe('approved')
    expect(ord.reserveStatus).toBe('reserved')
    expect(ord.expectStartDate).toBe('2026-11-20')
    expect(ord.expectEndDate).toBe('2026-11-30')
    expect(ord.reserveExpireAt).toBe('2026-11-22') // 拟入场日 + 2天
    expect(ord.allocatedCageIds).toEqual(['cg_ani_a3'])
  })

  it('现场核验入住：预分配笼位一键转为在养 occupied，预付款正式划扣', () => {
    allocateCages('or_ani_b1', ['cg_ani_a3'], '2026-11-20', 10)

    // 现场直接入住转正
    const entry = entryFeeding('or_ani_b1', ['cg_ani_a3'], '2026-11-20')
    expect(entry.ok).toBe(true)

    expect(data().cages.find((c) => c.id === 'cg_ani_a3')!.status).toBe('occupied')
    const ord = order('or_ani_b1')
    expect(ord.fulfillStatus).toBe('breeding')
    expect(ord.feeStatus).toBe('charged')
    expect(ord.reserveStatus).toBe('checked_in')
  })

  it('2天超时自动释放：逾期未到校自动释放笼位回 free，订单打回待重新排位', () => {
    // 模拟排位在过去已超过2天的订单（拟入场：11-01，保留至：11-03）
    allocateCages('or_ani_b1', ['cg_ani_a3'], '2026-11-01', 10)
    expect(data().cages.find((c) => c.id === 'cg_ani_a3')!.status).toBe('reserved')

    // 触发过期检查（当前时间 > 11-03）
    const releasedCount = checkAndReleaseExpiredReservations()
    expect(releasedCount).toBeGreaterThanOrEqual(1)

    // 笼位恢复 free
    expect(data().cages.find((c) => c.id === 'cg_ani_a3')!.status).toBe('free')

    // 订单回退待确认
    const ord = order('or_ani_b1')
    expect(ord.auditStatus).toBe('pending')
    expect(ord.reserveStatus).toBe('expired_released')
    expect(ord.allocatedCageIds?.length).toBe(0)
    expect(ord.history.some((h) => h.action.includes('释放'))).toBe(true)
  })

  it('消杀流转：完成消杀一键恢复 free', () => {
    // 设某笼位为 cleaning
    const cage = data().cages.find((c) => c.id === 'cg_ani_a3')!
    cage.status = 'cleaning'

    expect(completeCageCleaning('cg_ani_a3').ok).toBe(true)
    expect(data().cages.find((c) => c.id === 'cg_ani_a3')!.status).toBe('free')

    // 非 cleaning 状态再次调用被拒绝
    expect(completeCageCleaning('cg_ani_a3').ok).toBe(false)
  })
})
