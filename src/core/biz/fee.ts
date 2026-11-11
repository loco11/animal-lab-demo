/** 费用与学校扣费模拟：金额一律从费用记录取值，提交弹窗不允许修改 */

import type { ChargeRequest, Fee, Order } from '../../types'
import { assertAction, getCurrentUser } from '../auth'
import { data, log, updateData } from '../data'
import { moneyText, todayStr, uid } from '../utils'
import type { ChargeOutcomeMode } from '../schoolapi'
import { queryCharge as apiQuery, submitCharge as apiSubmit } from '../schoolapi'
import { done, fail, type OpResult } from './result'

/* ---------------- 结果控件 ---------------- */

export function setChargeOutcome(mode: ChargeOutcomeMode): void {
  updateData((d) => ({ ...d, demo: { ...d.demo, chargeOutcome: mode } }))
}

export function chargeOutcome(): ChargeOutcomeMode {
  return data().demo.chargeOutcome
}

/* ---------------- 费用生成 ---------------- */

export function feesOfOrder(orderId: string): Fee[] {
  return data().fees.filter((f) => f.orderId === orderId)
}

/** 非饲养类费用每单只允许一笔，重复生成被阻止 */
export function plainFeeOf(orderId: string): Fee | undefined {
  return data().fees.find((f) => f.orderId === orderId && !f.periodStart)
}

/** 内部订购：出库后生成费用 = 出库数量 × 确认单价（价格快照） */
export function generateInternalFee(order: Order): OpResult {
  if (data().fees.some((f) => f.orderId === order.id && !f.periodStart)) {
    return fail('该订单费用已生成，不能重复生成')
  }
  const amountFen = order.quantity * order.unitPriceFen
  const fee: Fee = {
    id: uid('fe'),
    labId: order.labId,
    orderId: order.id,
    kind: order.kind,
    channel: 'internal',
    title: `${order.itemName} 订购费用`,
    basis: `出库 ${order.quantity}${order.unit} × 确认单价 ${order.unitPriceFen / 100} 元`,
    amountFen,
    createdAt: todayStr(),
    operator: getCurrentUser().name,
  }
  updateData((d) => ({ ...d, fees: [fee, ...d.fees] }))
  log(`生成订单 ${order.code} 费用 ${moneyText(amountFen)}`, 'order', order.id)
  return done(`已生成费用 ${moneyText(amountFen)}`, fee.id)
}

/** 外购：按申请数量 × 单价自动生成金额；异常不自动改写原费用 */
export function generateExternalFee(order: Order): OpResult {
  const guard = assertAction('fee:generate')
  if (!guard.ok) return fail(guard.message)
  if (data().fees.some((f) => f.orderId === order.id && !f.periodStart)) {
    return fail('该订单费用已生成，不能重复生成')
  }
  if (order.labId !== getCurrentUser().labId) return fail('不能处理其他实验室的费用')
  const amountFen = order.confirmedAmountFen || (order.quantity * order.unitPriceFen)
  if (!amountFen || amountFen <= 0) {
    return fail('外购订单金额必须大于 0')
  }
  const fee: Fee = {
    id: `fe_ext_${order.id}`,
    labId: order.labId,
    orderId: order.id,
    kind: 'external',
    channel: 'external',
    title: `${order.itemName} 外购费用（外部结算待确认）`,
    basis: `申请数量 ${order.quantity}${order.unit} × 单价 ${(order.unitPriceFen / 100).toFixed(2)} 元`,
    amountFen,
    createdAt: todayStr(),
    operator: getCurrentUser().name,
  }
  updateData((d) => ({ ...d, fees: [fee, ...d.fees] }))
  log(`生成外购订单 ${order.code} 费用 ${moneyText(fee.amountFen)}`, 'order', order.id)
  return done(`已生成费用 ${moneyText(fee.amountFen)}（外部结算待确认）`, fee.id)
}

/* ---------------- 扣费请求 ---------------- */

/** 费用的扣费状态由请求结果推导，与业务订单状态相互独立 */
export function feeChargeStatus(fee: Fee): { text: string; tone: 'default' | 'primary' | 'success' | 'warning' | 'danger' } {
  const reqs = requestsOfFee(fee.id)
  if (!reqs.length) {
    return fee.channel === 'external'
      ? { text: '外部结算待确认', tone: 'warning' }
      : { text: '待扣费', tone: 'warning' }
  }
  if (reqs.some((r) => r.status === 'success')) return { text: '扣费成功', tone: 'success' }
  const last = reqs[reqs.length - 1]
  if (last.status === 'failed') return { text: '扣费失败', tone: 'danger' }
  return { text: '扣费处理中', tone: 'primary' }
}

export function requestsOfFee(feeId: string): ChargeRequest[] {
  return data().chargeRequests.filter((r) => r.feeId === feeId)
}

export function latestRequest(feeId: string): ChargeRequest | undefined {
  const list = requestsOfFee(feeId)
  return list.length ? list[list.length - 1] : undefined
}

export interface SubmitInput {
  feeId: string
  projectId: string
  applicantName: string
}

