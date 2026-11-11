/** 统一数据访问层：所有列表取数必须经过这里，保证实验室隔离 */

import type { AuditLog, DemoData } from '../types'
import { getState, scopeLabId, setState } from './store'

export function data(): DemoData {
  return getState().data
}

/** 按当前数据范围过滤（全校视图返回全部，但该视图下不可新增或处理业务） */
export function scoped<T extends { labId: string }>(list: T[]): T[] {
  const labId = scopeLabId()
  if (!labId) return list
  return list.filter((x) => x.labId === labId)
}

export function updateData(mutator: (prev: DemoData) => DemoData): void {
  setState((s) => ({ ...s, data: mutator(s.data) }))
}

export function findById<T extends { id: string }>(list: T[], id: string): T | undefined {
  return list.find((x) => x.id === id)
}

/** 递增序列，用于生成可读的稳定业务编号 */
export function nextSeq(key: string, start = 1): number {
  const cur = data().sequences[key] ?? start - 1
  updateData((d) => ({ ...d, sequences: { ...d.sequences, [key]: cur + 1 } }))
  return cur + 1
}

export function nextCode(key: string, prefix: string): string {
  return `${prefix}${String(nextSeq(key)).padStart(4, '0')}`
}

/** 操作记录：所有状态变更均留痕，便于演示追溯 */
export function log(action: string, refType = '', refId = '', actor?: string): void {
  const operator = actor ?? currentActorName()
  updateData((d) => {
    const entry: AuditLog = {
      id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      labId: scopeLabId() ?? getState().currentLabId,
      at: new Date().toISOString().slice(0, 10),
      actor: operator,
      action,
      refType,
      refId,
    }
    return { ...d, logs: [entry, ...d.logs] }
  })
}

export function currentLabId(): string {
  return getState().currentLabId
}

function currentActorName(): string {
  const s = getState()
  return s.data.users.find((u) => u.id === s.currentUserId)?.name ?? '演示账号'
}
