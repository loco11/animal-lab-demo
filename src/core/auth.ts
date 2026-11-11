/**
 * 权限与会话：菜单 → 角色 → 用户（实验室角色授权）。
 * 导航、直接路由访问和操作按钮都以这里的判断为准，避免只隐藏菜单仍可直接访问。
 */

import type { Lab, MenuNode, Role, RoleCode, User, UserRole } from '../types'
import { data } from './data'
import { LABS } from './seed'
import { getState, scopeLabId, setState } from './store'

export interface MenuItem {
  path: string
  title: string
}

export interface MenuGroup {
  title: string
  items: MenuItem[]
}

export interface CurrentUser {
  id: string
  name: string
  code: RoleCode
  roleName: string
  roleId: string
  /** 当前实验室 */
  labId: string
  /** 该用户可管理的实验室 */
  labs: Lab[]
  isSuper: boolean
  /** 当前上下文是否允许新增或处理业务（全校视图只读） */
  canWrite: boolean
  enabled: boolean
}

export function users(): User[] {
  return data().users
}

export function roles(): Role[] {
  return data().roles
}

export function menus(): MenuNode[] {
  return data().menus
}

export function allLabs(): Lab[] {
  return LABS
}

/** 当前用户在当前实验室的授权；未授权返回 undefined */
export function currentGrant(): UserRole | undefined {
  const s = getState()
  const user = users().find((u) => u.id === s.currentUserId)
  if (!user) return undefined
  if (isSuperUser(user)) return user.grants.find((g) => g.labId === s.currentLabId) ?? user.grants[0]
  return user.grants.find((g) => g.labId === s.currentLabId)
}

export function isSuperUser(user: User): boolean {
  const ur = user.grants.find((g) => g.labId === getState().currentLabId) ?? user.grants[0]
  const role = roles().find((r) => r.id === ur?.roleId)
  return !!role && role.code === 'super' && role.enabled
}

export function roleOf(user: User, labId = getState().currentLabId): Role | undefined {
  const grant = user.grants.find((g) => g.labId === labId)
  if (!grant) return undefined
  const role = roles().find((r) => r.id === grant.roleId)
  if (!role || !role.enabled) return undefined
  return role
}

/** 用户可管理的实验室：由授权的实验室角色决定，格子同学不做跨实验室叠加 */
export function manageableLabsOf(user: User): Lab[] {
  return LABS.filter((l) => {
    const role = roleOf(user, l.id)
    return !!role && (role.labIds.includes(l.id) || role.code === 'super')
  })
}

export function currentUserRecord(): User | undefined {
  return users().find((u) => u.id === getState().currentUserId)
}

export function currentRole(): Role | undefined {
  const u = currentUserRecord()
  if (!u) return undefined
  return roleOf(u)
}

export function getCurrentUser(): CurrentUser {
  const user = currentUserRecord() ?? users()[0]
  const role = roleOf(user)
  const s = getState()
  const labs = manageableLabsOf(user)
  const isSuper = role?.code === 'super'
  const hasGrant = !!currentGrant()
  return {
    id: user.id,
    name: user.name,
    code: role?.code ?? 'teacher',
    roleName: role ? role.name : '未授权',
    roleId: role?.id ?? '',
    labId: s.currentLabId,
    labs,
    isSuper,
    enabled: user.enabled && !!role,
    canWrite: user.enabled && !!role && !s.wholeSchool && hasGrant && !isSuperWholeSchoolBlocked(role),
  }
}

/** 超级管理员之外，全校视图只读 */
function isSuperWholeSchoolBlocked(role: Role): boolean {
  return getState().wholeSchool && role.code !== 'super'
}

/** 可见的角色授权菜单（超级管理员按角色授权判定，不再由写死的路径清单） */
export function grantedMenuIds(): string[] {
  const role = currentRole()
  if (!role) return []
  return role.menuIds
}

export function grantedActionKeys(): string[] {
  const role = currentRole()
  if (!role) return []
  return role.actionKeys
}

export function visibleGroups(): MenuGroup[] {
  const granted = new Set(grantedMenuIds())
  const list = menus().filter((m) => m.enabled)
  return list
    .filter((m) => m.type === 'dir' && list.some((c) => c.type === 'menu' && c.parentId === m.id && granted.has(c.id)))
    .sort((a, b) => a.sort - b.sort)
    .map((dir) => ({
      title: dir.title,
      items: list
        .filter((m) => m.type === 'menu' && m.parentId === dir.id && granted.has(m.id))
        .sort((a, b) => a.sort - b.sort)
        .map((m) => ({ path: m.path!, title: m.title })),
    }))
}

export function canViewPath(path: string): boolean {
  if (path === '/login' || path === '/dashboard' || path === '/hub' || path === '/mobile') return true
  const role = currentRole()
  if (!role) return false
  const node = menus().find((m) => m.type === 'menu' && m.path === path && m.enabled)
  if (!node) return false
  return role.menuIds.includes(node.id)
}

/** 操作权限检查：按钮与写操作都调用这里 */
export function canAction(key: string): boolean {
  return getCurrentUser().canWrite && grantedActionKeys().includes(key)
}

/** 全校视图下只读；统一在此拦截所有写操作 */
export function assertWritable(): { ok: boolean; message: string } {
  const u = getCurrentUser()
  if (!u.enabled) return { ok: false, message: '当前身份未获得该实验室的管理授权' }
  if (getState().wholeSchool) return { ok: false, message: '全校视图为只读汇总，处理业务请先选定实验室' }
  return { ok: true, message: '' }
}

export function assertAction(key: string): { ok: boolean; message: string } {
  const base = assertWritable()
  if (!base.ok) return base
  if (!grantedActionKeys().includes(key)) return { ok: false, message: '当前角色未获得该操作权限' }
  return { ok: true, message: '' }
}

export { scopeLabId }

export function manageableLabs(user: User = currentUserRecord() ?? users()[0]): Lab[] {
  return manageableLabsOf(user)
}

export function switchUser(userId: string): void {
  const user = users().find((u) => u.id === userId)
  if (!user || !user.enabled) return
  const labs = manageableLabsOf(user)
  setState((s) => ({
    ...s,
    currentUserId: user.id,
    currentLabId: labs[0]?.id ?? s.currentLabId,
    wholeSchool: false,
  }))
}

export function switchLab(labId: string): void {
  const user = currentUserRecord()
  if (!user) return
  if (!manageableLabsOf(user).some((l) => l.id === labId)) return
  setState((s) => ({ ...s, currentLabId: labId, wholeSchool: false }))
}

export function toggleWholeSchool(on: boolean): void {
  if (!getCurrentUser().isSuper) return
  setState((s) => ({ ...s, wholeSchool: on }))
}
