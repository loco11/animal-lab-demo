/** 角色管理：菜单与操作授权、实验室范围、启停与删除保护 */

import { deleteRole, saveRole, toggleRole } from '../core/biz/system'
import { allLabs, menus, roles, users } from '../core/auth'
import { ACTION_OPTIONS } from '../core/seed'
import type { Role } from '../types'
import type { PageDef } from '../router'
import { el, openDialog, renderTable, toast, type RowAction } from '../ui'
import { pageShell } from '../ui/form'
import { runGuarded, showResult } from './common'

export const rolePage: PageDef = {
  title: '角色管理',
  render(host: HTMLElement) {
    const page = pageShell(host, {
    })

    const toolbar = el('div', 'toolbar')
    toolbar.innerHTML =
      '<div class="toolbar__actions"><button class="btn btn-primary" data-act="create">新增角色</button></div>'
    toolbar.querySelector('button[data-act="create"]')?.addEventListener('click', () => runGuarded('system:edit', () => openEdit()))

    // 规范 5／7 章：工具栏与表格共用一个白色容器
    const tableHost = el('div', 'panel panel-table')
    tableHost.appendChild(toolbar)
    renderTable<Role>(
      tableHost,
      {
        cols: [
          { key: 'name', title: '角色名称', width: '160px' },
          { key: 'protected', title: '保护角色', render: (r) => (r.protected ? '系统保护' : '—') },
          { key: 'labIds', title: '实验室范围', render: (r) => labNames(r) },
          { key: 'menus', title: '已授权菜单数', align: 'right', render: (r) => String(r.menuIds.filter((id) => menuType(id) === 'menu').length) },
          { key: 'actions', title: '已授权操作数', align: 'right', render: (r) => String(r.actionKeys.length) },
          { key: 'users', title: '引用用户', render: (r) => refUsers(r.id) },
          { key: 'enabled', title: '状态', render: (r) => (r.enabled ? '启用' : '停用') },
        ],
        rows: roles(),
        actions: (row) =>
          [
            { text: '编辑授权', act: 'edit' },
            row.protected ? null : row.enabled ? { text: '停用', act: 'off', danger: true } : { text: '启用', act: 'on' },
            row.protected ? null : { text: '删除', act: 'delete', danger: true },
          ].filter(Boolean) as RowAction[],
        emptyText: '暂无角色',
      },
      {
        onAction: (act, row) => {
          if (act === 'edit') runGuarded('system:edit', () => openEdit(row))
          if (act === 'off') runGuarded('system:edit', () => showResult(toggleRole(row.id, false)))
          if (act === 'on') runGuarded('system:edit', () => showResult(toggleRole(row.id, true)))
          if (act === 'delete') runGuarded('system:edit', () => showResult(deleteRole(row.id)))
        },
      },
    )
    page.appendChild(tableHost)
  },
}

function menuType(id: string): string {
  return menus().find((m) => m.id === id)?.type ?? ''
}

function labNames(role: Role): string {
  const names = allLabs().filter((l) => role.labIds.includes(l.id)).map((l) => l.shortName)
  return names.length ? names.join('、') : '—'
}

function refUsers(roleId: string): string {
  const list = users().filter((u) => u.grants.some((g) => g.roleId === roleId))
  return list.length ? list.map((u) => u.name).join('、') : '—'
}

/** 授权编辑：实验室范围 + 菜单树 + 操作项，全勾选后保存 */
function openEdit(role?: Role): void {
  const menuTree = buildMenuTreeHtml(role)
  const actionHtml = ACTION_OPTIONS.map((a) => {
    const checked = role?.actionKeys.includes(a.key) ? 'checked' : ''
    return `<label style="display:inline-flex;align-items:center;gap:6px;margin:4px 16px 4px 0"><input type="checkbox" data-action="${a.key}" ${checked} />${a.title}<span class="hint">${a.key}</span></label>`
  }).join('')
  const labHtml = allLabs()
    .map((l) => {
      const checked = role?.labIds.includes(l.id) ? 'checked' : ''
      return `<label style="display:inline-flex;align-items:center;gap:6px;margin-right:16px"><input type="checkbox" data-lab="${l.id}" ${checked} />${l.name}</label>`
    })
    .join('')

  const dlg = openDialog({
    title: role ? `编辑角色：${role.name}` : '新增角色',
    bodyHtml: `
      <div class="field" style="margin-bottom:12px"><span class="field__label">角色名称 *</span><input type="text" id="role-name" value="${role?.name ?? ''}" /></div>
      <div class="field" style="margin-bottom:12px"><span class="field__label">状态</span>
        <select id="role-enabled"><option value="1" ${role?.enabled !== false ? 'selected' : ''}>启用</option><option value="0" ${role?.enabled === false ? 'selected' : ''}>停用</option></select>
      </div>
      <div class="field" style="margin-bottom:12px"><span class="field__label">适用实验室范围 *</span><div>${labHtml}</div></div>
      <p class="hint">菜单授权（勾选菜单后需一并勾选其所属目录）</p>
      ${menuTree}
      <p class="hint" style="margin-top:12px">操作权限</p>
      <div>${actionHtml}</div>
      ${
        role?.protected
          ? '<p class="hint">超级管理员为系统保护角色，停用会被拒绝。</p>'
          : ''
      }
    `,
    wide: true,
    actions: [
      { text: '取消' },
      {
        text: '保存授权',
        primary: true,
        keepOpen: true,
        onClick: () => {
          const name = (dlg.querySelector('#role-name') as HTMLInputElement).value.trim()
          if (!name) {
            toast('请填写角色名称', 'error')
            return
          }
          const enabled = (dlg.querySelector('#role-enabled') as HTMLSelectElement).value === '1'
          const labIds = [...dlg.querySelectorAll<HTMLInputElement>('input[data-lab]')].filter((i) => i.checked).map((i) => i.dataset.lab!)
          const menuIds = [...dlg.querySelectorAll<HTMLInputElement>('input[data-menu]')].filter((i) => i.checked).map((i) => i.dataset.menu!)
          const actionKeys = [...dlg.querySelectorAll<HTMLInputElement>('input[data-action]')].filter((i) => i.checked).map((i) => i.dataset.action!)
          const result = saveRole({ id: role?.id, name, enabled, labIds, menuIds, actionKeys })
          if (result.ok) {
            showResult(result)
            dlg.close()
          } else {
            toast(result.message, 'error')
          }
        },
      },
    ],
  })
}

function buildMenuTreeHtml(role?: Role): string {
  const list = menus().filter((m) => m.type !== 'action').sort((a, b) => a.sort - b.sort)
  const rows = list
    .map((m) => {
      const checked = role?.menuIds.includes(m.id) ? 'checked' : ''
      const pad = m.parentId ? 'padding-left:24px' : ''
      return `<tr><td style="width:50px"><input type="checkbox" data-menu="${m.id}" ${checked} /></td><td style="${pad}">${
        m.parentId ? '└ ' : ''
      }${m.title}</td><td class="hint">${m.path ?? ''}</td></tr>`
    })
    .join('')
  return `<div class="table-wrap" style="max-height:280px;overflow:auto"><table><tbody>${rows}</tbody></table></div>`
}
