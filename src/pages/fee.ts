/** 费用结算：费用明细、学校扣费提交、结果查询与历史 */

import {
  chargeOutcome,
  feeChargeStatus,
  latestRequest,
  queryResult,
  retryCharge,
  setChargeOutcome,
  submitCharge,
} from '../core/biz/fee'
import { data, scoped } from '../core/data'
import { KIND_TEXT } from '../core/labels'
import { moneyText } from '../core/utils'
import type { ChargeRequest, Fee } from '../types'
import type { ChargeOutcomeMode } from '../core/schoolapi'
import type { PageDef } from '../router'
import { currentPath, currentQuery, rerender } from '../router'
import { el, openDialog, renderTable, renderTabs, tagHtml, toast, type RowAction } from '../ui'
import { formDialog, pageShell } from '../ui/form'
import { buildQuery, runGuarded, showResult } from './common'

type TabKey = 'fee' | 'request'

const view = {
  tab: 'fee' as TabKey,
  filters: { ...{ code: '', status: '' },   ...(currentQuery().status ? { status: currentQuery().status } : {}) } as Record<
    string,
    string
  >,
}

/** 上一次渲染的路由（含查询串）；变化时才从路由同步视图，本页交互重绘不重置 */
let routeKey = ''

function syncFromRoute(): void {
  if (routeKey === currentPath()) return
  routeKey = currentPath()
  const q = currentQuery()
  view.tab = 'fee'
  view.filters = { code: '', status: q.status ?? '' }
}

export const feePage: PageDef = {
  title: '费用结算',
  render(host: HTMLElement) {
    syncFromRoute()
    const page = pageShell(host, {
    })

    renderTabs(
      page,
      [
        { key: 'fee', text: '费用明细', count: feeRows().length },
        { key: 'request', text: '扣费请求与结果', count: scoped(data().chargeRequests).length },
      ],
      view.tab,
      (key) => {
        view.tab = key as TabKey
        rerender()
      },
    )

    const demoBar = el('div', 'panel toolbar')
    demoBar.innerHTML = `
      <div class="toolbar__actions">
        <span class="hint">扣费返回结果</span>
        <select id="demo-outcome" style="width:200px">
          <option value="success">下一次查询：扣费成功</option>
          <option value="failed">下一次查询：明确失败</option>
          <option value="unknown">下一次查询：结果暂未知</option>
        </select>
      </div>
    `
    const sel = demoBar.querySelector('#demo-outcome') as HTMLSelectElement
    sel.value = chargeOutcome()
    sel.addEventListener('change', () => {
      setChargeOutcome(sel.value as ChargeOutcomeMode)
      toast(`已设置扣费返回结果：${sel.options[sel.selectedIndex].text}`, 'info')
    })
    page.appendChild(demoBar)

    const query = buildQuery(
      [
        { key: 'code', label: '关联订单编号', type: 'text' },
        {
          key: 'status',
          label: '扣费状态',
          type: 'select',
          options: [
            { value: 'pending', label: '待扣费' },
            { value: 'processing', label: '扣费处理中' },
            { value: 'success', label: '扣费成功' },
            { value: 'failed', label: '扣费失败' },
          ],
        },
      ],
      view.filters,
      (values) => {
        view.filters = values
        rerender()
      },
      () => {
        view.filters = { code: '', status: '' }
        rerender()
      },
    )
    page.appendChild(query.node)

    if (view.tab === 'fee') renderFees(page)
    else renderRequests(page)
  },
}

/* ---------------- 费用明细 ---------------- */

function feeRows(): Fee[] {
  let list = scoped(data().fees)
  if (view.filters.code) {
    list = list.filter((f) => (orderCode(f.orderId) ?? '').includes(view.filters.code))
  }
  if (view.filters.status) {
    const map: Record<string, string> = { pending: '待扣费', processing: '扣费处理中', success: '扣费成功', failed: '扣费失败' }
    list = list.filter((f) => feeChargeStatus(f).text === map[view.filters.status])
  }
  return list
}

