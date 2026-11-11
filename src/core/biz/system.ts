/** 平台基础：菜单、角色、用户的维护与授权 */

import type { MenuType, Role } from '../../types'
import { assertAction, getCurrentUser, menus, roles, users } from '../auth'
import { log, updateData } from '../data'
import { ACTION_OPTIONS, ROUTE_OPTIONS } from '../seed'
import { uid } from '../utils'
import { done, fail, type OpResult } from './result'

/* ---------------- 菜单 ---------------- */

export interface MenuInput {
  id?: string
  parentId: string | null
  title: string
  type: MenuType
  path?: string
  key?: string
  sort: number
  enabled: boolean
}

export function saveMenu(input: MenuInput): OpResult {
  const guard = assertAction('system:edit')
  if (!guard.ok) return fail(guard.message)
  if (!input.title.trim()) return fail('请填写名称')
  if (input.type === 'menu') {
    if (!input.path || !ROUTE_OPTIONS.some((r) => r.path === input.path)) {
      return fail('页面入口必须从已实现的路由中选择，避免生成失效链接')
    }
  }
  if (input.type === 'action' && !input.key) return fail('操作项必须选择操作标识')

  if (input.id) {
    const exists = menus().find((m) => m.id === input.id)
    if (!exists) return fail('菜单不存在')
    updateData((d) => ({
      ...d,
      menus: d.menus.map((m) =>
        m.id === input.id
          ? {
              ...m,
              parentId: input.parentId,
              title: input.title.trim(),
              type: input.type,
              path: input.type === 'menu' ? input.path : undefined,
              key: input.type === 'action' ? input.key : undefined,
              sort: input.sort,
              enabled: input.enabled,
            }
          : m,
      ),
    }))
    log(`编辑菜单 ${input.title}`, 'menu', input.id)
    return done(`菜单「${input.title.trim()}」已保存`)
  }

  const id = uid('mn')
  updateData((d) => ({
    ...d,
    menus: [
      ...d.menus,
      {
        id,
        parentId: input.parentId,
        title: input.title.trim(),
        type: input.type,
        path: input.type === 'menu' ? input.path : undefined,
        key: input.type === 'action' ? input.key : undefined,
        sort: input.sort,
        enabled: input.enabled,
      },
    ],
  }))
  log(`新增菜单 ${input.title}`, 'menu', id)
  return done(`菜单「${input.title.trim()}」已新增`, id)
}

export function menuRefRoles(menuId: string): Role[] {
  return roles().filter((r) => r.menuIds.includes(menuId))
}

export function deleteMenu(id: string): OpResult {
  const guard = assertAction('system:edit')
  if (!guard.ok) return fail(guard.message)
  const node = menus().find((m) => m.id === id)
  if (!node) return fail('菜单不存在')
  const children = menus().filter((m) => m.parentId === id)
  if (children.length) return fail(`存在 ${children.length} 个子项，请先删除子项`)
  const refs = menuRefRoles(id)
  if (refs.length) {
    return fail(`菜单已被角色 ${refs.map((r) => r.name).join('、')} 引用，请先在该角色的授权中取消勾选`)
  }

  updateData((d) => ({ ...d, menus: d.menus.filter((m) => m.id !== id) }))
  log(`删除菜单 ${node.title}`, 'menu', id)
  return done(`菜单「${node.title}」已删除`)
}

export function toggleMenu(id: string, enabled: boolean): OpResult {
  const guard = assertAction('system:edit')
  if (!guard.ok) return fail(guard.message)
  updateData((d) => ({ ...d, menus: d.menus.map((m) => (m.id === id ? { ...m, enabled } : m)) }))
  log(`${enabled ? '启用' : '停用'}菜单 ${id}`, 'menu', id)
  return done(enabled ? '菜单已启用，恢复出现在导航中' : '菜单已停用，导航与直接访问同时失效')
}

/* ---------------- 角色 ---------------- */

export interface RoleInput {
  id?: string
  name: string
  enabled: boolean
  labIds: string[]
  menuIds: string[]
  actionKeys: string[]
}

export function saveRole(input: RoleInput): OpResult {
  const guard = assertAction('system:edit')
  if (!guard.ok) return fail(guard.message)
  if (!input.name.trim()) return fail('请填写角色名称')
  if (!input.labIds.length) return fail('请选择该角色适用的实验室范围')

  // 勾选菜单时自动带出其可用操作项所属的父菜单，保证树形授权完整
  const menuIds = completeMenuSelection(input.menuIds)

  if (input.id) {
    const role = roles().find((r) => r.id === input.id)
    if (!role) return fail('角色不存在')
    updateData((d) => ({
      ...d,
      roles: d.roles.map((r) =>
        r.id === input.id
          ? {
              ...r,
              name: input.name.trim(),
              enabled: input.enabled,
              labIds: input.labIds,
              menuIds,
              actionKeys: input.actionKeys,
            }
          : r,
      ),
    }))
    log(`编辑角色 ${input.name}`, 'role', input.id)
    return done(`角色「${input.name.trim()}」已保存，导航、路由与按钮权限同步更新`)
  }

  const id = uid('rl')
  updateData((d) => ({
    ...d,
    roles: [
      ...d.roles,
      {
        id,
        code: 'lab_admin',
        name: input.name.trim(),
        enabled: input.enabled,
        protected: false,
        labIds: input.labIds,
        menuIds,
        actionKeys: input.actionKeys,
      },
    ],
  }))
  log(`新增角色 ${input.name}`, 'role', id)
  return done(`角色「${input.name.trim()}」已新增`, id)
}

