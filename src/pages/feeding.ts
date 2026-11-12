/** 饲养管理：待入场、在养、已退出；入场、笼位变更、耗材领用、退出与区间计费 */

import {
  allocateCages,
  changeCages,
  checkAndReleaseExpiredReservations,
  entryFeeding,
  exitFeeding,
  freeCages,
  generateFeedingFee,
  listFeedings,
  occupanciesOf,
  quoteFeedingFee,
  supplyUsagesOf,
  takeSupply,
} from '../core/biz/feeding'
import { listOrders, rejectOrder } from '../core/biz/orders'
import { categoryDef, categoryText } from '../core/biz/stock'
import { auditPassed } from '../core/labels'
import { data, scoped } from '../core/data'
import { addDays, daysBetween, escapeHtml, moneyText, todayStr } from '../core/utils'
import type { Feeding, Order } from '../types'
import type { PageDef } from '../router'
import { currentPath, currentQuery, navigate, rerender } from '../router'
import { el, openDialog, renderTable, renderTabs, tagHtml, toast, type RowAction } from '../ui'
import { detailGrid, formDialog, pageShell } from '../ui/form'
import { buildQuery, runGuarded, showResult } from './common'

type TabKey = 'incoming' | 'breeding' | 'exited'

const view = {
  tab: (currentQuery().status as TabKey) || 'breeding',
  filters: {} as Record<string, string>,
}

/** 上一次渲染的路由（含查询串）；变化时才从路由同步视图，本页交互重绘不重置 */
let routeKey = ''

function syncFromRoute(): void {
  if (routeKey === currentPath()) return
  routeKey = currentPath()
  const q = currentQuery()
  view.tab = (q.status as TabKey) || 'breeding'
  view.filters = {}
}