function renderFees(page: HTMLElement): void {
  const host = el('div', 'panel panel-table')
  renderTable<Fee>(
    host,
    {
      cols: [
        { key: 'code', title: '关联订单', render: (r) => orderCode(r.orderId) ?? '—' },
        { key: 'kind', title: '业务类型', render: (r) => KIND_TEXT[r.kind] },
        { key: 'title', title: '费用项', ellipsis: true },
        { key: 'basis', title: '计费依据', ellipsis: true, render: (r) => r.basis },
        { key: 'period', title: '计费区间', render: (r) => (r.periodStart ? `${r.periodStart} ~ ${r.periodEnd}（结束日不含）` : '—') },
        { key: 'amount', title: '金额', align: 'right', render: (r) => `<strong>${moneyText(r.amountFen)}</strong>` },
        {
          key: 'channel',
          title: '结算渠道',
          render: (r) => (r.channel === 'external' ? tagHtml('外部结算待确认', 'warning') : tagHtml('校内项目扣费', 'primary')),
        },
        { key: 'status', title: '扣费状态', render: (r) => tagHtml(feeChargeStatus(r).text, feeChargeStatus(r).tone) },
        { key: 'createdAt', title: '生成日期' },
      ],
      rows: feeRows(),
      actions: (row) => {
        const status = feeChargeStatus(row)
        const req = latestRequest(row.id)
        const actions: RowAction[] = [{ text: '费用详情', act: 'detail' }]
        if (row.channel === 'internal' && status.text === '待扣费') actions.push({ text: '提交扣费', act: 'submit' })
        if (req && req.status === 'processing') actions.push({ text: '查询结果', act: 'query' })
        if (req && req.status === 'failed') actions.push({ text: '重试', act: 'retry' })
        if (req) actions.push({ text: '尝试记录', act: 'attempts' })
        return actions
      },
      queryActive: Object.values(view.filters).some(Boolean),
      emptyText: '当前范围暂无费用记录',
    },
    {
      onAction: (act, row) => {
        if (act === 'detail') openFeeDetail(row)
        if (act === 'submit') runGuarded('fee:submit', () => openSubmit(row))
        if (act === 'query') {
          const req = latestRequest(row.id)
          if (req) showResult(queryResult(req.id))
        }
        if (act === 'retry') {
          const req = latestRequest(row.id)
          if (req) showResult(retryCharge(req.id))
        }
        if (act === 'attempts') {
          const req = latestRequest(row.id)
          if (req) openAttempts(req)
        }
      },
    },
  )
  page.appendChild(host)
}

/* ---------------- 扣费请求 ---------------- */

function renderRequests(page: HTMLElement): void {
  const host = el('div', 'panel panel-table')
  const rows = scoped(data().chargeRequests)
  renderTable<ChargeRequest>(
    host,
    {
      cols: [
        { key: 'bizSeq', title: '业务流水（幂等）' },
        { key: 'order', title: '关联订单', render: (r) => orderCode(r.orderId) ?? '—' },
        { key: 'amount', title: '金额', align: 'right', render: (r) => moneyText(r.amountFen) },
        { key: 'project', title: '经费项目', render: (r) => projectName(r.projectId) },
        { key: 'applicant', title: '申请人' },
        {
          key: 'status',
          title: '状态',
          render: (r) =>
            r.status === 'success'
              ? tagHtml('成功', 'success')
              : r.status === 'failed'
                ? tagHtml('失败', 'danger')
                : tagHtml('处理中', 'primary'),
        },
        { key: 'attempts', title: '尝试次数', align: 'right', render: (r) => String(r.attempts.length) },
        { key: 'schoolSeq', title: '学校流水号', render: (r) => r.schoolSeq ?? '—' },
        { key: 'updatedAt', title: '更新时间' },
      ],
      rows,
      actions: (row) =>
        [
          row.status === 'processing' ? { text: '查询结果', act: 'query' } : null,
          row.status === 'failed' ? { text: '重试', act: 'retry' } : null,
          { text: '尝试记录', act: 'attempts' },
        ].filter(Boolean) as RowAction[],
      emptyText: '暂无扣费请求',
    },
    {
      onAction: (act, row) => {
        if (act === 'query') showResult(queryResult(row.id))
        if (act === 'retry') runGuarded('fee:submit', () => showResult(retryCharge(row.id)))
        if (act === 'attempts') openAttempts(row)
      },
    },
  )
  page.appendChild(host)

}