/** 提交学校扣费：成功或处理中不允许重复提交，失败可重试且不产生第二笔成功 */
export function submitCharge(input: SubmitInput): OpResult {
  const guard = assertAction('fee:submit')
  if (!guard.ok) return fail(guard.message)

  const s = data()
  const fee = s.fees.find((f) => f.id === input.feeId)
  if (!fee) return fail('费用记录不存在')
  if (fee.labId !== getCurrentUser().labId) return fail('不能为其他实验室的费用提交扣费')

  if (fee.channel === 'external') {
    return fail('外部客户订单为“外部结算待确认”，本版不支持校内项目扣费')
  }
  if (!input.projectId) return fail('请选择扣费的校内经费项目')
  const project = s.projects.find((p) => p.id === input.projectId)
  if (!project || !project.enabled) return fail('所选经费项目不可用')
  if (!input.applicantName) return fail('请确认申请人')

  const existing = requestsOfFee(fee.id)
  const succeeded = existing.find((r) => r.status === 'success')
  if (succeeded) return fail('该费用已扣费成功，不能重复扣款')
  const pendingReq = existing.find((r) => r.status === 'processing')
  if (pendingReq) return fail('存在处理中的扣费请求，请先查询结果')

  // 业务标识按费用 ID 固定，保证重复点击、刷新或回调都指向同一请求
  const bizSeq = `BIZ-${fee.id}`
  const now = todayStr()

  const outcome = apiSubmit({ bizSeq, amountFen: fee.amountFen, projectId: project.id, applicantName: input.applicantName, labId: fee.labId })

  const base: ChargeRequest = {
    id: uid('cr'),
    labId: fee.labId,
    feeId: fee.id,
    orderId: fee.orderId,
    bizSeq,
    projectId: project.id,
    applicantName: input.applicantName,
    amountFen: fee.amountFen,
    status: 'processing',
    queryCount: 0,
    createdAt: now,
    updatedAt: now,
    attempts: [{ seq: 1, at: now, outcome: 'submit', message: outcome.message }],
  }

  updateData((d) => ({ ...d, chargeRequests: [...d.chargeRequests, base] }))
  log(`提交学校扣费：${fee.id} ${moneyText(fee.amountFen)}`, 'fee', fee.id)
  return done('已提交学校扣费接口，当前处理中，请稍后查询结果', base.id)
}

/** 查询结果：成功、明确失败或暂未知；失败保留尝试记录，可再次尝试 */
export function queryResult(requestId: string): OpResult {
  const s = data()
  const req = s.chargeRequests.find((r) => r.id === requestId)
  if (!req) return fail('扣费请求不存在')
  if (req.labId !== getCurrentUser().labId) return fail('不能查询其他实验室的扣费请求')
  if (req.status === 'success') return fail('该扣费已成功，无需再次查询')

  const mode = chargeOutcome()
  const queryCount = req.queryCount + 1
  const outcome = apiQuery(req.bizSeq, mode, queryCount)
  const now = todayStr()

  const patch = (r: ChargeRequest): ChargeRequest => ({
    ...r,
    queryCount,
    updatedAt: now,
    status: outcome.kind === 'success' ? 'success' : outcome.kind === 'failed' ? 'failed' : 'processing',
    schoolSeq: outcome.kind === 'success' ? outcome.schoolSeq : r.schoolSeq,
    failReason: outcome.kind === 'failed' ? outcome.reason : undefined,
    attempts: [
      ...r.attempts,
      {
        seq: r.attempts.length + 1,
        at: now,
        outcome: outcome.kind,
        message: outcome.kind === 'failed' ? `${outcome.message}：${outcome.reason}` : outcome.message,
      },
    ],
  })

  updateData((d) => ({
    ...d,
    chargeRequests: d.chargeRequests.map((r) => (r.id === req.id ? patch(r) : r)),
  }))

  log(`查询扣费结果：${outcome.message}`, 'fee', req.feeId)

  if (outcome.kind === 'success') return done(`扣费成功（流水 ${outcome.schoolSeq}）`)
  if (outcome.kind === 'failed') return fail(`扣费失败：${outcome.reason}，可再次尝试`)
  return done(outcome.message)
}

/** 失败重试：沿用同一请求与业务标识，只增加尝试记录 */
export function retryCharge(requestId: string): OpResult {
  const guard = assertAction('fee:submit')
  if (!guard.ok) return fail(guard.message)
  const s = data()
  const req = s.chargeRequests.find((r) => r.id === requestId)
  if (!req) return fail('扣费请求不存在')
  if (req.labId !== getCurrentUser().labId) return fail('不能操作其他实验室的扣费请求')
  if (req.status === 'success') return fail('该扣费已成功，不能重复扣款')
  if (req.status === 'processing') return fail('请求正在处理中，请先查询结果')

  const now = todayStr()
  updateData((d) => ({
    ...d,
    chargeRequests: d.chargeRequests.map((r) =>
      r.id === req.id
        ? {
            ...r,
            status: 'processing',
            updatedAt: now,
            failReason: undefined,
            attempts: [...r.attempts, { seq: r.attempts.length + 1, at: now, outcome: 'submit', message: '失败后重试提交' }],
          }
        : r,
    ),
  }))
  log('扣费失败后重试', 'fee', req.feeId)
  return done('已重新提交，进入处理中，请查询结果')
}
