/** 业务操作的统一返回：成功或失败原因，页面只负责提示 */

export interface OpResult {
  ok: boolean
  message: string
  /** 部分操作需要把新增实体 ID 交回页面 */
  id?: string
}

export function done(message: string, id?: string): OpResult {
  return id ? { ok: true, message, id } : { ok: true, message }
}

export function fail(message: string): OpResult {
  return { ok: false, message }
}
