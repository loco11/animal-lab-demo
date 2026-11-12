/** 项目组管理：项目负责人/管理员维护项目与可申用经费的成员名单 */

import type { Project, ProjectMember } from '../../types'
import { assertAction, getCurrentUser } from '../auth'
import { data, log, scoped, updateData } from '../data'
import { todayStr, uid } from '../utils'
import { done, fail, type OpResult } from './result'

/** 当前用户有权限管理的项目：超级管理员/实验室管理员见全部；项目负责人仅见自己负责的项目 */
export function listManageableProjects(): Project[] {
  const user = getCurrentUser()
  const list = scoped(data().projects)
  if (user.isSuper || user.code === 'lab_admin') return list
  return list.filter((p) => p.owner === user.name)
}

export interface ProjectFund {
  total: number
  spent: number
  frozen: number
  available: number
}

/** 项目经费汇总：总额、已划扣、预冻结（学生已提交待交付）、可用余额，单位均为分 */
export function projectFund(project: Project): ProjectFund {
  const frozen = data()
    .orders.filter((o) => o.projectId === project.id && o.feeStatus === 'frozen')
    .reduce((sum, o) => sum + (o.preFreezeAmountFen ?? 0), 0)
  const spent = project.spentFen
  const available = project.totalBudgetFen - spent - frozen
  return { total: project.totalBudgetFen, spent, frozen, available }
}

export function listMembers(projectId: string): ProjectMember[] {
  return scoped(data().projectMembers)
    .filter((m) => m.projectId === projectId)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
}

export function projectById(id: string): Project | undefined {
  return data().projects.find((p) => p.id === id)
}

export interface MemberInput {
  name: string
  no: string
  org: string
}

export function addMember(projectId: string, input: MemberInput): OpResult {
  const guard = assertAction('project:edit')
  if (!guard.ok) return fail(guard.message)
  const project = projectById(projectId)
  if (!project) return fail('项目不存在')
  if (project.status !== 'active') return fail('该项目已结题或暂停，无法添加成员')
  if (!input.name.trim()) return fail('请填写成员姓名')
  if (!input.no.trim()) return fail('请填写学工号')

  const dup = data().projectMembers.find(
    (m) => m.projectId === projectId && m.no === input.no.trim(),
  )
  if (dup) return fail(`该学工号已在成员名单中（${dup.name}），无需重复添加`)

  const id = uid('pm')
  updateData((d) => ({
    ...d,
    projectMembers: [
      {
        id,
        labId: project.labId,
        projectId,
        name: input.name.trim(),
        no: input.no.trim(),
        org: input.org.trim(),
        createdAt: todayStr(),
      },
      ...d.projectMembers,
    ],
  }))
  log(`项目「${project.name}」新增成员 ${input.name.trim()}`, 'projectMember', projectId)
  return done(`成员「${input.name.trim()}」已加入项目「${project.name}」`, id)
}

export function removeMember(id: string): OpResult {
  const guard = assertAction('project:edit')
  if (!guard.ok) return fail(guard.message)
  const member = data().projectMembers.find((m) => m.id === id)
  if (!member) return fail('成员不存在')
  const project = projectById(member.projectId)
  updateData((d) => ({ ...d, projectMembers: d.projectMembers.filter((m) => m.id !== id) }))
  log(`项目「${project?.name ?? member.projectId}」移除成员 ${member.name}`, 'projectMember', member.projectId)
  return done(`成员「${member.name}」已从项目移除`)
}