function completeMenuSelection(menuIds: string[]): string[] {
  const set = new Set(menuIds)
  menus().forEach((m) => {
    if (set.has(m.id) && m.parentId) set.add(m.parentId)
  })
  return [...set]
}

export function deleteRole(id: string): OpResult {
  const guard = assertAction('system:edit')
  if (!guard.ok) return fail(guard.message)
  const role = roles().find((r) => r.id === id)
  if (!role) return fail('角色不存在')
  if (role.protected) return fail('超级管理员为系统保护角色，禁止删除')
  const refs = users().filter((u) => u.grants.some((g) => g.roleId === id))
  if (refs.length) return fail(`角色已被用户 ${refs.map((u) => u.name).join('、')} 引用，请先解除授权`)

  updateData((d) => ({ ...d, roles: d.roles.filter((r) => r.id !== id) }))
  log(`删除角色 ${role.name}`, 'role', id)
  return done(`角色「${role.name}」已删除`)
}

export function toggleRole(id: string, enabled: boolean): OpResult {
  const guard = assertAction('system:edit')
  if (!guard.ok) return fail(guard.message)
  const role = roles().find((r) => r.id === id)
  if (!role) return fail('角色不存在')
  if (role.protected && !enabled) return fail('超级管理员为系统保护角色，禁止停用')
  updateData((d) => ({ ...d, roles: d.roles.map((r) => (r.id === id ? { ...r, enabled } : r)) }))
  log(`${enabled ? '启用' : '停用'}角色 ${role.name}`, 'role', id)
  return done(enabled ? '角色已启用' : '角色已停用，原权限不再生效')
}

/* ---------------- 用户 ---------------- */

export interface UserInput {
  id?: string
  name: string
  no: string
  org: string
  enabled: boolean
  note?: string
}

export function saveUser(input: UserInput): OpResult {
  const guard = assertAction('system:edit')
  if (!guard.ok) return fail(guard.message)
  if (!input.name.trim()) return fail('请填写姓名')
  if (!input.no.trim()) return fail('请填写工号／学号')

  const dup = users().find((u) => u.no === input.no.trim() && u.id !== input.id)
  if (dup) return fail('该工号／学号已存在')

  if (input.id) {
    updateData((d) => ({
      ...d,
      users: d.users.map((u) =>
        u.id === input.id
          ? { ...u, name: input.name.trim(), no: input.no.trim(), org: input.org.trim(), enabled: input.enabled, note: input.note }
          : u,
      ),
    }))
    log(`编辑用户 ${input.name}`, 'user', input.id)
    return done(`用户「${input.name.trim()}」已保存`)
  }

  const id = uid('us')
  updateData((d) => ({
    ...d,
    users: [
      ...d.users,
      { id, name: input.name.trim(), no: input.no.trim(), org: input.org.trim(), enabled: input.enabled, grants: [], note: input.note },
    ],
  }))
  log(`新增用户 ${input.name}`, 'user', id)
  return done(`用户「${input.name.trim()}」已新增，请分配角色后生效`, id)
}

export function toggleUser(id: string, enabled: boolean): OpResult {
  const guard = assertAction('system:edit')
  if (!guard.ok) return fail(guard.message)
  updateData((d) => ({ ...d, users: d.users.map((u) => (u.id === id ? { ...u, enabled } : u)) }))
  log(`${enabled ? '启用' : '停用'}用户 ${id}`, 'user', id)
  return done(enabled ? '用户已启用' : '用户已停用，会话再次检查时不再具备权限')
}

/** 第一版假设：同一用户同一实验室仅分配一个管理角色 */
export function setGrant(userId: string, labId: string, roleId: string | null): OpResult {
  const guard = assertAction('system:edit')
  if (!guard.ok) return fail(guard.message)
  const user = users().find((u) => u.id === userId)
  if (!user) return fail('用户不存在')

  const grants = user.grants.filter((g) => g.labId !== labId)
  if (roleId) {
    const role = roles().find((r) => r.id === roleId)
    if (!role) return fail('角色不存在')
    grants.push({ userId, labId, roleId })
  }
  updateData((d) => ({ ...d, users: d.users.map((u) => (u.id === userId ? { ...u, grants } : u)) }))
  log(roleId ? `为用户 ${user.name} 设置 ${labId} 实验室角色` : `解除用户 ${user.name} 在 ${labId} 的授权`, 'user', userId)
  return done(roleId ? '授权已保存，切换实验室后立即生效' : '已解除该实验室授权')
}

export function allActions(): { key: string; title: string; parent: string }[] {
  return ACTION_OPTIONS
}

export function currentLabIdOf(): string {
  return getCurrentUser().labId
}
