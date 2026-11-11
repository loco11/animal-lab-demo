/** 笼位管理：台账、空间维度、状态筛选、占用详情、看板联动与变更历史 */

import { occupanciesOf, listCages, supplyUsagesOf } from '../core/biz/feeding'
import { data, log, scoped, updateData } from '../core/data'
import { assertAction } from '../core/auth'
import { escapeHtml, uid } from '../core/utils'
import type { Cage } from '../types'
import type { PageDef } from '../router'
import { currentPath, currentQuery, navigate, rerender } from '../router'
import { el, openDialog, renderTable, renderTabs, tagHtml, toast, type RowAction } from '../ui'
import { formDialog, pageShell } from '../ui/form'
import { buildQuery, runGuarded, showResult } from './common'
import { done, fail } from '../core/biz/result'
import type { OpResult } from '../core/biz/result'

const view = {
  tab: (currentQuery().status as string) || 'all',
  filters: {} as Record<string, string>,
}

/** 上一次渲染的路由（含查询串）；变化时才从路由同步视图，本页交互重绘不重置 */
let routeKey = ''

function syncFromRoute(): void {
  if (routeKey === currentPath()) return
  routeKey = currentPath()
  const q = currentQuery()
  view.tab = q.status || 'all'
  view.filters = {}
}

export const cagePage: PageDef = {
  title: '笼位台账管理',
  render(host: HTMLElement) {
    syncFromRoute()
    const page = pageShell(host, {})

    const cages = listCages()

    // 1. 状态页签
    renderTabs(
      page,
      [
        { key: 'all', text: '全部笼位', count: cages.length },
        { key: 'free', text: '🟢 空闲可用', count: cages.filter((c) => c.status === 'free').length },
        { key: 'occupied', text: '🔵 在养占用', count: cages.filter((c) => c.status === 'occupied').length },
        { key: 'disabled', text: '⚪ 维护停用', count: cages.filter((c) => c.status === 'disabled').length },
      ],
      view.tab,
      (key) => {
        view.tab = key
        rerender()
      },
    )

    // 2. 空间与属性多维筛选
    const buildings = [...new Set(cages.map((c) => c.building || '云漫湖校区·实验动物中心（SPF屏障实验楼）'))]
    const rooms = [...new Set(cages.map((c) => c.room))]
    const racks = [...new Set(cages.map((c) => c.rack || '未指定机架'))]

    const query = buildQuery(
      [
        {
          key: 'building',
          label: '物理校区/楼栋',
          type: 'select',
          options: buildings.map((b) => ({ value: b, label: b })),
        },
        {
          key: 'room',
          label: '所在房间',
          type: 'select',
          options: rooms.map((r) => ({ value: r, label: r })),
        },
        {
          key: 'rack',
          label: '所在机架',
          type: 'select',
          options: racks.map((rk) => ({ value: rk, label: rk })),
        },
        { key: 'code', label: '笼位编号', type: 'text' },
        {
          key: 'env',
          label: '环境等级',
          type: 'select',
          options: [
            { value: 'SPF', label: 'SPF屏障独立通风' },
            { value: '普通', label: '普通环境' },
          ],
        },
      ],
      view.filters,
      (values) => {
        view.filters = values
        rerender()
      },
      () => {
        view.filters = {}
        rerender()
      },
    )
    page.appendChild(query.node)

    // 3. 工具条与数据表格
    const toolbar = el('div', 'toolbar')
    const filtered = filterRows()
    const freeCount = filtered.filter((c) => c.status === 'free').length
    const occCount = filtered.filter((c) => c.status === 'occupied').length

    toolbar.innerHTML = `
      <div style="font-size:12px;color:var(--c-desc);display:flex;align-items:center;gap:16px;">
        <span>筛选结果：共 <strong>${filtered.length}</strong> 笼</span>
        <span style="color:var(--c-success);">🟢 空闲可用: <strong>${freeCount}</strong></span>
        <span style="color:#0284c7;">🔵 在养占用: <strong>${occCount}</strong></span>
      </div>
      <div class="toolbar__actions">
        <button class="btn btn-primary" data-act="create">新增笼位</button>
        <button class="btn btn-default" data-act="board">笼位空间看板</button>
      </div>
    `
    toolbar.querySelector('button[data-act="create"]')?.addEventListener('click', () => {
      runGuarded('cage:edit', () => openCreateCage())
    })
    toolbar.querySelector('button[data-act="board"]')?.addEventListener('click', () => navigate('/cage/board'))

    const tableHost = el('div', 'panel panel-table')
    tableHost.appendChild(toolbar)

    renderTable<Cage>(
      tableHost,
      {
        cols: [
          {
            key: 'code',
            title: '笼位编号',
            render: (r) => `<strong style="color:var(--c-title);font-family:monospace;font-size:13px;">${escapeHtml(r.code)}</strong>`,
          },
          {
            key: 'building',
            title: '物理校区 / 楼栋',
            render: (r) => {
              const b = r.building || '云漫湖校区·实验动物中心（SPF屏障实验楼）'
              const short = b.includes('云漫湖') ? '云漫湖校区·SPF实验楼' : '北京路校区·老校区动物楼'
              return `<span title="${escapeHtml(b)}" style="display:flex;align-items:center;gap:4px;font-size:12px;">🏢 ${escapeHtml(short)}</span>`
            },
          },
          {
            key: 'rack',
            title: '所在机架',
            render: (r) => `<span style="font-size:12px;color:#334155;font-weight:500;">🎛️ ${escapeHtml(r.rack || '默认机架')}</span>`,
          },
          { key: 'room', title: '所在房间' },
          {
            key: 'env',
            title: '环境等级',
            render: (r) => (r.env === 'SPF' ? tagHtml('SPF独立通风', 'success') : tagHtml('普通环境', 'default')),
          },
          { key: 'capacity', title: '容纳标准', align: 'right', render: (r) => `${r.capacity} 只/笼` },
          {
            key: 'status',
            title: '当前状态',
            render: (r) =>
              r.status === 'occupied'
                ? tagHtml('在养占用', 'primary')
                : r.status === 'free'
                  ? tagHtml('空闲可用', 'success')
                  : tagHtml('维护停用', 'default'),
          },
          {
            key: 'usedBy',
            title: '当前在养信息 / 单据',
            render: (r) => currentUsageDetail(r.id),
          },
          { key: 'note', title: '备注', render: (r) => r.note ?? '—' },
        ],
        rows: filtered,
        actions: (row) =>
          [
            { text: '🎯 看板定位', act: 'locate' },
            { text: '占用历史', act: 'history' },
            row.status === 'disabled' ? { text: '启用', act: 'enable' } : null,
            row.status !== 'occupied' && row.status !== 'disabled' ? { text: '停用', act: 'disable', danger: true } : null,
          ].filter(Boolean) as RowAction[],
        queryActive: Object.values(view.filters).some(Boolean),
        emptyText: '没有符合条件的笼位',
      },
      {
        onAction: (act, row) => {
          if (act === 'locate') {
            navigate(`/cage/board?focusCage=${encodeURIComponent(row.code)}`)
          }
          if (act === 'history') openHistory(row)
          if (act === 'enable') runGuarded('cage:edit', () => showResult(setCageStatus(row.id, 'free')))
          if (act === 'disable') runGuarded('cage:edit', () => showResult(setCageStatus(row.id, 'disabled')))
        },
      },
    )
    page.appendChild(tableHost)
  },
}