/* ---------------- 弹窗 ---------------- */

function openFeeDetail(fee: Fee): void {
  const req = latestRequest(fee.id)
  openDialog({
    title: `费用详情 ${orderCode(fee.orderId) ?? ''}`,
    bodyHtml: `
      <div class="form-grid" style="grid-template-columns: repeat(2, minmax(0,1fr))">
        <div class="field"><span class="field__label">费用项</span><span>${fee.title}</span></div>
        <div class="field"><span class="field__label">金额</span><span><strong>${moneyText(fee.amountFen)}</strong></span></div>
        <div class="field"><span class="field__label">计费依据</span><span>${fee.basis}</span></div>
        <div class="field"><span class="field__label">计费区间</span><span>${
          fee.periodStart ? `${fee.periodStart} ~ ${fee.periodEnd}（结束日不含）` : '不适用'
        }</span></div>
        <div class="field"><span class="field__label">结算渠道</span><span>${
          fee.channel === 'external' ? '外部客户 · 外部结算待确认' : '校内经费项目扣费'
        }</span></div>
        <div class="field"><span class="field__label">扣费状态</span><span>${
          feeChargeStatus(fee).text
        }</span></div>
        <div class="field"><span class="field__label">业务标识</span><span>${req?.bizSeq ?? '尚未提交'}</span></div>
        <div class="field"><span class="field__label">学校流水号</span><span>${req?.schoolSeq ?? '—'}</span></div>
      </div>
    `,
    wide: true,
  })
}

function openSubmit(fee: Fee): void {
  const projects = scoped(data().projects)
    .filter((p) => p.enabled)
    .map((p) => ({ value: p.id, label: `${p.code} ${p.name}` }))
  const order = data().orders.find((o) => o.id === fee.orderId)

  formDialog(
    `提交学校扣费 ${orderCode(fee.orderId) ?? ''}`,
    [
      { kind: 'readonly', key: 'amount', label: '扣费金额（元，取自费用记录）', value: String(fee.amountFen / 100), full: true },
      { kind: 'select', key: 'projectId', label: '校内经费项目', required: true, options: projects, full: true },
      { kind: 'text', key: 'applicantName', label: '申请人', required: true, value: order?.applicantName ?? '' },
      { kind: 'note', text: '金额不可在弹窗中修改，关闭弹窗或刷新页面不等于扣费失败。', full: true },
    ],
    (values) => {
      const result = submitCharge({ feeId: fee.id, projectId: values.projectId, applicantName: values.applicantName })
      showResult(result)
      return result.ok
    },
    '确认提交',
  )
}

function openAttempts(req: ChargeRequest): void {
  openDialog({
    title: `尝试记录 ${req.bizSeq}`,
    bodyHtml: `<table><thead><tr><th>序号</th><th>时间</th><th>结果</th><th>说明</th></tr></thead><tbody>${req.attempts
      .map(
        (a) =>
          `<tr><td>${a.seq}</td><td>${a.at}</td><td>${a.outcome}</td><td>${a.message}</td></tr>`,
      )
      .join('')}</tbody></table>` +
      `<p class="hint">失败原因：${req.failReason ?? '—'}</p>`,
    wide: true,
  })
}

function orderCode(orderId: string): string | undefined {
  return data().orders.find((o) => o.id === orderId)?.code
}

function projectName(id: string): string {
  return data().projects.find((p) => p.id === id)?.name ?? '—'
}
