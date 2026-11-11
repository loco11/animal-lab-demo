/** 统一订单：三种类型共用一个列表与详情，按类型决定后续动作 */

import type { Order, OrderEvent, OrderKind, Service } from '../../types'
import { assertAction, getCurrentUser } from '../auth'
import { data, log, nextSeq, scoped, updateData } from '../data'
import { AUDIT_STATUS_TEXT, FULFILL_TEXT, KIND_INITIAL_FULFILL, KIND_TEXT, auditPassed } from '../labels'
import { todayStr, uid } from '../utils'
import { generateInternalFee } from './fee'
import { hasOutFlowFor, businessOut } from './stock'
import { done, fail, type OpResult } from './result'

export function listOrders(): Order[] {
  return scoped(data().orders)
}

export function orderById(id: string): Order | undefined {
  return data().orders.find((o) => o.id === id)
}

/** 当前范围内、已上架的可选服务（下架服务不出现在新订单中，已有订单不受影响） */
export function selectableServices(kind: OrderKind): Service[] {
  const type = kind === 'breeding' ? 'breeding' : 'animal'
  return scoped(data().services).filter((s) => s.onSale && s.type === type)
}

export interface AgentOrderInput {
  kind: OrderKind
  serviceId: string
  quantity: number
  applicantName: string
  applicantOrg: string
  externalCustomerId?: string
  newCustomerName?: string
  newCustomerContact?: string
  newCustomerPhone?: string
  projectId?: string
  supplierId?: string
  expectDate?: string
  remark?: string
}

/** 管理员代录订单：客户与操作人分别记录，外部客户不生成登录账号 */
export function createAgentOrder(input: AgentOrderInput): OpResult {
  const guard = assertAction('order:create')
  if (!guard.ok) return fail(guard.message)

  const service = data().services.find((s) => s.id === input.serviceId)
  if (!service) return fail('请选择服务')
  if (!service.onSale) return fail('该服务已下架，不能用于新增订单')
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) return fail('数量必须为正整数')
  if (!input.applicantName.trim()) return fail('请填写申请人')

  const user = getCurrentUser()
  let customerId = input.externalCustomerId
  if (input.kind === 'external') {
    if (!customerId && !input.newCustomerName?.trim()) return fail('外购订单需选择或新增外部客户')
    if (!customerId && input.newCustomerName?.trim()) {
      customerId = uid('cu')
      updateData((d) => ({
        ...d,
        customers: [
          {
            id: customerId!,
            labId: user.labId,
            name: input.newCustomerName!.trim(),
            type: 'person',
            contact: input.newCustomerContact?.trim() ?? '',
            phone: input.newCustomerPhone?.trim() ?? '',
            note: '由管理员代录时新增，外部客户不拥有登录账号',
          },
          ...d.customers,
        ],
      }))
      log(`新增外部客户 ${input.newCustomerName.trim()}`, 'customer', customerId)
    }
  }

  if (input.kind === 'internal' && !service.stockItemId) {
    return fail('该动物订购服务未配置库存品目，不能作为内部订单代录')
  }

  const auditPending = service.auditMode !== 'none'
  const orderId = uid('or')
  const code = nextOrderCode(user.labId)
  const order: Order = {
    id: orderId,
    labId: user.labId,
    code,
    kind: input.kind,
    serviceId: service.id,
    serviceName: service.name,
    itemName: service.name,
    spec: service.spec,
    unit: service.unit,
    quantity: input.quantity,
    unitPriceFen: service.unitPriceFen,
    auditMode: service.auditMode,
    auditStatus: auditPending ? 'pending' : 'none',
    fulfillStatus: KIND_INITIAL_FULFILL[input.kind],
    source: 'agent',
    stockItemId: input.kind === 'internal' ? service.stockItemId : undefined,
    supplierId: input.kind === 'external' ? (input.supplierId || service.supplierId) : undefined,
    applicantName: input.applicantName.trim(),
    applicantOrg: input.applicantOrg.trim(),
    externalCustomerId: input.kind === 'external' ? customerId : undefined,
    confirmedAmountFen: input.kind === 'external' ? input.quantity * service.unitPriceFen : undefined,
    projectId: input.projectId,
    expectDate: input.expectDate,
    remark: input.remark,
    createdAt: todayStr(),
    updatedAt: todayStr(),
    history: [
      {
        at: todayStr(),
        actor: user.name,
        action: '管理员代录订单',
        note: `${KIND_TEXT[input.kind]}；申请人 ${input.applicantName.trim()}${
          input.kind === 'external' ? '；外部客户由操作数登记' : ''
        }`,
      },
    ],
  }

  updateData((d) => ({ ...d, orders: [order, ...d.orders] }))
  log(`代录订单 ${code}`, 'order', orderId)
  return done(`代录订单 ${code} 已提交${auditPending ? '，等待确认' : '，直接进入' + FULFILL_TEXT[order.fulfillStatus]}`, orderId)
}