function filterRows(): Cage[] {
  let list = listCages()
  if (view.tab !== 'all') list = list.filter((c) => c.status === view.tab)
  if (view.filters.building) list = list.filter((c) => (c.building || '云漫湖校区·实验动物中心（SPF屏障实验楼）') === view.filters.building)
  if (view.filters.room) list = list.filter((c) => c.room === view.filters.room)
  if (view.filters.rack) list = list.filter((c) => (c.rack || '未指定机架') === view.filters.rack)
  if (view.filters.code) list = list.filter((c) => c.code.toLowerCase().includes(view.filters.code.toLowerCase().trim()))
  if (view.filters.env) list = list.filter((c) => c.env === view.filters.env)
  return list
}

function currentUsageDetail(cageId: string): string {
  const occ = data().occupancies.find((o) => o.cageId === cageId && o.end === null)
  if (!occ) return '<span style="color:#94a3b8;">—</span>'
  const feeding = data().feedings.find((f) => f.id === occ.feedingId)
  const order = data().orders.find((o) => o.id === feeding?.orderId)
  if (!feeding && !order) return '<span style="color:#0284c7;font-weight:600;">已入驻占用</span>'

  const applicant = order?.applicantName ? `👤 ${escapeHtml(order.applicantName)}` : '在养'
  const strain = feeding?.animalName ? ` · ${escapeHtml(feeding.animalName)}` : ''
  const count = feeding?.quantity ? `(${feeding.quantity}只)` : ''
  const orderCode = order ? ` [${escapeHtml(order.code)}]` : ''

  return `<span style="font-size:12px;color:#0369a1;font-weight:500;">${applicant}${strain} ${count}</span> <span style="font-size:11px;color:#64748b;">${orderCode}</span>`
}