export const feedingPage: PageDef = {
  title: '饲养管理',
  render(host: HTMLElement) {
    checkAndReleaseExpiredReservations()
    syncFromRoute()
    const page = pageShell(host, {
    })

    const incoming = listOrders().filter((o) => o.kind === 'breeding' && o.fulfillStatus === 'incoming')
    const breeding = listFeedings().filter((f) => f.status === 'breeding')
    const exited = listFeedings().filter((f) => f.status === 'exited')

    renderTabs(
      page,
      [
        { key: 'incoming', text: '待入场', count: incoming.length },
        { key: 'breeding', text: '在养', count: breeding.length },
        { key: 'exited', text: '已退出', count: exited.length },
      ],
      view.tab,
      (key) => {
        view.tab = key as TabKey
        rerender()
      },
    )

    const query = buildQuery(
      [
        { key: 'keyword', label: '订单编号 / 申请人', type: 'text' },
        { key: 'animal', label: '动物名称', type: 'text' },
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

    const tableHost = el('div', 'panel panel-table')
    if (view.tab === 'incoming') renderIncoming(tableHost)
    else renderFeedingTable(tableHost, view.tab === 'breeding' ? breedingRows() : exitedRows())
    page.appendChild(tableHost)
  },
}

/* ---------------- 列表 ---------------- */

function breedingRows(): Feeding[] {
  let list = listFeedings().filter((f) => f.status === 'breeding')
  const { keyword, animal } = view.filters
  if (keyword) list = list.filter((f) => `${orderRef(f.orderId)}`.includes(keyword) || f.spec.includes(keyword))
  if (animal) list = list.filter((f) => f.animalName.includes(animal))
  return list
}

function exitedRows(): Feeding[] {
  let list = listFeedings().filter((f) => f.status === 'exited')
  const { keyword, animal } = view.filters
  if (keyword) list = list.filter((f) => `${orderRef(f.orderId)}`.includes(keyword) || f.spec.includes(keyword))
  if (animal) list = list.filter((f) => f.animalName.includes(animal))
  return list
}

function renderIncoming(host: HTMLElement): void {
  const rows = listOrders().filter((o) => o.kind === 'breeding' && o.fulfillStatus === 'incoming')

  // 规范工具栏：与 Attachment 2 保持一致
  const toolbar = el('div', 'toolbar')
  toolbar.innerHTML = `
    <div class="toolbar__actions" style="display:flex;justify-content:space-between;width:100%;align-items:center;">
      <span class="hint">待入场清单：当前共 <strong>${rows.length}</strong> 笔饲养订单待审核排位及现场办理入住（审核同意后自动预留锁定 2 天，逾期未办理自动释放重排）</span>
      <button class="btn btn-default" id="btn-refresh-expire" style="font-size:11.5px;padding:3px 10px;height:28px;">🔄 检查逾期保留释放</button>
    </div>
  `
  host.appendChild(toolbar)
  toolbar.querySelector('#btn-refresh-expire')?.addEventListener('click', () => {
    const released = checkAndReleaseExpiredReservations()
    if (released > 0) {
      toast(`检测到 ${released} 笔预约已超期2天未办理入住，已自动释放锁定的物理笼位并退回重排`, 'warning')
      rerender()
    } else {
      toast('暂无逾期预约，所有已排位笼位均在2天保留保护期内', 'success')
    }
  })

  renderTable<Order>(
    host,
    {
      cols: [
        { key: 'code', title: '订单编号', width: '130px' },
        { key: 'item', title: '服务 / 规格', render: (r) => `${r.itemName}｜${r.spec}` },
        {
          key: 'schedule',
          title: '拟入住区间 & 规模',
          width: '180px',
          render: (r) => {
            const range = r.expectStartDate
              ? `<strong>${r.expectStartDate}</strong> 至 <strong>${r.expectEndDate || '—'}</strong><br><span style="font-size:11px;color:#0284c7;">拟养 ${r.feedDays || 14} 天</span>`
              : `<span style="color:#64748b;">拟养 ${r.feedDays || 14} 天</span>`
            const cageTypeLabel = r.cageType ? ` · <span style="color:#475569;">${escapeHtml(r.cageType)}</span>` : ''
            return `${range}<br><span style="font-size:11px;color:#334155;">预订 <strong>${r.quantity} 笼</strong>（${r.animalCount || 20} 只${cageTypeLabel}）</span>`
          },
        },
        {
          key: 'applicant',
          title: '申请人 / 课题组',
          width: '160px',
          render: (r) =>
            `👤 ${escapeHtml(r.applicantName)}<br><span style="font-size:11px;color:#64748b;">${escapeHtml(r.applicantOrg || '')}</span>`,
        },
        {
          key: 'feeStatus',
          title: '经费状态',
          width: '110px',
          render: (r) =>
            r.feeStatus === 'charged' ? tagHtml('已扣缴', 'success') : tagHtml('已冻结预付款', 'primary'),
        },
        {
          key: 'audit',
          title: '时空排位与保留状态',
          width: '170px',
          render: (r) => {
            if (r.reserveStatus === 'expired_released') {
              return tagHtml('逾期释放·待重排', 'danger') + '<br><span style="font-size:10.5px;color:#ef4444;">已超期2天自动释放</span>'
            }
            if (auditPassed(r.auditStatus)) {
              const cageCodes = r.allocatedCageIds?.length
                ? r.allocatedCageIds
                    .map((id) => data().cages.find((c) => c.id === id)?.code || id)
                    .join('、')
                : '已指定'
              return (
                tagHtml('已预分配·待入住', 'success') +
                `<br><span style="font-size:11px;color:#0284c7;font-weight:600;">锁定: ${cageCodes}</span>` +
                `<br><span style="font-size:10px;color:#854d0e;">保留至: ${r.reserveExpireAt || '—'}</span>`
              )
            }
            return tagHtml('待排位审核', 'warning') + '<br><span style="font-size:10.5px;color:#64748b;">未锁定物理笼位</span>'
          },
        },
      ],
      rows,
      actions: (row) => {
        if (auditPassed(row.auditStatus)) {
          return [
            { text: '办理现场入住', act: 'entry' },
            { text: '调整排位', act: 'allocate' },
          ]
        }
        if (row.reserveStatus === 'expired_released') {
          return [
            { text: '重新排位预分配', act: 'allocate' },
            { text: '退回', act: 'reject', danger: true },
          ]
        }
        return [
          { text: '审核排位预分配', act: 'allocate' },
          { text: '退回', act: 'reject', danger: true },
        ]
      },
      queryActive: Object.values(view.filters).some(Boolean),
      emptyText: '没有待入场的饲养订单',
    },
    {
      onAction: (act, row) => {
        if (act === 'entry') runGuarded('feeding:entry', () => openEntry(row))
        if (act === 'allocate') runGuarded('order:approve', () => openAllocateDialog(row))
        if (act === 'reject') {
          const reason = prompt('请输入退回原因：')
          if (reason) runGuarded('order:reject', () => showResult(rejectOrder(row.id, reason)))
        }
      },
    },
  )
}

function renderFeedingTable(host: HTMLElement, rows: Feeding[]): void {
  const isBreeding = view.tab === 'breeding'

  // 规范工具栏：与 Attachment 2 (stock.ts) 保持一致
  const toolbar = el('div', 'toolbar')
  if (isBreeding) {
    const totalCages = rows.reduce((sum, f) => sum + f.cageIds.length, 0)
    const totalAnimals = rows.reduce((sum, f) => sum + (f.quantity || 0), 0)
    toolbar.innerHTML = `
      <div class="toolbar__actions">
        <button class="btn btn-primary" data-act="to-incoming">办理新入场</button>
        <button class="btn btn-default" data-act="to-cage">笼位空间看板</button>
      </div>
      <span class="hint">在养监控：当前共 <strong>${rows.length}</strong> 单 · 占用 <strong>${totalCages}</strong> 笼 · 在养动物 <strong>${totalAnimals}</strong> 只</span>
    `
    toolbar.querySelector('button[data-act="to-incoming"]')?.addEventListener('click', () => {
      view.tab = 'incoming'
      rerender()
    })
    toolbar.querySelector('button[data-act="to-cage"]')?.addEventListener('click', () => {
      navigate('/cage/board')
    })
  } else {
    toolbar.innerHTML = `
      <div class="toolbar__actions">
        <span class="hint">已退出归档：共 <strong>${rows.length}</strong> 笔已退场历史记录</span>
      </div>
    `
  }
  host.appendChild(toolbar)

  renderTable<Feeding>(
    host,
    {
      cols: [
        {
          key: 'code',
          title: '关联订单',
          width: '105px',
          render: (r) => `<strong style="font-family:monospace;color:var(--c-title);">${escapeHtml(orderRef(r.orderId))}</strong>`,
        },
        {
          key: 'applicant',
          title: '申请人 / 课题组',
          width: '120px',
          ellipsis: true,
          render: (r) => {
            const ord = data().orders.find((o) => o.id === r.orderId)
            if (!ord) return '—'
            return `👤 ${escapeHtml(ord.applicantName)}<br><span style="font-size:11px;color:#64748b;">${escapeHtml(ord.applicantOrg || '校内')}</span>`
          },
        },
        {
          key: 'animal',
          title: '实验动物 / 规格',
          ellipsis: true,
          render: (r) => `<strong>${escapeHtml(r.animalName)}</strong> <span style="font-size:11px;color:#64748b;">(${r.quantity || 0}只)</span><br><span style="font-size:11px;color:#94a3b8;">${escapeHtml(r.spec)}</span>`,
        },
        {
          key: 'cages',
          title: '在养笼位',
          width: '130px',
          render: (r) => {
            const list = r.cageIds.map((id) => cageCode(id)).join('、')
            return `<span>${escapeHtml(list || '—')}</span> <span style="font-size:11px;color:#0284c7;font-weight:600;">(${r.cageIds.length}笼)</span>`
          },
        },
        {
          key: 'price',
          title: '计费单价',
          width: '85px',
          align: 'right',
          render: (r) => `${moneyText(r.unitPriceFen)}<br><span style="font-size:10px;color:#94a3b8;">/笼·天</span>`,
        },
        {
          key: 'period',
          title: '饲养周期',
          width: '110px',
          render: (r) => {
            const start = r.entryAt ?? '—'
            const days = daysBetween(r.entryAt ?? todayStr(), r.exitAt ?? todayStr())
            if (r.status === 'breeding') {
              return `<span>${start}</span><br><span style="font-size:11px;color:#0369a1;font-weight:600;">在养 ${days} 天</span>`
            }
            return `<span>${start}</span><br><span style="font-size:11px;color:#64748b;">至 ${r.exitAt ?? '—'} (${days}天)</span>`
          },
        },
        {
          key: 'status',
          title: '状态',
          width: '70px',
          render: (r) => (r.status === 'breeding' ? tagHtml('在养', 'primary') : tagHtml('已退出', 'success')),
        },
      ],
      rows,
      actions: (row) =>
        [
          { text: '详情', act: 'detail' },
          row.status === 'breeding' ? { text: '笼位变更', act: 'cage' } : null,
          row.status === 'breeding' ? { text: '耗材领用', act: 'supply' } : null,
          row.status === 'breeding' ? { text: '退出', act: 'exit', danger: true } : null,
          { text: '区间计费', act: 'fee' },
        ].filter(Boolean) as RowAction[],
      queryActive: Object.values(view.filters).some(Boolean),
      emptyText: '当前范围暂无饲养业务',
    },
    {
      onAction: (act, row) => {
        if (act === 'detail') openDetail(row)
        if (act === 'cage') runGuarded('feeding:change', () => openCageChange(row))
        if (act === 'supply') runGuarded('feeding:supply', () => openSupply(row))
        if (act === 'exit') runGuarded('feeding:exit', () => openExit(row))
        if (act === 'fee') runGuarded('fee:generate', () => openFee(row))
      },
    },
  )
}

/* ---------------- 弹窗 ---------------- */

function openAllocateDialog(order: Order): void {
  let curStart = order.expectStartDate || addDays(todayStr(), 1)
  let curDays = order.feedDays || 14
  let selectedCageIds = order.allocatedCageIds ? [...order.allocatedCageIds] : []

  function buildDialogContent(): string {
    const end = addDays(curStart, curDays)
    const expire = addDays(curStart, 2)
    const availableCages = freeCages(curStart, end, order.cageType)

    return `
      <div style="margin-bottom:12px;font-size:12px;line-height:1.6;background:#f0fdf4;border:1px solid #bbf7d0;padding:10px 12px;border-radius:6px;color:#166534;">
        <strong>💡 时空排位与2天保留规则：</strong><br>
        ① <strong>时空可用性检测</strong>：系统已自动根据所选区间 [${curStart} ~ ${end}] 筛选出期间无任何冲突占用、非停用状态的空闲物理笼位。<br>
        ② <strong>2天保留倒计时</strong>：审核同意并预锁定后，系统将为该课题组保留至 <strong>${expire} 23:59</strong>；若学生超过 2 天未到校办理入住，系统将自动释放笼位回空闲池，并退回待重新排位。<br>
        ③ <strong>同机架就近分配</strong>：申请预订 <strong>${order.quantity} 笼</strong>（拟养 ${order.animalCount || 20} 只${order.cageType ? ` · 适配笼型：<strong>${order.cageType}</strong>` : ''}），建议优先勾选同一房间同一机架的连续笼位。
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
        <div class="field">
          <span class="field__label">拟入场日期 *</span>
          <input type="date" id="alloc-start-date" value="${curStart}" />
        </div>
        <div class="field">
          <span class="field__label">拟饲养天数 (天) *</span>
          <input type="number" id="alloc-feed-days" value="${curDays}" min="1" max="180" />
        </div>
      </div>

      <div style="font-size:12px;color:#475569;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;">
        <span>可选时空空闲笼位（共 <strong>${availableCages.length}</strong> 笼可用，已选 <strong id="alloc-selected-count" style="color:#2563eb;">${selectedCageIds.length}</strong> / 目标 ${order.quantity} 笼）：</span>
        <span style="font-size:11px;color:#0369a1;">拟退场日：<strong>${end}</strong> ｜ 最晚保留至：<strong>${expire}</strong></span>
      </div>

      ${
        availableCages.length
          ? `<div class="table-wrap" style="max-height:220px;overflow-y:auto;border:1px solid #e2e8f0;border-radius:4px;">
              <table style="width:100%;font-size:12px;">
                <thead>
                  <tr style="background:#f8fafc;">
                    <th style="width:40px;text-align:center;">选择</th>
                    <th>笼位编号</th>
                    <th>机架与房间</th>
                    <th>环境规格</th>
                    <th>容量标准</th>
                  </tr>
                </thead>
                <tbody id="alloc-cage-tbody">
                  ${availableCages
                    .map((c) => {
                      const isChecked = selectedCageIds.includes(c.id)
                      return `
                        <tr>
                          <td style="text-align:center;"><input type="checkbox" value="${c.id}" data-alloc-cage="${c.id}" ${isChecked ? 'checked' : ''} /></td>
                          <td><strong style="font-family:monospace;font-size:13px;color:#0f172a;">${escapeHtml(c.code)}</strong></td>
                          <td>${escapeHtml(c.rack || 'A架')} ｜ ${escapeHtml(c.room)}</td>
                          <td>${c.env === 'SPF' ? '<span style="color:#059669;font-weight:600;">SPF屏障IVC</span>' : '普通环境'}</td>
                          <td>${c.capacity} 只/笼</td>
                        </tr>
                      `
                    })
                    .join('')}
                </tbody>
              </table>
            </div>`
          : '<div class="state-area" style="padding:20px 0;"><p class="state-area__text">该时间段内暂无可用的空闲物理笼位，请调整入场日期或协调机架</p></div>'
      }
    `
  }

  const dlg = openDialog({
    title: `审核排位预分配物理笼位 · 订单 ${order.code}（${order.applicantName}）`,
    bodyHtml: `<div id="alloc-dialog-wrapper">${buildDialogContent()}</div>`,
    wide: true,
    actions: [
      { text: '取消' },
      {
        text: '同意排位并锁定笼位',
        primary: true,
        keepOpen: true,
        onClick: () => {
          if (!selectedCageIds.length) {
            toast('请至少选择一个物理笼位', 'warning')
            return
          }
          const res = allocateCages(order.id, selectedCageIds, curStart, curDays)
          if (res.ok) {
            showResult(res)
            dlg.close()
            rerender()
          } else {
            toast(res.message, 'error')
          }
        },
      },
    ],
  })

  function attachListeners(): void {
    const sInput = dlg.querySelector('#alloc-start-date') as HTMLInputElement | null
    const dInput = dlg.querySelector('#alloc-feed-days') as HTMLInputElement | null

    sInput?.addEventListener('change', () => {
      curStart = sInput.value || todayStr()
      refreshWrapper()
    })
    dInput?.addEventListener('input', () => {
      curDays = parseInt(dInput.value || '14', 10) || 14
      refreshWrapper()
    })

    dlg.querySelectorAll<HTMLInputElement>('input[data-alloc-cage]').forEach((cb) => {
      cb.addEventListener('change', () => {
        const id = cb.value
        if (cb.checked) {
          if (!selectedCageIds.includes(id)) selectedCageIds.push(id)
        } else {
          selectedCageIds = selectedCageIds.filter((cid) => cid !== id)
        }
        const countEl = dlg.querySelector('#alloc-selected-count')
        if (countEl) countEl.textContent = String(selectedCageIds.length)
      })
    })
  }

  function refreshWrapper(): void {
    const wrapper = dlg.querySelector('#alloc-dialog-wrapper')
    if (wrapper) {
      wrapper.innerHTML = buildDialogContent()
      attachListeners()
    }
  }

  attachListeners()
}

function openEntry(order: Order): void {
  const allocated = order.allocatedCageIds || []
  const preCages = data().cages.filter((c) => allocated.includes(c.id))
  const entryDate = todayStr()

  // 如果原本尚未预分配笼位（兼容历史单据），则回退允许现场挑选
  const needsSelect = preCages.length === 0
  const cages = needsSelect ? freeCages(todayStr()) : preCages

  const bodyHtml = `
    <div style="margin-bottom:12px;font-size:12px;line-height:1.6;background:#f0fdf4;border:1px solid #bbf7d0;padding:10px 12px;border-radius:6px;color:#166534;">
      <strong>💡 现场办理入住与扣缴规则：</strong><br>
      ① <strong>严格按原申请执行</strong>：现场核验动物健康检疫合格证，直接办理已预分配的 <strong>${allocated.length || order.quantity} 笼</strong>。<br>
      ② <strong>真实起始日 (Day 1)</strong>：办理当天（${entryDate}）锁定为实验在养真实 Day 1。<br>
      ③ <strong>资金结转</strong>：现场办理入住即正式从科研项目划扣预付基础饲养费（<strong>不予退还</strong>）。<br>
      ④ <strong>合笼平衡</strong>：在养期间因合笼提前释放的笼位不退费，由中心线下补发等额全价饲料耗材。
    </div>
    <div class="field">
      <span class="field__label">实际入场日期（Day 1） *</span>
      <input type="date" id="fd-entry-date" value="${entryDate}" />
    </div>
    <div class="field">
      <span class="field__label">核准分配的物理笼位：</span>
      ${
        !needsSelect
          ? `<div style="display:flex;gap:8px;flex-wrap:wrap;padding:6px 0;">
              ${preCages
                .map(
                  (c) =>
                    `<span style="background:#e0f2fe;color:#0369a1;border:1px solid #bae6fd;padding:4px 10px;border-radius:4px;font-weight:700;font-family:monospace;font-size:13px;">${escapeHtml(c.code)} (${c.room} · ${c.capacity}只/笼)</span>`,
                )
                .join('')}
            </div>`
          : cages.length
            ? `<div class="table-wrap"><table><tbody>${cages
                .map(
                  (c) =>
                    `<tr><td style="width:50px"><input type="checkbox" value="${c.id}" data-cage="${c.id}" /></td><td><strong>${c.code}</strong></td><td>${c.room}｜${c.env}</td><td>${c.capacity} 只/笼</td></tr>`,
                )
                .join('')}</tbody></table></div>`
            : '<div class="state-area"><p class="state-area__text">没有可用空闲笼位</p></div>'
      }
    </div>
    <div class="field">
      <span class="field__label">现场核验动物备注</span>
      <input type="text" id="fd-animal-note" value="${escapeHtml(order.spec || '')}" placeholder="核验健康状况及耳标编号..." />
    </div>
  `

  const dlg = openDialog({
    title: `办理现场入住与分配物理笼位 ${order.code}`,
    bodyHtml,
    wide: true,
    actions: [
      { text: '取消' },
      {
        text: '确认入场并正式扣款',
        primary: true,
        keepOpen: true,
        onClick: () => {
          const date = (dlg.querySelector('#fd-entry-date') as HTMLInputElement).value
          const note = (dlg.querySelector('#fd-animal-note') as HTMLInputElement).value
          const ids = needsSelect
            ? [...dlg.querySelectorAll<HTMLInputElement>('input[data-cage]:checked')].map((i) => i.value)
            : allocated
          const result = entryFeeding(order.id, ids, date, note)
          if (result.ok) {
            showResult(result)
            dlg.close()
            rerender()
          } else {
            toast(result.message, 'error')
          }
        },
      },
    ],
  })
}

function openCageChange(feeding: Feeding): void {
  const available = freeCages(todayStr())
  const bodyHtml =
    `<div class="field"><span class="field__label">生效日期 *</span><input type="date" id="fd-chg-date" value="${todayStr()}" /></div>` +
    '<div class="field"><span class="field__label">变更原因 *</span><input type="text" id="fd-chg-reason" placeholder="请输入变更原因" /></div>' +
    '<p class="hint">增加：勾选空闲笼位。减少：勾选当前占用笼位。“开始日含、结束日不含”，变更在所选日期零点生效。</p>' +
    `<div class="table-wrap"><table><tbody>${[
      ...available.map(
        (c) =>
          `<tr><td style="width:50px"><input type="checkbox" value="${c.id}" data-add="${c.id}" /></td><td>${c.code}</td><td>${c.room}｜${c.env}</td><td>空闲</td></tr>`,
      ),
      ...feeding.cageIds.map(
        (id) =>
          `<tr><td style="width:50px"><input type="checkbox" value="${id}" data-remove="${id}" /></td><td>${cageCode(id)}</td><td>${cageRoom(id)}</td><td>当前占用</td></tr>`,
      ),
    ].join('')}</tbody></table></div>`

  const dlg = openDialog({
    title: `笼位变更 ${orderRef(feeding.orderId)}`,
    bodyHtml,
    wide: true,
    actions: [
      { text: '取消' },
      {
        text: '保存变更',
        primary: true,
        keepOpen: true,
        onClick: () => {
          const date = (dlg.querySelector('#fd-chg-date') as HTMLInputElement).value
          const reason = (dlg.querySelector('#fd-chg-reason') as HTMLInputElement).value
          const add = [...dlg.querySelectorAll<HTMLInputElement>('input[data-add]')].filter((i) => i.checked).map((i) => i.value)
          const remove = [...dlg.querySelectorAll<HTMLInputElement>('input[data-remove]')].filter((i) => i.checked).map((i) => i.value)
          const result = changeCages({ feedingId: feeding.id, addCageIds: add, removeCageIds: remove, date, reason })
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

function openSupply(feeding: Feeding): void {
  const items = scoped(data().stockItems)
    .filter((s) => !categoryDef(s.category)?.isAnimal)
    .map((s) => ({ value: s.id, label: `${categoryText(s.category)}｜${s.name}（现存 ${s.quantity}${s.unit}）` }))
  formDialog(
    `耗材领用 ${orderRef(feeding.orderId)}`,
    [
      { kind: 'select', key: 'itemId', label: '耗材品目', required: true, options: items },
      { kind: 'number', key: 'quantity', label: '领用数量', required: true },
      { kind: 'note', text: '领用后扣减耗材库存，不另产生第二笔收费', full: true },
    ],
    (values) => {
      const result = takeSupply(feeding.id, values.itemId, Number(values.quantity))
      showResult(result)
      return result.ok
    },
    '确认领用',
  )
}

function openExit(feeding: Feeding): void {
  formDialog(
    `饲养退出 ${orderRef(feeding.orderId)}`,
    [
      { kind: 'date', key: 'exitAt', label: '退出日期', required: true, value: todayStr() },
      { kind: 'text', key: 'reason', label: '退出原因', required: true, full: true, placeholder: '如：实验结束、正常淘汰' },
      { kind: 'note', text: '退出后释放全部笼位，历史占用保留；退出不等于已扣费成功，费用需按计费区间生成。', full: true },
    ],
    (values) => {
      const result = exitFeeding(feeding.id, values.exitAt, values.reason)
      showResult(result)
      return result.ok
    },
    '确认退出',
  )
}

function openFee(feeding: Feeding): void {
  const startDefault = feeding.entryAt ?? todayStr()
  const endDefault = feeding.exitAt ?? todayStr()
  const trial = quoteFeedingFee(feeding, startDefault, endDefault)

  formDialog(
    `区间计费 ${orderRef(feeding.orderId)}`,
    [
      { kind: 'date', key: 'start', label: '计费开始日（含）', required: true, value: startDefault },
      { kind: 'date', key: 'end', label: '计费结束日（不含）', required: true, value: endDefault },
      {
        kind: 'note',
        text: trial.ok
          ? `默认区间试算：${trial.segments.map((s) => `${s.start}~${s.end} ${s.cages}笼×${s.days}天`).join('，')}，合计 ${moneyText(trial.amountFen)}`
          : `当前默认区间不可用：${trial.message}`,
        full: true,
      },
    ],
    (values, form) => {
      const calc = quoteFeedingFee(feeding, values.start, values.end)
      if (!calc.ok) {
        form.setError('end', calc.message)
        toast(calc.message, 'error')
        return false
      }
      const result = generateFeedingFee(feeding.id, values.start, values.end)
      showResult(result)
      return result.ok
    },
    '生成费用',
  )
}

export function openDetail(feeding: Feeding): void {
  const occupancies = occupanciesOf(feeding.id)
  const usages = supplyUsagesOf(feeding.id)
  const grid = detailGrid([
    ['关联订单', orderRef(feeding.orderId)],
    ['动物 / 规格', `${feeding.animalName}｜${feeding.spec}`],
    ['数量', `${feeding.quantity} 只`],
    ['入场日期', feeding.entryAt ?? '—'],
    ['退出日期', feeding.exitAt ?? '—'],
    ['单价快照', `${moneyText(feeding.unitPriceFen)} / 笼·天`],
    ['当前笼位', feeding.cageIds.map((id) => cageCode(id)).join('、') || '—'],
    ['状态', feeding.status === 'breeding' ? '在养' : feeding.status === 'exited' ? '已退出' : '待入场'],
  ])

  const dlg = openDialog({
    title: `饲养详情 ${orderRef(feeding.orderId)}`,
    bodyHtml: '',
    wide: true,
  })
  const body = dlg.querySelector('.dlg__body') as HTMLElement
  grid.style.margin = '0 0 12px'
  body.appendChild(grid)

  body.appendChild(el('p', 'hint', '笼位占用历史'))
  body.insertAdjacentHTML(
    'beforeend',
    `<table><thead><tr><th>笼位</th><th>开始（含）</th><th>结束（不含）</th><th>原因</th><th>操作人</th></tr></thead><tbody>${occupancies
      .map(
        (o) =>
          `<tr><td>${cageCode(o.cageId)}</td><td>${o.start}</td><td>${o.end ?? '占用中'}</td><td>${o.reason}</td><td>${o.operator}</td></tr>`,
      )
      .join('')}</tbody></table>`,
  )

  body.appendChild(el('p', 'hint', '耗材领用记录'))
  body.insertAdjacentHTML(
    'beforeend',
    usages.length
      ? `<table><thead><tr><th>日期</th><th>耗材</th><th>数量</th><th>操作人</th></tr></thead><tbody>${usages
          .map(
            (u) =>
              `<tr><td>${u.createdAt}</td><td>${itemName(u.itemId)}</td><td>${u.quantity}</td><td>${u.operator}</td></tr>`,
          )
          .join('')}</tbody></table>`
      : '<div class="state-area"><p class="state-area__text">暂无耗材领用记录</p></div>',
  )
}

/* ---------------- 工具 ---------------- */

function orderRef(orderId: string): string {
  return data().orders.find((o) => o.id === orderId)?.code ?? orderId
}

function cageCode(id: string): string {
  return data().cages.find((c) => c.id === id)?.code ?? id
}

function cageRoom(id: string): string {
  return data().cages.find((c) => c.id === id)?.room ?? '—'
}

function itemName(id: string): string {
  return data().stockItems.find((s) => s.id === id)?.name ?? '—'
}
