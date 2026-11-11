/** 菜单管理：目录、菜单、操作项的维护；页面入口只能从已实现路由选择 */

import { deleteMenu, menuRefRoles, saveMenu, toggleMenu } from '../core/biz/system'
import { menus, roles } from '../core/auth'
import type { MenuNode, MenuType } from '../types'
import { ROUTE_OPTIONS } from '../core/seed'
import type { PageDef } from '../router'
import { el, renderTable, type RowAction } from '../ui'
import { formDialog, pageShell } from '../ui/form'
import { runGuarded, showResult } from './common'

export const menuPage: PageDef = {
  title: '菜单管理',
  render(host: HTMLElement) {
    const page = pageShell(host, {
    })

    const toolbar = el('div', 'toolbar')
    toolbar.innerHTML =
      '<div class="toolbar__actions"><button class="btn btn-primary" data-act="create">新增目录 / 菜单 / 操作</button></div>'
    toolbar.querySelector('button[data-act="create"]')?.addEventListener('click', () => runGuarded('system:edit', () => openEdit()))

    const rows = treeRows()
    // 规范 5／7 章：工具栏与表格共用一个白色容器
    const tableHost = el('div', 'panel panel-table')
    tableHost.appendChild(toolbar)
    renderTable<Row>(
      tableHost,
      {
        cols: [
          { key: 'title', title: '名称', width: '280px', render: (r) => `${indent(r.depth)}${r.node.title}` },
          { key: 'type', title: '类型', render: (r) => typeText(r.node.type) },
          { key: 'path', title: '路由 / 操作标识', render: (r) => r.node.path ?? r.node.key ?? '—' },
          { key: 'sort', title: '排序', align: 'right', render: (r) => String(r.node.sort) },
          { key: 'enabled', title: '状态', render: (r) => (r.node.enabled ? '启用' : '停用') },
          { key: 'refs', title: '被引用角色', render: (r) => refsText(r.node.id) },
        ],
        rows,
        actions: (row) =>
          [
            { text: '编辑', act: 'edit' },
            { text: '新增子项', act: 'add' },
            row.node.enabled ? { text: '停用', act: 'off', danger: true } : { text: '启用', act: 'on' },
            { text: '删除', act: 'delete', danger: true },
          ] as RowAction[],
        emptyText: '暂无菜单',
      },
      {
        onAction: (act, row) => {
          if (act === 'edit') runGuarded('system:edit', () => openEdit(row.node))
          if (act === 'add') runGuarded('system:edit', () => openEdit(undefined, row.node.id))
          if (act === 'off') runGuarded('system:edit', () => showResult(toggleMenu(row.node.id, false)))
          if (act === 'on') runGuarded('system:edit', () => showResult(toggleMenu(row.node.id, true)))
          if (act === 'delete') runGuarded('system:edit', () => confirmDelete(row.node))
        },
      },
    )
    page.appendChild(tableHost)
  },
}

interface Row {
  node: MenuNode
  depth: number
}

function indent(depth: number): string {
  return depth ? `${'　'.repeat(depth - 1)}└ ` : ''
}

function typeText(type: MenuType): string {
  return type === 'dir' ? '目录' : type === 'menu' ? '菜单' : '操作项'
}

function treeRows(): Row[] {
  const list = menus()
  const rows: Row[] = []
  const walk = (parentId: string | null, depth: number): void => {
    list
      .filter((m) => m.parentId === parentId)
      .sort((a, b) => a.sort - b.sort)
      .forEach((m) => {
        rows.push({ node: m, depth })
        walk(m.id, depth + 1)
      })
  }
  walk(null, 0)
  return rows
}

function refsText(menuId: string): string {
  const refs = menuRefRoles(menuId)
  return refs.length ? refs.map((r) => r.name).join('、') : '—'
}

function confirmDelete(node: MenuNode): void {
  const result = deleteMenu(node.id)
  showResult(result)
}

function openEdit(node?: MenuNode, defaultParentId?: string): void {
  const dirOptions = menus()
    .filter((m) => m.type !== 'action')
    .map((m) => ({ value: m.id, label: m.type === 'dir' ? `[目录] ${m.title}` : `[菜单] ${m.title}` }))

  formDialog(
    node ? `编辑菜单：${node.title}` : '新增菜单',
    [
      { kind: 'text', key: 'title', label: '名称', required: true, value: node?.title ?? '' },
      {
        kind: 'select',
        key: 'type',
        label: '类型',
        required: true,
        value: node?.type ?? 'menu',
        options: [
          { value: 'dir', label: '目录' },
          { value: 'menu', label: '菜单' },
          { value: 'action', label: '操作项' },
        ],
      },
      {
        kind: 'select',
        key: 'parentId',
        label: '上级',
        required: false,
        value: node?.parentId ?? defaultParentId ?? '',
        options: dirOptions,
        placeholder: '作为顶级目录',
      },
      {
        kind: 'select',
        key: 'path',
        label: '页面入口（已实现路由）',
        value: node?.path ?? '',
        options: ROUTE_OPTIONS.map((r) => ({ value: r.path, label: `${r.title}（${r.path}）` })),
        placeholder: '仅菜单类型需要选择',
      },
      {
        kind: 'select',
        key: 'key',
        label: '操作标识',
        value: node?.key ?? '',
        options: [...new Set(roles().flatMap((r) => r.actionKeys))].map((k) => ({ value: k, label: k })),
        placeholder: '仅操作项类型需要选择',
      },
      { kind: 'number', key: 'sort', label: '排序号', value: String(node?.sort ?? 10) },
      {
        kind: 'select',
        key: 'enabled',
        label: '状态',
        required: true,
        value: node ? (node.enabled ? '1' : '0') : '1',
        options: [
          { value: '1', label: '启用' },
          { value: '0', label: '停用' },
        ],
      },
      { kind: 'note', text: '菜单类型必须选择页面入口；操作项必须选择操作标识，否则保存会被阻止。', full: true },
    ],
    (values) => {
      const result = saveMenu({
        id: node?.id,
        parentId: values.parentId || null,
        title: values.title,
        type: values.type as MenuType,
        path: values.path || undefined,
        key: values.key || undefined,
        sort: Number(values.sort) || 10,
        enabled: values.enabled === '1',
      })
      showResult(result)
      return result.ok
    },
  )
}
