/** 服务管理：只有动物订购与饲养两类实际服务，价格改动不影响已确认的价格快照 */

import type { AuditMode, Service, ServiceType } from '../../types'
import { assertAction, getCurrentUser } from '../auth'
import { data, log, scoped, updateData } from '../data'
import { todayStr, uid } from '../utils'
import { done, fail, type OpResult } from './result'

export function listServices(): Service[] {
  return scoped(data().services)
}

export interface ServiceInput {
  id?: string
  name: string
  type: ServiceType
  spec: string
  unit: string
  unitPriceFen: number
  auditMode: AuditMode
  onSale: boolean
  applyNote: string
  stockItemId?: string
  supplierId?: string
  supplierItemId?: string
}

export function saveService(input: ServiceInput): OpResult {
  const guard = assertAction('service:edit')
  if (!guard.ok) return fail(guard.message)
  if (!input.name.trim()) return fail('请填写服务名称')
  if (!input.unit.trim()) return fail('请填写计价单位')
  if (!Number.isInteger(input.unitPriceFen) || input.unitPriceFen <= 0) return fail('单价必须大于 0')

  if (input.id) {
    updateData((d) => ({
      ...d,
      services: d.services.map((s) =>
        s.id === input.id
          ? {
              ...s,
              name: input.name.trim(),
              type: input.type,
              spec: input.spec.trim(),
              unit: input.unit.trim(),
              unitPriceFen: input.unitPriceFen,
              auditMode: input.auditMode,
              onSale: input.onSale,
              applyNote: input.applyNote.trim(),
              stockItemId: input.stockItemId,
              supplierId: input.supplierId,
              supplierItemId: input.supplierItemId,
              updatedAt: todayStr(),
            }
          : s,
      ),
    }))
    log(`编辑服务 ${input.name}（已确认订单的价格快照不受影响）`, 'service', input.id)
    return done(`服务「${input.name.trim()}」已保存`)
  }

  const id = uid('sv')
  updateData((d) => ({
    ...d,
    services: [
      {
        id,
        labId: getCurrentUser().labId,
        type: input.type,
        name: input.name.trim(),
        spec: input.spec.trim(),
        unit: input.unit.trim(),
        unitPriceFen: input.unitPriceFen,
        auditMode: input.auditMode,
        onSale: input.onSale,
        applyNote: input.applyNote.trim(),
        stockItemId: input.stockItemId,
        supplierId: input.supplierId,
        supplierItemId: input.supplierItemId,
        updatedAt: todayStr(),
      },
      ...d.services,
    ],
  }))
  log(`新增服务 ${input.name}`, 'service', id)
  return done(`服务「${input.name.trim()}」已新增`, id)
}

export function toggleSale(id: string, onSale: boolean): OpResult {
  const guard = assertAction('service:edit')
  if (!guard.ok) return fail(guard.message)
  const service = data().services.find((s) => s.id === id)
  if (!service) return fail('服务不存在')
  updateData((d) => ({
    ...d,
    services: d.services.map((s) => (s.id === id ? { ...s, onSale, updatedAt: todayStr() } : s)),
  }))
  log(`${onSale ? '上架' : '下架'}服务 ${service.name}（已有订单不受影响）`, 'service', id)
  return done(onSale ? '服务已上架，可用于新增订单' : '服务已下架，不再出现在可选项中；已有订单保留')
}

export function serviceById(id: string): Service | undefined {
  return data().services.find((s) => s.id === id)
}
