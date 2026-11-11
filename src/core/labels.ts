/** 状态字典与展示文本：统一口径，页面与账单一致 */

import type { AuditMode, AuditStatus, FulfillStatus, OrderKind } from '../types'
import type { TagTone } from '../ui'

export const AUDIT_MODE_TEXT: Record<AuditMode, string> = {
  none: '无需审核',
  system: '系统内确认',
  hall: '服务大厅审批',
}

export const AUDIT_STATUS_TEXT: Record<AuditStatus, string> = {
  none: '无需审核',
  pending: '待确认',
  approved: '已通过',
  rejected: '已退回',
}

export const FULFILL_TEXT: Record<FulfillStatus, string> = {
  pending_out: '待出库',
  completed: '已完成',
  pending_collect: '待汇总',
  pending_send: '待发送',
  sent: '已发送供应商',
  incoming: '待入场',
  breeding: '在养',
  exited: '已退出',
}

export const KIND_TEXT: Record<OrderKind, string> = {
  internal: '内部动物订购',
  external: '外购动物',
  breeding: '饲养寄养',
}

export const KIND_INITIAL_FULFILL: Record<OrderKind, FulfillStatus> = {
  internal: 'pending_out',
  external: 'pending_collect',
  breeding: 'incoming',
}

export function auditTone(s: AuditStatus): TagTone {
  if (s === 'approved') return 'success'
  if (s === 'rejected') return 'danger'
  if (s === 'pending') return 'warning'
  return 'default'
}

export function fulfillTone(s: FulfillStatus): TagTone {
  if (s === 'completed' || s === 'sent' || s === 'exited') return 'success'
  if (s === 'breeding') return 'primary'
  return 'warning'
}

/** 订单是否已完成审核环节（无需审核或已通过） */
export function auditPassed(auditStatus: AuditStatus): boolean {
  return auditStatus === 'approved' || auditStatus === 'none'
}
