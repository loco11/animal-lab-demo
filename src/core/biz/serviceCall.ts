/** 现场取号：学生到窗口/屏障区取号排队，教师端右下角弹窗提醒并处理 */

import type { ServiceCall } from '../../types'
import { data, log, scoped, updateData } from '../data'
import { nowDateTime, uid } from '../utils'
import { done, fail, type OpResult } from './result'

/** 提取纯姓名：兼容「身份·姓名」与「姓名（单位）」两种格式 */
export function pureName(name: string): string {
  if (name.includes('·')) return name.split('·')[1] ?? name
  return name.replace(/（.*）/, '').trim()
}

/** 教师端取号队列：仅未办结的取号，按取号先后排序 */
export function listCalls(): ServiceCall[] {
  return scoped(data().serviceCalls)
    .filter((c) => c.status === 'waiting' || c.status === 'called')
    .sort((a, b) => a.seq - b.seq)
}

export function takeNumber(orderId: string): OpResult {
  const order = data().orders.find((o) => o.id === orderId)
  if (!order) return fail('订单不存在')
  const canOutstock = order.kind === 'internal' && order.fulfillStatus === 'pending_out'
  const canEntry = order.kind === 'breeding' && order.fulfillStatus === 'incoming'
  if (!canOutstock && !canEntry) return fail('该订单当前无需现场办理')

  const exists = data().serviceCalls.find(
    (c) => c.orderId === orderId && (c.status === 'waiting' || c.status === 'called'),
  )
  if (exists) return fail('该订单已取号，请勿重复取号')

  const id = uid('call')
  const call: ServiceCall = {
    id,
    labId: order.labId,
    orderId,
    seq: data().serviceCalls.length + 1,
    name: pureName(order.applicantName),
    no: order.applicantNo ?? '—',
    org: order.applicantOrg ?? '—',
    orderCode: order.code,
    orderKind: order.kind,
    biz: canOutstock ? 'outstock' : 'entry',
    createdAt: nowDateTime(),
    status: 'waiting',
  }
  updateData((d) => ({ ...d, serviceCalls: [call, ...d.serviceCalls] }))
  log(`订单 ${order.code} 现场取号（${call.biz === 'outstock' ? '出库' : '入住'}）`, 'serviceCall', orderId)
  return done(`取号成功，序号 ${String(call.seq).padStart(3, '0')}，请在窗口等候叫号`, id)
}

export function releaseCall(id: string): OpResult {
  const call = data().serviceCalls.find((c) => c.id === id)
  if (!call) return fail('取号记录不存在')
  updateData((d) => ({
    ...d,
    serviceCalls: d.serviceCalls.map((c) => (c.id === id ? { ...c, status: 'released' } : c)),
  }))
  log(`取号 ${String(call.seq).padStart(3, '0')}（${call.name}）已释放`, 'serviceCall', call.orderId)
  return done(`已释放「${call.name}」的取号`)
}

export function markDone(id: string): OpResult {
  const call = data().serviceCalls.find((c) => c.id === id)
  if (!call) return fail('取号记录不存在')
  updateData((d) => ({
    ...d,
    serviceCalls: d.serviceCalls.map((c) => (c.id === id ? { ...c, status: 'done' } : c)),
  }))
  return done(`「${call.name}」办理完成`)
}
