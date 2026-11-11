/**
 * 学校经费扣费接口的模拟适配层（演示用）。
 * 只做本地模拟：不请求真实学校域名，不返回真实余额或流水。
 * 后续替换真实实现时，只需改这一个文件，调用方无需变更。
 */

export type ChargeOutcomeMode = 'success' | 'failed' | 'unknown'

export interface ChargeSubmitInput {
  bizSeq: string
  amountFen: number
  projectId: string
  applicantName: string
  labId: string
}

export type ChargeOutcome =
  | { kind: 'processing'; message: string }
  | { kind: 'success'; schoolSeq: string; message: string }
  | { kind: 'failed'; reason: string; message: string }
  | { kind: 'unknown'; message: string }

/** 提交扣费：真实接口为异步，这里同样先返回处理中，再由“查询结果”推进 */
export function submitCharge(input: ChargeSubmitInput): ChargeOutcome {
  return {
    kind: 'processing',
    message: `已向学校扣费接口提交：业务流水 ${input.bizSeq}，等待处理`,
  }
}

/** 查询扣费结果：由演示控件决定返回成功、明确失败或结果暂未知 */
export function queryCharge(bizSeq: string, mode: ChargeOutcomeMode, queryCount: number): ChargeOutcome {
  const seq = `SCH-${hash(bizSeq)}`
  if (mode === 'success') {
    return { kind: 'success', schoolSeq: seq, message: '学校接口返回扣费成功' }
  }
  if (mode === 'failed') {
    return {
      kind: 'failed',
      reason: '项目可用额度不足或项目状态异常',
      message: '学校接口返回明确失败',
    }
  }
  return {
    kind: 'unknown',
    message: `第 ${queryCount} 次查询结果暂未知，保持处理中，请稍后再次查询`,
  }
}

function hash(input: string): string {
  let h = 0
  for (let i = 0; i < input.length; i++) h = (h * 31 + input.charCodeAt(i)) >>> 0
  return String(h % 100000).padStart(5, '0')
}