export function setCageStatus(id: string, status: Cage['status']): OpResult {
  const guard = assertAction('cage:edit')
  if (!guard.ok) return fail(guard.message)
  const cage = data().cages.find((c) => c.id === id)
  if (!cage) return fail('笼位不存在')
  if (status === 'disabled' && cage.status === 'occupied') {
    return fail('该笼位当前处于在养占用状态，请先在饲养管理中办理动物退场后再停用')
  }
  updateData((d) => ({ ...d, cages: d.cages.map((c) => (c.id === id ? { ...c, status } : c)) }))
  log(`${status === 'disabled' ? '停用' : '启用'}笼位 ${cage.code}`, 'cage', id)
  return done(status === 'disabled' ? `笼位 ${cage.code} 已设为维护停用，不可用于新动物入场` : `笼位 ${cage.code} 已恢复空闲启用`)
}

export function openCreateCage(defaultBuilding?: string, onCreated?: (cage: Cage) => void): void {
  const allBuildings = [
    '云漫湖校区·实验动物中心（SPF屏障实验楼）',
    '北京路校区·实验动物中心（老校区动物楼）',
  ]

  formDialog(
    '新增笼位档案',
    [
      {
        kind: 'select',
        key: 'building',
        label: '物理校区与楼栋',
        required: true,
        value: defaultBuilding || allBuildings[0],
        options: allBuildings.map((b) => ({ value: b, label: b })),
      },
      {
        kind: 'select',
        key: 'floor',
        label: '所在楼层',
        required: true,
        value: '1F',
        options: [
          { value: '1F', label: '1F（一层屏障区）' },
          { value: '2F', label: '2F（二层实验区）' },
          { value: '3F', label: '3F（三层净化区）' },
        ],
      },
      { kind: 'text', key: 'room', label: '所在房间', required: true, placeholder: '如：101室（SPF小鼠屏障室）' },
      { kind: 'text', key: 'rack', label: '所在机架', required: true, placeholder: '如：01号IVC小鼠笼架' },
      { kind: 'text', key: 'code', label: '笼位编号', required: true, placeholder: '如：101-01-A07' },
      {
        kind: 'select',
        key: 'env',
        label: '环境等级',
        required: true,
        options: [
          { value: 'SPF', label: 'SPF屏障独立通风' },
          { value: '普通', label: '普通教学寄养' },
        ],
      },
      { kind: 'number', key: 'capacity', label: '容纳标准（只/笼）', required: true, value: '5' },
      { kind: 'text', key: 'note', label: '备注说明', full: true, placeholder: '选填，如适用动物品系或特殊技术要求' },
    ],
    (values) => {
      const id = uid('cg')
      const labId = scoped(data().cages)[0]?.labId ?? data().cages[0]?.labId
      const newCage: Cage = {
        id,
        labId: labId ?? '',
        code: values.code.trim(),
        building: values.building,
        floor: values.floor,
        room: values.room.trim(),
        rack: values.rack.trim(),
        env: values.env as Cage['env'],
        capacity: Number(values.capacity) || 5,
        status: 'free',
        note: values.note ? values.note.trim() : undefined,
      }
      updateData((d) => ({
        ...d,
        cages: [...d.cages, newCage],
      }))
      log(`新增笼位 ${newCage.code}（${newCage.building} ${newCage.room}）`, 'cage', id)
      toast(`笼位 ${newCage.code} 已成功建档！`, 'success')
      onCreated?.(newCage)
      rerender()
      return true
    },
  )
}

function openHistory(cage: Cage): void {
  const list = data()
    .occupancies.filter((o) => o.cageId === cage.id)
    .sort((a, b) => (a.start < b.start ? 1 : -1))
  const rows = list
    .map((o) => {
      const feeding = data().feedings.find((f) => f.id === o.feedingId)
      const order = feeding ? data().orders.find((x) => x.id === feeding.orderId) : undefined
      const uses = feeding ? supplyUsagesOf(feeding.id).length : occupanciesOf(o.feedingId).length
      return `<tr><td>${o.start}</td><td>${o.end ?? '<span style="color:#0284c7;font-weight:600;">占用中</span>'}</td><td>${order?.code ?? '—'}</td><td>${o.reason}</td><td>${o.operator}</td><td>${uses}</td></tr>`
    })
    .join('')

  openDialog({
    title: `笼位 ${cage.code} 占用变更历史`,
    bodyHtml: rows
      ? `<div class="table-wrap"><table><thead><tr><th>开始（含）</th><th>结束（不含）</th><th>饲养单</th><th>原因</th><th>操作人</th><th>关联记录数</th></tr></thead><tbody>${rows}</tbody></table></div>`
      : '<div class="state-area"><p class="state-area__text">该笼位暂无占用历史</p></div>',
    wide: true,
  })
}