export function approveOrder(id: string): OpResult {
  const guard = assertAction('order:approve')
  if (!guard.ok) return fail(guard.message)
  const order = orderById(id)
  if (!order) return fail('订单不存在')
  if (order.labId !== getCurrentUser().labId) return fail('不能处理其他实验室的订单')
  if (order.auditStatus !== 'pending') return fail('该订单不在待确认状态')

  patch(order.id, {
    auditStatus: 'approved',
    history: [
      ...order.history,
      {
        at: todayStr(),
        actor: getCurrentUser().name,
        action: order.auditMode === 'hall' ? '服务大厅审批通过' : '中心确认通过',
        note: '审核通过只进入履约，不标记为完成',
      },
    ],
  })
  log(`订单 ${order.code} 审核通过`, 'order', order.id)
  return done(`订单 ${order.code} 已通过，可继续${order.kind === 'internal' ? '出库' : order.kind === 'external' ? '汇总发送' : '入场'}`)
}

export function rejectOrder(id: string, reason: string): OpResult {
  const guard = assertAction('order:reject')
  if (!guard.ok) return fail(guard.message)
  const order = orderById(id)
  if (!order) return fail('订单不存在')
  if (order.labId !== getCurrentUser().labId) return fail('不能处理其他实验室的订单')
  if (order.auditStatus !== 'pending') return fail('该订单不在待确认状态')
  if (!reason.trim()) return fail('退回必须填写原因')

  patch(order.id, {
    auditStatus: 'rejected',
    rejectReason: reason.trim(),
    history: [
      ...order.history,
      {
        at: todayStr(),
        actor: getCurrentUser().name,
        action: order.auditMode === 'hall' ? '服务大厅审批退回' : '退回申请',
        note: reason.trim(),
      },
    ],
  })
  log(`订单 ${order.code} 被退回`, 'order', order.id)
  return done(`订单 ${order.code} 已退回，未通过确认不能出库、发送或入场`)
}

/** 内部订单出库：库存不足阻止，重复点击不重复扣库存 */
export function shipOrder(id: string): OpResult {
  const guard = assertAction('order:outstock')
  if (!guard.ok) return fail(guard.message)
  const order = orderById(id)
  if (!order) return fail('订单不存在')
  if (order.kind !== 'internal') return fail('只有内部动物订购需要出库')
  if (order.labId !== getCurrentUser().labId) return fail('不能处理其他实验室的订单')
  if (!auditPassed(order.auditStatus)) return fail('订单未通过确认，不能出库')
  if (order.fulfillStatus === 'completed') return fail('订单已完成，不能再次出库')
  if (!order.stockItemId) return fail('订单未关联库存品目')
  if (hasOutFlowFor(order.id)) return fail('该订单已出库，重复点击不会再次扣减库存')

  const out = businessOut({
    itemId: order.stockItemId,
    quantity: order.quantity,
    reason: `订单 ${order.code} 出库`,
    refType: 'order',
    refId: order.id,
  })
  if (!out.ok) return out

  patch(order.id, {
    fulfillStatus: 'completed',
    history: [
      ...order.history,
      { at: todayStr(), actor: getCurrentUser().name, action: `出库 ${order.quantity}${order.unit}` },
      { at: todayStr(), actor: '系统', action: '订单完成' },
    ],
  })

  const fee = generateInternalFee(orderById(order.id)!)
  return done(`订单 ${order.code} 已出库并完成${fee.ok ? `，${fee.message}` : `，但${fee.message}`}`)
}

/** 外购：管理员确认金额后手动生成费用；异常不自动改写 */
export function confirmExternalAmount(id: string, amountFen: number): OpResult {
  const guard = assertAction('order:approve')
  if (!guard.ok) return fail(guard.message)
  const order = orderById(id)
  if (!order) return fail('订单不存在')
  if (order.kind !== 'external') return fail('只有外购订单需要确认金额')
  if (order.labId !== getCurrentUser().labId) return fail('不能处理其他实验室的订单')
  if (!auditPassed(order.auditStatus)) return fail('订单未通过确认，不能确认金额')
  if (!Number.isInteger(amountFen) || amountFen < 0) return fail('请输入合法金额')

  patch(order.id, {
    confirmedAmountFen: amountFen,
    history: [...order.history, { at: todayStr(), actor: getCurrentUser().name, action: `确认发生金额 ${amountFen / 100} 元` }],
  })
  log(`订单 ${order.code} 确认金额 ${amountFen / 100} 元`, 'order', order.id)
  return done(`已确认金额 ${amountFen / 100} 元，可生成费用`)
}

/* ---------------- 内部工具 ---------------- */

function patch(id: string, changes: Partial<Order>): void {
  updateData((d) => ({
    ...d,
    orders: d.orders.map((o) => (o.id === id ? { ...o, ...changes, updatedAt: todayStr() } : o)),
  }))
}

export function addOrderEvent(orderId: string, event: OrderEvent): void {
  updateData((d) => ({
    ...d,
    orders: d.orders.map((o) => (o.id === orderId ? { ...o, history: [...o.history, event], updatedAt: todayStr() } : o)),
  }))
}

export function nextOrderCode(labId: string): string {
  const prefix = labId === 'animal' ? 'AD-ORD-' : 'AN-ORD-'
  const count = data().orders.filter((o) => o.labId === labId).length + 1
  return `${prefix}${String(nextSeq(`order:${labId}`, count)).padStart(4, '0')}`
}

export function statusSummary(order: Order): string {
  return `${KIND_TEXT[order.kind]} · ${AUDIT_STATUS_TEXT[order.auditStatus]} · ${FULFILL_TEXT[order.fulfillStatus]}`
}
