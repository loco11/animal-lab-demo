/** 业务概览：管理员日常工作驾驶舱（前三维度：今日待办卡点、空间负荷率、物资与活体安全底线） */

import { listOrders } from '../core/biz/orders'
import { listCages } from '../core/biz/feeding'
import { availableStockOf, lockedStockOf } from '../core/biz/stock'
import { data, scoped } from '../core/data'
import { AUDIT_STATUS_TEXT, FULFILL_TEXT, KIND_TEXT, auditTone, fulfillTone } from '../core/labels'
import { moneyText, escapeHtml } from '../core/utils'
import type { PageDef } from '../router'
import { navigate } from '../router'
import { tagHtml } from '../ui'
import { pageShell } from '../ui/form'

export const dashboardPage: PageDef = {
  title: '业务概览',
  render(host: HTMLElement) {
    const page = pageShell(host)

    // 1. 基础数据收集与计算
    const orders = listOrders()
    const pendingOut = orders.filter((o) => o.kind === 'internal' && o.fulfillStatus === 'pending_out')
    const pendingCollect = orders.filter((o) => o.kind === 'external' && (o.fulfillStatus === 'pending_collect' || o.fulfillStatus === 'pending_send'))
    const pendingBreeding = orders.filter((o) => o.kind === 'breeding' && (o.auditStatus === 'pending' || o.fulfillStatus === 'incoming'))

    // 财务异常
    const chargeRequests = scoped(data().chargeRequests)
    const failedCharges = chargeRequests.filter((r) => r.status === 'failed')
    const failedAmount = failedCharges.reduce((sum, r) => sum + r.amountFen, 0)

    // 笼位空间
    const cages = listCages()
    const totalCages = cages.length
    const occupiedCages = cages.filter((c) => c.status === 'occupied').length
    const reservedCages = cages.filter((c) => c.status === 'reserved').length
    const freeCages = cages.filter((c) => c.status === 'free').length
    const disabledCages = cages.filter((c) => c.status === 'disabled' || c.status === 'cleaning').length
    const loadPercent = totalCages > 0 ? Math.round(((occupiedCages + reservedCages) / totalCages) * 100) : 0

    // 按房间分组统计笼位
    const roomMap = new Map<string, { total: number; occupied: number; reserved: number; free: number; disabled: number }>()
    cages.forEach((c) => {
      const room = c.room || '普通屏障区'
      const stat = roomMap.get(room) || { total: 0, occupied: 0, reserved: 0, free: 0, disabled: 0 }
      stat.total++
      if (c.status === 'occupied') stat.occupied++
      else if (c.status === 'reserved') stat.reserved++
      else if (c.status === 'free') stat.free++
      else stat.disabled++
      roomMap.set(room, stat)
    })

    // 物资与活体
    const allStockItems = scoped(data().stockItems)
    const animalItems = allStockItems.filter((s) => s.category === 'cat_animal')
    const lowStockItems = allStockItems.filter((s) => s.quantity <= s.safeStock)
    const lossFlows = scoped(data().stockFlows).filter((f) => f.type === 'loss')
    const lossCount = lossFlows.reduce((sum, f) => sum + Math.abs(f.quantity), 0)

    page.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:20px;">
        
        <!-- =========================================================================
             维度一：今日行动卡点与待办
             ========================================================================= -->
        <div class="panel" style="padding:16px 20px;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="display:inline-block;width:4px;height:18px;background:#2563eb;border-radius:2px;"></span>
              <h2 style="margin:0;font-size:16px;font-weight:700;color:#0f172a;">今日行动卡点与待办</h2>
            </div>
          </div>

          <div style="display:grid;grid-template-columns:repeat(4, 1fr);gap:14px;">
            <!-- 待办 1：自产小鼠窗口出库 -->
            <div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:14px;display:flex;flex-direction:column;justify-content:space-between;transition:transform .15s ease;">
              <div>
                <div style="display:flex;justify-content:space-between;align-items:center;">
                  <span style="font-size:13px;font-weight:700;color:#1f2937;">自产小鼠 · 窗口待提货</span>
                  <span style="background:#f0fdf4;color:#15803d;font-size:10.5px;padding:2px 7px;border-radius:10px;font-weight:600;">现货已锁库</span>
                </div>
                <div style="margin:10px 0 4px 0;">
                  <span style="font-size:28px;font-weight:800;color:#2563eb;">${pendingOut.length}</span>
                  <span style="font-size:13px;color:#64748b;margin-left:4px;">笔订单</span>
                </div>
              </div>
              <button class="btn btn-default" id="btn-todo-outstock" style="margin-top:12px;width:100%;font-size:12px;padding:6px 0;">
                前往窗口出库交付 →
              </button>
            </div>

            <!-- 待办 2：外购小鼠汇总代报 -->
            <div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:14px;display:flex;flex-direction:column;justify-content:space-between;">
              <div>
                <div style="display:flex;justify-content:space-between;align-items:center;">
                  <span style="font-size:13px;font-weight:700;color:#1f2937;">外购小鼠 · 待汇总发厂商</span>
                  <span style="background:#eff6ff;color:#1d4ed8;font-size:10.5px;padding:2px 7px;border-radius:10px;font-weight:600;">经费已冻结</span>
                </div>
                <div style="margin:10px 0 4px 0;">
                  <span style="font-size:28px;font-weight:800;color:#2563eb;">${pendingCollect.length}</span>
                  <span style="font-size:13px;color:#64748b;margin-left:4px;">笔订单</span>
                </div>
              </div>
              <button class="btn btn-default" id="btn-todo-purchase" style="margin-top:12px;width:100%;font-size:12px;padding:6px 0;">
                前往外购汇总报单 →
              </button>
            </div>

            <!-- 待办 3：笼位排位与2天保留预警 -->
            <div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:14px;display:flex;flex-direction:column;justify-content:space-between;">
              <div>
                <div style="display:flex;justify-content:space-between;align-items:center;">
                  <span style="font-size:13px;font-weight:700;color:#1f2937;">屏障笼位 · 排位与到期核验</span>
                  <span style="background:#faf5ff;color:#7e22ce;font-size:10.5px;padding:2px 7px;border-radius:10px;font-weight:600;">2天保留制</span>
                </div>
                <div style="margin:10px 0 4px 0;">
                  <span style="font-size:28px;font-weight:800;color:#2563eb;">${pendingBreeding.length}</span>
                  <span style="font-size:13px;color:#64748b;margin-left:4px;">笔待办</span>
                </div>
              </div>
              <button class="btn btn-default" id="btn-todo-feeding" style="margin-top:12px;width:100%;font-size:12px;font-weight:600;padding:6px 0;">
                前往饲养排位管理 →
              </button>
            </div>

            <!-- 待办 4：学校扣费异常重试 -->
            <div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:14px;display:flex;flex-direction:column;justify-content:space-between;">
              <div>
                <div style="display:flex;justify-content:space-between;align-items:center;">
                  <span style="font-size:13px;font-weight:700;color:#1f2937;">学校接口 · 扣费异常失败</span>
                  <span style="background:${failedCharges.length ? '#fef2f2' : '#f1f5f9'};color:${failedCharges.length ? '#b91c1c' : '#64748b'};font-size:10.5px;padding:2px 7px;border-radius:10px;font-weight:600;">
                    ${failedCharges.length ? '余额不足' : '接口正常'}
                  </span>
                </div>
                <div style="margin:10px 0 4px 0;">
                  <span style="font-size:28px;font-weight:800;color:${failedCharges.length ? '#dc2626' : '#2563eb'};">${failedCharges.length}</span>
                  <span style="font-size:13px;color:#64748b;margin-left:4px;">笔（${moneyText(failedAmount)}）</span>
                </div>
              </div>
              <button class="btn btn-default" id="btn-todo-fee" style="margin-top:12px;width:100%;font-size:12px;font-weight:600;padding:6px 0;">
                查看费用结算异常 →
              </button>
            </div>
          </div>
        </div>

        <!-- =========================================================================
             维度二：物理空间承载力与笼位负荷
             ========================================================================= -->
        <div class="panel" style="padding:16px 20px;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="display:inline-block;width:4px;height:18px;background:#7e22ce;border-radius:2px;"></span>
              <h2 style="margin:0;font-size:16px;font-weight:700;color:#0f172a;">物理空间承载力与笼位负荷</h2>
            </div>
            <button class="btn btn-default" id="btn-goto-cageboard" style="color:#7e22ce;border-color:#d8b4fe;background:#fbf8ff;font-size:12px;font-weight:600;">
              打开交互式笼位空间看板 ↗
            </button>
          </div>

          <!-- 总体负荷率仪表区 -->
          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px;margin-bottom:16px;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
              <div style="display:flex;align-items:baseline;gap:8px;">
                <span style="font-size:14px;color:#334155;font-weight:600;">屏障总承载负荷率：</span>
                <span style="font-size:30px;font-weight:800;color:${loadPercent > 85 ? '#dc2626' : loadPercent > 70 ? '#2563eb' : '#059669'};">${loadPercent}%</span>
                <span style="font-size:12px;color:#64748b;">（已占用 + 预留锁定共 ${occupiedCages + reservedCages} 笼 / 总容量 ${totalCages} 笼）</span>
              </div>
              <div style="display:flex;gap:14px;font-size:12px;color:#475569;">
                <span style="display:flex;align-items:center;gap:5px;"><span style="width:10px;height:10px;background:#2563eb;border-radius:2px;"></span>在养使用：<strong>${occupiedCages} 笼</strong></span>
                <span style="display:flex;align-items:center;gap:5px;"><span style="width:10px;height:10px;background:#a855f7;border-radius:2px;"></span>预留锁定：<strong>${reservedCages} 笼</strong></span>
                <span style="display:flex;align-items:center;gap:5px;"><span style="width:10px;height:10px;background:#10b981;border-radius:2px;"></span>空闲可用：<strong>${freeCages} 笼</strong></span>
                <span style="display:flex;align-items:center;gap:5px;"><span style="width:10px;height:10px;background:#94a3b8;border-radius:2px;"></span>消杀停用：<strong>${disabledCages} 笼</strong></span>
              </div>
            </div>

            <!-- 分段色彩进度条 -->
            <div style="height:14px;background:#e2e8f0;border-radius:7px;display:flex;overflow:hidden;">
              <div style="width:${(occupiedCages / totalCages) * 100}%;background:#2563eb;" title="在养使用 ${occupiedCages} 笼"></div>
              <div style="width:${(reservedCages / totalCages) * 100}%;background:#a855f7;" title="预留锁定 ${reservedCages} 笼"></div>
              <div style="width:${(freeCages / totalCages) * 100}%;background:#10b981;" title="空闲可用 ${freeCages} 笼"></div>
              <div style="width:${(disabledCages / totalCages) * 100}%;background:#94a3b8;" title="消杀停用 ${disabledCages} 笼"></div>
            </div>
          </div>

          <!-- 各房间容量分布网格 -->
          <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(260px, 1fr));gap:12px;">
            ${Array.from(roomMap.entries())
              .map(([roomName, s]) => {
                const rLoad = Math.round(((s.occupied + s.reserved) / s.total) * 100)
                return `
                <div style="border:1px solid #e2e8f0;border-radius:8px;padding:12px 14px;background:#fff;">
                  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                    <strong style="font-size:13px;color:#1e293b;">${roomName}</strong>
                    <span style="font-size:11.5px;font-weight:700;color:${rLoad > 80 ? '#dc2626' : '#2563eb'};">负荷 ${rLoad}%</span>
                  </div>
                  <div style="font-size:12px;color:#64748b;display:flex;gap:10px;margin-top:4px;">
                    <span>在养 <strong>${s.occupied}</strong></span>
                    <span>预留 <strong>${s.reserved}</strong></span>
                    <span style="color:#059669;">空闲 <strong>${s.free}</strong></span>
                    ${s.disabled > 0 ? `<span style="color:#d97706;">检修 <strong>${s.disabled}</strong></span>` : ''}
                  </div>
                </div>
              `
              })
              .join('')}
          </div>
        </div>

        <!-- =========================================================================
             维度三：物资与活体安全底线（防断粮、防超卖、防事故）
             ========================================================================= -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">
          <!-- 左卡片：活体动物在库现货与防超卖配额 -->
          <div class="panel" style="padding:16px 20px;margin-bottom:0;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
              <div style="display:flex;align-items:center;gap:8px;">
                <span style="display:inline-block;width:4px;height:18px;background:#16a34a;border-radius:2px;"></span>
                <h2 style="margin:0;font-size:15px;font-weight:700;color:#0f172a;">活体自产小鼠现货与防超卖配额</h2>
              </div>
              <button class="btn btn-default" id="btn-goto-stock" style="font-size:11.5px;padding:3px 8px;">库存台账 ↗</button>
            </div>
            
            <table style="width:100%;font-size:12px;border-collapse:collapse;">
              <thead>
                <tr style="border-bottom:1px solid #e2e8f0;color:#64748b;text-align:left;">
                  <th style="padding:6px 0;">品系品规</th>
                  <th>物理在库</th>
                  <th>待出库锁定</th>
                  <th>实时可用</th>
                  <th style="text-align:right;">健康状态</th>
                </tr>
              </thead>
              <tbody>
                ${animalItems.slice(0, 4).map((item) => {
                  const locked = lockedStockOf(item.id)
                  const avail = availableStockOf(item.id)
                  const isSafe = item.quantity >= locked
                  return `
                    <tr style="border-bottom:1px solid #f1f5f9;height:36px;">
                      <td style="font-weight:600;color:#1e293b;">${item.name} <span style="color:#64748b;font-size:11px;">(${item.spec})</span></td>
                      <td>${item.quantity} ${item.unit}</td>
                      <td style="color:#d97706;font-weight:600;">${locked} ${item.unit}</td>
                      <td style="color:#16a34a;font-weight:700;">${avail} ${item.unit}</td>
                      <td style="text-align:right;">
                        ${isSafe ? `<span style="color:#059669;font-weight:600;">● 配额安全</span>` : `<span style="color:#dc2626;font-weight:700;">▲ 产生缺口</span>`}
                      </td>
                    </tr>
                  `
                }).join('')}
              </tbody>
            </table>
          </div>

          <!-- 右卡片：物资安全库存预警与损耗留痕 -->
          <div class="panel" style="padding:16px 20px;margin-bottom:0;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
              <div style="display:flex;align-items:center;gap:8px;">
                <span style="display:inline-block;width:4px;height:18px;background:#f59e0b;border-radius:2px;"></span>
                <h2 style="margin:0;font-size:15px;font-weight:700;color:#0f172a;">安全库存报警与近期损耗留痕</h2>
              </div>
              <span style="font-size:11.5px;color:#d97706;font-weight:600;">低库存：${lowStockItems.length} 项</span>
            </div>

            <!-- 低库存警告区 -->
            <div style="margin-bottom:12px;">
              ${
                lowStockItems.length > 0
                  ? `
                <div style="display:flex;flex-direction:column;gap:6px;">
                  ${lowStockItems.slice(0, 2).map((item) => `
                    <div style="display:flex;justify-content:space-between;align-items:center;background:#fffbeb;border:1px solid #fef3c7;border-radius:6px;padding:6px 10px;font-size:12px;">
                      <span style="font-weight:600;color:#92400e;">⚠️ ${item.name}（${item.spec}）</span>
                      <span style="color:#b45309;">现存 <strong>${item.quantity}</strong> / 安全线下限 ${item.safeStock} ${item.unit}</span>
                    </div>
                  `).join('')}
                </div>
              `
                  : `
                <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;padding:8px 10px;font-size:12px;color:#166534;">
                  ✅ 全校物资与饲料垫料均处于安全库存线上，供应充足无断粮风险。
                </div>
              `
              }
            </div>

            <!-- 近期损耗监控区 -->
            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 14px;">
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <span style="font-size:12px;font-weight:600;color:#334155;">近 7 天在库活体自然损耗登记</span>
                <span style="font-size:15px;font-weight:800;color:#475569;">累计 ${lossCount} 只</span>
              </div>
            </div>
          </div>
        </div>

        <!-- =========================================================================
             底部：最近待办与订单流水
             ========================================================================= -->
        <div class="panel" style="padding:16px 20px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="display:inline-block;width:4px;height:18px;background:#64748b;border-radius:2px;"></span>
              <h2 style="margin:0;font-size:15px;font-weight:700;color:#0f172a;">全校近期申办业务流水</h2>
            </div>
            <button class="btn btn-default" id="btn-goto-allorders" style="font-size:11.5px;padding:3px 8px;">进入订单中心 ↗</button>
          </div>

          <table style="width:100%;font-size:12px;border-collapse:collapse;">
            <thead>
              <tr style="border-bottom:1px solid #e2e8f0;color:#64748b;text-align:left;">
                <th style="padding:8px 0;">订单编号</th>
                <th>业务类型</th>
                <th>申请服务/品目</th>
                <th>申请人 / 课题组</th>
                <th>审核状态</th>
                <th>履约/业务状态</th>
                <th>提交时间</th>
                <th style="text-align:right;">快捷操作</th>
              </tr>
            </thead>
            <tbody>
              ${orders.slice(0, 6).map((o) => `
                <tr style="border-bottom:1px solid #f1f5f9;height:38px;">
                  <td style="font-weight:600;color:#2563eb;">${o.code}</td>
                  <td>${tagHtml(KIND_TEXT[o.kind], 'default')}</td>
                  <td style="font-weight:600;color:#1e293b;">${escapeHtml(o.serviceName)}</td>
                  <td>${escapeHtml(o.applicantName)}</td>
                  <td>${tagHtml(AUDIT_STATUS_TEXT[o.auditStatus], auditTone(o.auditStatus))}</td>
                  <td>${tagHtml(FULFILL_TEXT[o.fulfillStatus], fulfillTone(o.fulfillStatus))}</td>
                  <td style="color:#64748b;">${o.createdAt}</td>
                  <td style="text-align:right;">
                    <a href="#/order?code=${o.code}" style="color:#2563eb;text-decoration:none;font-weight:600;">详情/处理</a>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

      </div>
    `

    // 绑定快捷路由跳转
    page.querySelector('#btn-todo-outstock')?.addEventListener('click', () => navigate('/order/internal'))
    page.querySelector('#btn-todo-purchase')?.addEventListener('click', () => navigate('/purchase'))
    page.querySelector('#btn-todo-feeding')?.addEventListener('click', () => navigate('/feeding'))
    page.querySelector('#btn-todo-fee')?.addEventListener('click', () => navigate('/fee'))
    page.querySelector('#btn-goto-cageboard')?.addEventListener('click', () => navigate('/cage/board'))
    page.querySelector('#btn-goto-stock')?.addEventListener('click', () => navigate('/stock'))
    page.querySelector('#btn-goto-allorders')?.addEventListener('click', () => navigate('/order'))
  },
}
