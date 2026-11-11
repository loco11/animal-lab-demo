/** 用户管理：用户维护、启停与实验室角色授权 */

import { saveUser, setGrant, toggleUser } from '../core/biz/system'
import { allLabs, roles, users } from '../core/auth'
import type { User } from '../types'
import type { PageDef } from '../router'
import { el, openDialog, renderTable, toast, type RowAction } from '../ui'
import { formDialog, pageShell } from '../ui/form'
import { runGuarded, showResult } from './common'

export const userPage: PageDef = {
  title: '用户管理',
  render(host: HTMLElement) {
    const page = pageShell(host, {
    })

    const toolbar = el('div', 'toolbar')
    toolbar.innerHTML =
      '<div class="toolbar__actions"><button class="btn btn-primary" data-act="create">新增用户</button></div>' +
      '<span class="hint">停用后原权限不再生效；单中心用户无法切入未授权实验室</span>'
    toolbar.querySelector('button[data-act="create"]')?.addEventListener('click', () => runGuarded('system:edit', () => openEditUser()))

    // 规范 5／7 章：工具栏与表格共用一个白色容器
    const tableHost = el('div', 'panel panel-table')
    tableHost.appendChild(toolbar)
    renderTable<User>(
      tableHost,
      {
        cols: [
          { key: 'name', title: '姓名', width: '120px' },
          { key: 'no', title: '工号 / 学号' },
          { key: 'org', title: '所属单位', ellipsis: true },
          { key: 'grants', title: '实验室角色授权', render: (r) => grantsText(r) },
          { key: 'enabled', title: '状态', render: (r) => (r.enabled ? '启用' : '停用') },
          { key: 'note', title: '备注', render: (r) => r.note ?? '—' },
        ],
        rows: users(),
        actions: (row) =>
          [
            { text: '编辑', act: 'edit' },
            { text: '授权', act: 'grant' },
            row.enabled ? { text: '停用', act: 'off', danger: true } : { text: '启用', act: 'on' },
          ] as RowAction[],
        emptyText: '暂无用户',
      },
      {
        onAction: (act, row) => {
          if (act === 'edit') runGuarded('system:edit', () => openEditUser(row))
          if (act === 'grant') runGuarded('system:edit', () => openGrant(row))
          if (act === 'off') runGuarded('system:edit', () => showResult(toggleUser(row.id, false)))
          if (act === 'on') runGuarded('system:edit', () => showResult(toggleUser(row.id, true)))
        },
      },
    )
    page.appendChild(tableHost)
  },
}

function grantsText(user: User): string {
  if (!user.grants.length) return '未授权'
  return user.grants
    .map((g) => {
      const lab = allLabs().find((l) => l.id === g.labId)?.shortName ?? g.labId
      const role = roles().find((r) => r.id === g.roleId)?.name ?? g.roleId
      return `${lab}：${role}`
    })
    .join('；')
}

function openEditUser(user?: User): void {
  formDialog(
    user ? `编辑用户：${user.name}` : '新增用户',
    [
      { kind: 'text', key: 'name', label: '姓名', required: true, value: user?.name ?? '' },
      { kind: 'text', key: 'no', label: '工号 / 学号', required: true, value: user?.no ?? '' },
      { kind: 'text', key: 'org', label: '所属单位', value: user?.org ?? '', full: true },
      {
        kind: 'select',
        key: 'enabled',
        label: '状态',
        required: true,
        value: user ? (user.enabled ? '1' : '0') : '1',
        options: [
          { value: '1', label: '启用' },
          { value: '0', label: '停用' },
        ],
      },
      { kind: 'textarea', key: 'note', label: '备注', value: user?.note ?? '', full: true },
    ],
    (values) => {
      const result = saveUser({
        id: user?.id,
        name: values.name,
        no: values.no,
        org: values.org,
        enabled: values.enabled === '1',
        note: values.note,
      })
      showResult(result)
      return result.ok
    },
  )
}

function openGrant(user: User): void {
  const options = roles().map((r) => ({ id: r.id, name: r.name }))
  const rows = allLabs()
    .map((lab) => {
      const current = user.grants.find((g) => g.labId === lab.id)?.roleId ?? ''
      const opts = `<option value="">未授权</option>${options
        .map((o) => `<option value="${o.id}"${o.id === current ? ' selected' : ''}>${o.name}</option>`)
        .join('')}`
      return `<tr><td>${lab.name}</td><td><select data-lab="${lab.id}">${opts}</select></td></tr>`
    })
    .join('')

  const dlg = openDialog({
    title: `实验室角色授权：${user.name}`,
    bodyHtml: `<table><thead><tr><th>实验室</th><th>管理角色</th></tr></thead><tbody>${rows}</tbody></table>
      <p class="hint">同一用户同一实验室仅分配一个管理角色；留空表示解除该实验室授权。</p>`,
    wide: true,
    actions: [
      { text: '取消' },
      {
        text: '保存授权',
        primary: true,
        keepOpen: true,
        onClick: () => {
          let ok = true
          dlg.querySelectorAll<HTMLSelectElement>('select[data-lab]').forEach((sel) => {
            const roleId = sel.value || null
            const result = setGrant(user.id, sel.dataset.lab!, roleId)
            if (!result.ok) {
              ok = false
              toast(result.message, 'error')
            }
          })
          if (ok) {
            toast('授权已保存，切换实验室后立即生效', 'success')
            dlg.close()
          }
        },
      },
    ],
  })
}
