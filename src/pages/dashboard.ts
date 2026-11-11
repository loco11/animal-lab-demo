/** 业务概览：当前范围的摘要，点击进入对应筛选列表；不是完整报表模块 */

import { listOrders } from '../core/biz/orders'
import { listFeedings, listCages } from '../core/biz/feeding'
import { requestsOfFee } from '../core/biz/fee'
import { data, scoped } from '../core/data'
import { auditPassed } from '../core/labels'
import { moneyText } from '../core/utils'
import type { PageDef } from '../router'
import { navigate } from '../router'
import { el, tagHtml } from '../ui'
import { pageShell } from '../ui/form'

interface Metric {
  label: string
  value: string
  unit?: string
  route: string
  tone?: 'warning' | 'primary' | 'danger'
}

export const dashboardPage: PageDef = {
  title: '业务概览',
  render(host: HTMLElement) {
    const page = pageShell(host)

    const orders = listOrders()
    const pendingAudit = orders.filter((o) => o.auditStatus === 'pending')
    const pendingOut = orders.filter((o) => o.kind === 'internal' && o.fulfillStatus === 'pending_out' && auditPassed(o.auditStatus))
    const pendingCollect = orders.filter((o) => o.kind === 'external' && o.fulfillStatus !== 'sent')
    const incoming = orders.filter((o) => o.kind === 'breeding' && o.fulfillStatus === 'incoming')
    const breeding = listFeedings().filter((f) => f.status === 'breeding')
    const cages = listCages()
    const occupied = cages.filter((c) => c.status === 'occupied').length
    const lowStock = scoped(data().stockItems).filter((s) => s.quantity <= s.safeStock)

    const chargeable = scoped(data().fees).filter((f) => {
      if (f.channel !== 'internal') return false
      const reqs = requestsOfFee(f.id)
      return reqs.every((r) => r.status !== 'success')
    })
    const chargeableAmount = chargeable.reduce((sum, f) => sum + f.amountFen, 0)

    const metrics: Metric[] = [
      { label: '待确认订单', value: String(pendingAudit.length), unit: '笔', route: '/order?audit=pending', tone: 'warning' },
      { label: '待出库订单', value: String(pendingOut.length), unit: '笔', route: '/order?fulfill=pending_out' },
      { label: '在养业务', value: String(breeding.length), unit: '项', route: '/feeding?status=breeding', tone: 'primary' },
      { label: '待扣费用', value: chargeableAmount ? moneyText(chargeableAmount) : '0.00', unit: chargeableAmount ? '' : '元', route: '/fee?status=pending', tone: chargeable.length ? 'danger' : 'primary' },
      { label: '外购未发送', value: String(pendingCollect.length), unit: '笔', route: '/purchase' },
      { label: '待入场饲养', value: String(incoming.length), unit: '笔', route: '/feeding?status=incoming' },
      { label: '库存预警', value: String(lowStock.length), unit: '项', route: '/stock?low=1' },
      { label: '占用笼位', value: String(occupied), unit: '/ ' + cages.length, route: '/cage?status=occupied' },
    ]

    const grid = el('div', 'metric-grid')
    metrics.forEach((m) => {
      const card = el('div', 'metric')
      card.style.cursor = 'pointer'
      card.innerHTML = `
        <div class="metric__label">${m.label}</div>
        <div class="metric__value">${m.value}<span class="metric__unit">${m.unit ?? ''}</span></div>
      `
      card.addEventListener('click', () => navigate(m.route))
      grid.appendChild(card)
    })
    page.appendChild(grid)

    const recent = orders.slice(0, 6)
    const list = el('div', 'panel')
    list.appendChild(el('h2', 'panel-title', '最近订单'))
    if (!recent.length) {
      list.innerHTML += '<p class="hint">当前范围暂无订单</p>'
    } else {
      const rows = recent
        .map(
          (o) =>
            `<tr><td>${o.code}</td><td>${o.itemName}</td><td>${o.applicantName}</td><td>${
              o.auditStatus === 'pending' ? tagHtml('待确认', 'warning') : o.auditStatus === 'rejected' ? tagHtml('已退回', 'danger') : tagHtml('已通过', 'success')
            }</td><td>${o.createdAt}</td></tr>`,
        )
        .join('')
      list.innerHTML += `<table><thead><tr><th>订单编号</th><th>品目</th><th>申请人</th><th>审核</th><th>提交日期</th></tr></thead><tbody>${rows}</tbody></table>`
    }
    page.appendChild(list)
  },
}


