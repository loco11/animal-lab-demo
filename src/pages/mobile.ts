/**
 * 实验动物中心 · 学生移动端
 * 页面架构：
 *   1. 首页 (Home) - 个人信息卡、统计四宫格、极简服务卡片
 *   2. 独立申办页 (Apply Page) - 全屏独立表单、实时库存联动、多科研项目下拉、多行文本域、吸底结算栏
 *   3. 我的订单 (Orders) - 状态过滤条、条目化订单卡片、三段式审批时间轴展开
 */

import { availableStockOf } from '../core/biz/stock'
import { data, updateData } from '../core/data'
import { KIND_INITIAL_FULFILL } from '../core/labels'
import { notify } from '../core/store'
import { escapeHtml, moneyText, todayStr, uid, addDays } from '../core/utils'
import type { Order, OrderKind } from '../types'
import { el, toast } from '../ui'

// 现代矢量线性图标
const ICON_HOME = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`
const ICON_ORDER = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`
const ICON_USER = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`

// 当前移动端全局状态（模块级持久化，在 notify/rerender 时保持用户所在视图）
let currentView: 'home' | 'orders' | 'apply' = 'home'
let currentApplyKind: OrderKind = 'internal'
let orderFilter: 'all' | 'processing' | 'completed' = 'all'
const expandedOrderIds = new Set<string>()

/** 订单生命周期业务终态判定：已完成 */
export function isOrderCompleted(o: Order): boolean {
  if (o.kind === 'internal') return o.fulfillStatus === 'completed'
  if (o.kind === 'external') return o.fulfillStatus === 'sent'
  if (o.kind === 'breeding') return o.fulfillStatus === 'exited'
  return false
}

/** 订单生命周期业务状态判定：进行中（未到终态且未被退回） */
export function isOrderProcessing(o: Order): boolean {
  return !isOrderCompleted(o) && o.auditStatus !== 'rejected'
}

export function mobilePage(host: HTMLElement): void {
  const stage = el('div', 'mobile-view-stage')

  function render(): void {
    const orders = data().orders
    const totalCount = orders.length
    const processingCount = orders.filter(isOrderProcessing).length
    const completedCount = orders.filter(isOrderCompleted).length

    stage.innerHTML = `
      <div class="mobile-app-container">
        <!-- 动态主页面插槽 -->
        <div id="mobile-page-body"></div>

        <!-- 底部吸底双 TabBar（在填报页面 apply 时隐藏，保持独立全屏沉浸感） -->
        ${
          currentView !== 'apply'
            ? `
          <nav class="bottom-tabbar">
            <div class="bottom-tab-item ${currentView === 'home' ? 'is-active' : ''}" data-nav="home">
              <span class="bottom-tab-icon">${ICON_HOME}</span>
              <span>首页</span>
            </div>
            <div class="bottom-tab-item ${currentView === 'orders' ? 'is-active' : ''}" data-nav="orders">
              <span class="bottom-tab-icon">
                ${ICON_ORDER}
                ${processingCount > 0 ? `<span class="tab-badge-num">${processingCount}</span>` : ''}
              </span>
              <span>我的订单</span>
            </div>
          </nav>
        `
            : ''
        }
      </div>
    `

    // Tab 切换事件
    stage.querySelectorAll('.bottom-tab-item').forEach((item) => {
      item.addEventListener('click', () => {
        const target = item.getAttribute('data-nav') as 'home' | 'orders'
        if (target && target !== currentView) {
          currentView = target
          render()
          window.scrollTo(0, 0)
        }
      })
    })

    const bodySlot = stage.querySelector('#mobile-page-body') as HTMLElement
    if (currentView === 'home') {
      renderHomePage(bodySlot, { total: totalCount, processing: processingCount, completed: completedCount })
    } else if (currentView === 'orders') {
      renderOrdersPage(bodySlot)
    } else {
      renderApplyPage(bodySlot, currentApplyKind)
    }
  }

  /* ==========================================================================
     页面 1：【首页】（个人信息头 + 统计三大类 + 极简服务卡片）
     ========================================================================== */
  function renderHomePage(
    slot: HTMLElement,
    stats: { total: number; processing: number; completed: number }
  ): void {
    slot.innerHTML = `
      <!-- 头部学生个人信息 -->
      <header class="home-header">
        <div class="student-profile">
          <div class="student-avatar">
            ${ICON_USER}
          </div>
          <div class="student-info">
            <div class="student-name-row">
              <span class="student-name">张立</span>
            </div>
            <div class="student-meta-row">
              <span>学号 202409012</span>
            </div>
            <div class="student-sub-row">
              基础医学院
            </div>
          </div>
        </div>
      </header>

      <!-- 首页内容主体 -->
      <main class="home-body">
        <!-- 统计三大类：全部订单、进行中、已完成 -->
        <section class="stats-grid" style="grid-template-columns: repeat(3, 1fr);">
          <div class="stat-card" data-jump="all">
            <span class="stat-card__label">全部订单</span>
            <span class="stat-card__num">${stats.total}</span>
          </div>
          <div class="stat-card" data-jump="processing">
            <span class="stat-card__label">进行中</span>
            <span class="stat-card__num" style="color:#d97706;">${stats.processing}</span>
          </div>
          <div class="stat-card" data-jump="completed">
            <span class="stat-card__label">已完成</span>
            <span class="stat-card__num" style="color:#059669;">${stats.completed}</span>
          </div>
        </section>

        <!-- 服务入口卡片区 -->
        <section class="service-section">
          <!-- 卡片 1：自产动物 -->
          <div class="service-clean-card" id="card-apply-internal">
            <div class="service-clean-card__head">
              <span class="service-clean-kind-badge badge-kind-internal">自产动物</span>
              <div class="service-clean-center">
                <span class="service-clean-center__dot" style="background:#16a34a;"></span>
                实验动物中心
              </div>
            </div>
            <div class="service-clean-card__body">
              <h3 class="service-clean-title">自产实验动物供应</h3>
              <div class="service-item-chips">
                <span class="service-item-chip"><strong>KM小鼠</strong>（SPF级，4周龄）</span>
                <span class="service-item-chip"><strong>SD大鼠</strong>（SPF级，6周龄）</span>
                <span class="service-item-chip"><strong>教学用野生型小鼠</strong></span>
              </div>
            </div>
            <div class="service-clean-card__foot">
              <button class="service-clean-btn btn-kind-internal">立即申办 ›</button>
            </div>
          </div>

          <!-- 卡片 2：外购代采 -->
          <div class="service-clean-card" id="card-apply-external">
            <div class="service-clean-card__head">
              <span class="service-clean-kind-badge badge-kind-external">外购代采</span>
              <div class="service-clean-center">
                <span class="service-clean-center__dot" style="background:#2563eb;"></span>
                分析测试中心
              </div>
            </div>
            <div class="service-clean-card__body">
              <h3 class="service-clean-title">特种实验动物集中申购</h3>
              <div class="service-item-chips">
                <span class="service-item-chip"><strong>C57BL/6J 小鼠</strong>（维通利华）</span>
                <span class="service-item-chip"><strong>BALB/c 裸鼠</strong>（斯贝福协议直供）</span>
              </div>
            </div>
            <div class="service-clean-card__foot">
              <button class="service-clean-btn btn-kind-external">立即申办 ›</button>
            </div>
          </div>

          <!-- 卡片 3：饲养寄养 -->
          <div class="service-clean-card" id="card-apply-breeding">
            <div class="service-clean-card__head">
              <span class="service-clean-kind-badge badge-kind-breeding">饲养寄养</span>
              <div class="service-clean-center">
                <span class="service-clean-center__dot" style="background:#9333ea;"></span>
                实验动物中心
              </div>
            </div>
            <div class="service-clean-card__body">
              <h3 class="service-clean-title">屏障笼位饲养及托管</h3>
              <div class="service-item-chips">
                <span class="service-item-chip"><strong>小鼠笼位饲养服务</strong>（独立通风笼位）</span>
                <span class="service-item-chip"><strong>教学动物寄养（服务大厅审批）</strong>（普通环境）</span>
              </div>
            </div>
            <div class="service-clean-card__foot">
              <button class="service-clean-btn btn-kind-breeding">立即申办 ›</button>
            </div>
          </div>
        </section>
      </main>
    `

    // 统计卡片跳转订单列表
    slot.querySelectorAll('.stat-card[data-jump]').forEach((card) => {
      card.addEventListener('click', () => {
        const jump = card.getAttribute('data-jump') as any
        orderFilter = jump || 'all'
        currentView = 'orders'
        render()
        window.scrollTo(0, 0)
      })
    })

    // 点击三大服务入口进入独立申办页面
    slot.querySelector('#card-apply-internal')?.addEventListener('click', () => {
      currentApplyKind = 'internal'
      currentView = 'apply'
      render()
      window.scrollTo(0, 0)
    })
    slot.querySelector('#card-apply-external')?.addEventListener('click', () => {
      currentApplyKind = 'external'
      currentView = 'apply'
      render()
      window.scrollTo(0, 0)
    })
    slot.querySelector('#card-apply-breeding')?.addEventListener('click', () => {
      currentApplyKind = 'breeding'
      currentView = 'apply'
      render()
      window.scrollTo(0, 0)
    })
  }

  /* ==========================================================================
     页面 2：【独立服务申办页】（全屏沉浸式页面：实时库存、多科研项目、多行文本域）
     ========================================================================== */
  function renderApplyPage(slot: HTMLElement, kind: OrderKind): void {
    const isInternal = kind === 'internal'
    const isBreeding = kind === 'breeding'

    // 获取底层实时数据
    const cages = data().cages
    const idleCages = cages.filter((c) => c.status === 'free').length

    // 1. 品规选项数据源
    interface ServiceOptionItem {
      id: string
      title: string
      spec: string
      priceFen: number
      unit: string
      stockItemId?: string
      supplierId?: string
      badge?: string
      badgeColor?: string
    }

    let serviceOptions: ServiceOptionItem[] = []
    if (isInternal) {
      const kmStock = data().stockItems.find((s) => s.name.includes('KM小鼠'))?.id || 'st_ani_km'
      const sdStock = data().stockItems.find((s) => s.name.includes('SD大鼠'))?.id || 'st_ani_sd'
      const wtStock = data().stockItems.find((s) => s.name.includes('野生型'))?.id || 'st_ani_wt'
      serviceOptions = [
        {
          id: 'sv_ani_km',
          title: 'KM小鼠（SPF级）',
          spec: 'SPF级，4周龄',
          priceFen: 4500,
          unit: '只',
          stockItemId: kmStock,
          badge: `实时可用 ${availableStockOf(kmStock)} 只`,
          badgeColor: availableStockOf(kmStock) > 0 ? '#059669' : '#dc2626',
        },
        {
          id: 'sv_ani_sd',
          title: 'SD大鼠（SPF级）',
          spec: 'SPF级，6周龄',
          priceFen: 12000,
          unit: '只',
          stockItemId: sdStock,
          badge: `实时可用 ${availableStockOf(sdStock)} 只`,
          badgeColor: availableStockOf(sdStock) > 0 ? '#059669' : '#dc2626',
        },
        {
          id: 'sv_ani_wt',
          title: '教学用野生型小鼠',
          spec: '普通级，5周龄',
          priceFen: 2700,
          unit: '只',
          stockItemId: wtStock,
          badge: `实时可用 ${availableStockOf(wtStock)} 只`,
          badgeColor: availableStockOf(wtStock) > 0 ? '#059669' : '#dc2626',
        },
      ]
    } else if (isBreeding) {
      serviceOptions = [
        {
          id: 'sv_animal_breed',
          title: '小鼠笼位饲养服务',
          spec: '独立通风笼位，含饲料垫料',
          priceFen: 1000,
          unit: '笼·天',
          badge: `${idleCages} 笼空闲`,
          badgeColor: '#7e22ce',
        },
        {
          id: 'sv_animal_breed_hall',
          title: '教学动物寄养（服务大厅审批）',
          spec: '普通环境笼位',
          priceFen: 800,
          unit: '笼·天',
          badge: '随时可入场',
          badgeColor: '#2563eb',
        },
      ]
    } else {
      serviceOptions = [
        {
          id: 'c57',
          title: 'C57BL/6J 小鼠（SPF级）',
          spec: 'SPF级，6~8周龄 · 维通利华直供',
          priceFen: 4800,
          unit: '只',
          supplierId: 'su_ani_1',
          badge: '入围厂商协议直供',
          badgeColor: '#2563eb',
        },
        {
          id: 'nude',
          title: 'BALB/c 裸鼠（NU/NU，5周龄）',
          spec: 'SPF级免疫缺陷 · 斯贝福直供',
          priceFen: 8500,
          unit: '只',
          supplierId: 'su_ani_2',
          badge: '入围厂商协议直供',
          badgeColor: '#2563eb',
        },
      ]
    }

    // 2. 科研项目数据源（精准过滤当前中心及导师授权课题，避免跨中心重名）
    const allProjects = data().projects.filter((p) => p.enabled && p.labId === 'animal')
    const projectOptions = allProjects.map((p) => ({
      id: p.id,
      title: p.name,
      code: p.code,
      owner: p.owner,
    }))
    projectOptions.push({
      id: 'pj_custom',
      title: '基础医学院中药药理课题组预备金',
      code: 'GZMU-2026-MED01',
      owner: '孙志伟教授',
    })

    // 3. 校区数据源（外购）
    const campusOptions = [
      { id: 'campus_1', title: '花溪校区' },
      { id: 'campus_2', title: '甲秀校区' },
    ]

    // 当前选中的选项 ID
    let selectedServiceId = serviceOptions[0].id
    let selectedProjectId = projectOptions[0].id
    let selectedCampusId = campusOptions[0].id

    function curService() {
      return serviceOptions.find((s) => s.id === selectedServiceId) || serviceOptions[0]
    }
    function curProject() {
      return projectOptions.find((p) => p.id === selectedProjectId) || projectOptions[0]
    }
    function curCampus() {
      return campusOptions.find((c) => c.id === selectedCampusId) || campusOptions[0]
    }

    slot.innerHTML = `
      <div class="apply-page">
        <!-- 顶部返回导航 -->
        <div class="apply-nav-bar">
          <div class="apply-nav-back" id="apply-btn-back">
            <span>‹ 返回首页</span>
          </div>
          <div class="apply-nav-right"></div>
        </div>

        <div class="apply-body">
          <!-- 表单主体卡片 -->
          <div class="apply-form-card">
            <!-- 字段 1：品规选择 -->
            <div class="apply-field">
              <label class="apply-label">${isBreeding ? '笼位饲养服务品规 *' : isInternal ? '自产动物品系及规格 *' : '集采动物品系规格 *'}</label>
              <div class="mobile-picker-trigger" id="trigger-service" tabindex="0">
                <span class="mobile-picker-trigger__text" id="trigger-service-text"></span>
                <span class="mobile-picker-trigger__arrow">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"></polyline></svg>
                </span>
              </div>
            </div>

            <!-- 字段 2：数量 / 天数 -->
            ${
              isBreeding
                ? `
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                <div class="apply-field">
                  <label class="apply-label">拟入场日期 *</label>
                  <input type="date" class="apply-input" id="apply-expect-date" value="${addDays(todayStr(), 1)}" min="${todayStr()}" />
                </div>
                <div class="apply-field">
                  <label class="apply-label">拟饲养天数（天） *</label>
                  <input type="number" class="apply-input" id="apply-days" value="14" min="1" max="180" />
                </div>
              </div>

              <div class="apply-field" style="margin-top:2px;">
                <label class="apply-label">拟饲养动物数量（只）</label>
                <input type="number" class="apply-input" id="apply-animal-count" value="20" min="1" max="200" />
              </div>

              <!-- 系统智能测算推荐笼位 -->
              <div class="breeding-calc-card">
                <div class="breeding-calc-row">
                  <span>国标饲养密度：小鼠 ≤ 5只/笼</span>
                  <span class="breeding-calc-badge" id="breeding-calc-badge">推荐 4 笼</span>
                </div>
                <div class="breeding-calc-row" style="margin-top:2px;">
                  <span style="font-weight:600;color:#0f172a;">实际预订笼位（笼）：</span>
                  <div style="display:inline-flex;align-items:center;gap:6px;">
                    <input type="number" class="apply-input" id="apply-quantity" value="4" min="1" max="50" style="width:72px;height:36px;text-align:center;font-weight:700;" />
                    <span style="font-size:12px;color:#64748b;">笼</span>
                  </div>
                </div>
              </div>

              <!-- IACUC 伦理审批编号 -->
              <div class="apply-field" style="margin-top:10px;">
                <label class="apply-label">IACUC 实验动物伦理审批编号</label>
                <input type="text" class="apply-input" id="apply-iacuc" value="GZMU-IACUC-2026-088" placeholder="如：GZMU-IACUC-2026-088" />
              </div>
            `
                : `
              <div class="apply-field">
                <label class="apply-label">
                  <span>申购数量（只）</span>
                  ${isInternal ? '<span class="apply-stock-inline" id="apply-stock-inline"></span>' : ''}
                </label>
                <input type="number" class="apply-input" id="apply-quantity" value="20" min="1" max="100" />
              </div>
            `
            }

            <!-- 字段 3：外购送达校区（仅外购） -->
            ${
              kind === 'external'
                ? `
              <div class="apply-field">
                <label class="apply-label">期望送达校区</label>
                <div class="mobile-picker-trigger" id="trigger-campus" tabindex="0">
                  <span class="mobile-picker-trigger__text" id="trigger-campus-text"></span>
                  <span class="mobile-picker-trigger__arrow">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"></polyline></svg>
                  </span>
                </div>
              </div>
            `
                : ''
            }

            <!-- 字段 4：关联科研项目经费 -->
            <div class="apply-field">
              <label class="apply-label">关联科研项目经费</label>
              <div class="mobile-picker-card" id="trigger-project" tabindex="0">
                <div class="mobile-picker-card__main">
                  <span class="mobile-picker-card__name" id="trigger-project-name"></span>
                  <span class="mobile-picker-card__sub" id="trigger-project-sub"></span>
                </div>
                <div class="mobile-picker-card__action">
                  <span>更换</span>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg>
                </div>
              </div>
            </div>

            <!-- 字段 5：实验用途或课题说明 -->
            <div class="apply-field">
              <label class="apply-label">实验用途或课题说明</label>
              <textarea
                class="apply-textarea"
                id="apply-remark"
                rows="3"
                placeholder="请输入实验用途或课题说明..."
              ></textarea>
            </div>

            <!-- 字段 6：自产动物现货预留与线下交接规则（仅自产动物） -->
            ${
              isInternal
                ? `
              <div style="margin-top:12px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:10px 12px;font-size:11.5px;color:#166534;line-height:1.6;">
                <div style="font-weight:700;display:flex;align-items:center;gap:4px;color:#15803d;margin-bottom:4px;">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                  自产小鼠现货预留与线下交接规则
                </div>
                <div>1. <strong>提交即锁定现货</strong>：系统只要允许提交即代表在库可用，提交瞬间立即预留冻结库存配额，防止被其他课题抢占。</div>
                <div>2. <strong>线下极简报姓名核销</strong>：提交后您只需前往实验动物中心交接窗口，向老师<strong>报学生姓名（张立）</strong>或出示单号，老师点击出库即完成实物交付并划扣课题经费。</div>
              </div>
            `
                : ''
            }

            <!-- 字段 6：外购集采规则说明（仅外购动物） -->
            ${
              kind === 'external'
                ? `
              <div style="margin-top:12px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:10px 12px;font-size:11.5px;color:#1e40af;line-height:1.6;">
                <div style="font-weight:700;display:flex;align-items:center;gap:4px;color:#1d4ed8;margin-bottom:4px;">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                  外购动物集采与交付说明
                </div>
                <div>1. <strong>提交即预冻结经费</strong>：学生提交后系统自动预冻结所选课题项目经费，订单流转为【待发给供应商】。</div>
                <div>2. <strong>汇总报单即办结</strong>：中心老师按供货商定期集中汇总并标记已处理，订单状态变更为【汇总并发送厂商】，系统订单流程即告结束。</div>
                <div>3. <strong>厂商电话联系交接</strong>：供货商到校送达后，直接通过预留电话联系学生办理线下实物交接。</div>
              </div>
            `
                : ''
            }

            <!-- 字段 6：中心饲养管理与扣款须知（仅饲养） -->
            ${
              isBreeding
                ? `
              <div class="breeding-notice-box" style="margin-top:12px;">
                <div class="breeding-notice-title">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                  中心屏障笼位排位与2天保留规则
                </div>
                <div>1. <strong>排位锁定与2天保留</strong>：中心实验师审核排位后将预分配物理笼位；自拟入场日起<strong>最晚保留 2 天</strong>（超期未办理入住系统将自动释放笼位并退回待重排）。</div>
                <div>2. <strong>真实起始日</strong>：动物到校后现场核验办理当天为真实 Day 1，并正式结转划扣基础预付款。</div>
                <div>3. <strong>巡房合笼调整</strong>：因死亡/合笼提前释放的笼位不退款，由中心线下补发等额全价饲料耗材平衡。</div>
              </div>
            `
                : ''
            }
          </div>
        </div>

        <!-- 底部吸底提交栏 -->
        <div class="apply-sticky-bar">
          <div class="apply-total-info">
            <span class="apply-total-label">${isBreeding || kind === 'external' ? '预估冻结总额' : '预估划转总额'}</span>
            <span class="apply-total-price" id="apply-total-price">¥ 0.00</span>
          </div>
          <button class="apply-submit-btn" id="apply-btn-submit">
            <span>${isBreeding ? '提交排位预订申请' : kind === 'external' ? '确认提交并冻结经费' : '确认提交申办'}</span>
            <span style="margin-left:4px;">→</span>
          </button>
        </div>
      </div>
    `

    // 返回首页
    slot.querySelector('#apply-btn-back')?.addEventListener('click', () => {
      currentView = 'home'
      render()
      window.scrollTo(0, 0)
    })

    const remarkArea = slot.querySelector('#apply-remark') as HTMLTextAreaElement

    const qtyInput = slot.querySelector('#apply-quantity') as HTMLInputElement
    const daysInput = slot.querySelector('#apply-days') as HTMLInputElement | null
    const animalCountInput = slot.querySelector('#apply-animal-count') as HTMLInputElement | null
    const calcBadge = slot.querySelector('#breeding-calc-badge') as HTMLElement | null
    const iacucInput = slot.querySelector('#apply-iacuc') as HTMLInputElement | null
    const stockInline = slot.querySelector('#apply-stock-inline') as HTMLElement | null
    const totalPriceEl = slot.querySelector('#apply-total-price') as HTMLElement

    const serviceTriggerText = slot.querySelector('#trigger-service-text') as HTMLElement
    const projectCardName = slot.querySelector('#trigger-project-name') as HTMLElement | null
    const projectCardSub = slot.querySelector('#trigger-project-sub') as HTMLElement | null
    const campusTriggerText = slot.querySelector('#trigger-campus-text') as HTMLElement | null

    // 刷新选择器触发器展示
    function syncTriggerViews(): void {
      const s = curService()
      if (serviceTriggerText) {
        serviceTriggerText.textContent = `${s.title}（${s.spec} · ¥${(s.priceFen / 100).toFixed(2)}/${s.unit}）`
      }
      const p = curProject()
      if (projectCardName) {
        projectCardName.textContent = p.title
      }
      if (projectCardSub) {
        projectCardSub.textContent = `核算编号：${p.code} ｜ 项目负责人：${p.owner}`
      }
      const c = curCampus()
      if (campusTriggerText) {
        campusTriggerText.textContent = c.title
      }
    }

    // 实时计算库存与费用
    function updateStockAndPrice(): void {
      syncTriggerViews()
      const s = curService()
      const price = s.priceFen

      if (isBreeding) {
        const count = parseInt(animalCountInput?.value || '20', 10) || 20
        const rec = Math.ceil(count / 5)
        if (calcBadge) {
          calcBadge.textContent = `推荐 ${rec} 笼`
        }
        const cages = parseInt(qtyInput?.value || String(rec), 10) || rec
        const days = daysInput ? parseInt(daysInput.value || '14', 10) || 14 : 14
        const totalFen = price * cages * days
        totalPriceEl.textContent = moneyText(totalFen)
      } else {
        const qty = parseInt(qtyInput?.value || '1', 10) || 1
        if (stockInline && s.stockItemId) {
          const avail = availableStockOf(s.stockItemId)
          stockInline.textContent = `实时可用：${avail} 只`
          const isOver = qty > avail
          stockInline.classList.toggle('is-insufficient', isOver)
          const submitBtn = slot.querySelector('#apply-btn-submit') as HTMLButtonElement | null
          if (submitBtn && isInternal) {
            submitBtn.style.opacity = isOver ? '0.45' : '1'
            submitBtn.style.pointerEvents = isOver ? 'none' : 'auto'
          }
        }
        const totalFen = price * qty
        totalPriceEl.textContent = moneyText(totalFen)
      }
    }

    // 绑定品规选择抽屉
    const appContainer = stage.querySelector('.mobile-app-container') as HTMLElement
    slot.querySelector('#trigger-service')?.addEventListener('click', () => {
      openMobilePicker(appContainer, {
        title: isInternal ? '选择自产实验动物品系及规格' : isBreeding ? '选择笼位寄养服务规格' : '选择集采动物品系规格',
        subTitle: '贵州省实验动物工程技术中心官方签约标准',
        options: serviceOptions.map((s) => ({
          id: s.id,
          title: `${s.title} - ¥${(s.priceFen / 100).toFixed(2)}/${s.unit}`,
          sub: `规格：${s.spec}`,
          badge: s.badge,
          badgeColor: s.badgeColor,
        })),
        selectedId: selectedServiceId,
        onSelect: (item) => {
          selectedServiceId = item.id
          updateStockAndPrice()
        },
      })
    })

    // 绑定科研项目选择抽屉
    slot.querySelector('#trigger-project')?.addEventListener('click', () => {
      openMobilePicker(appContainer, {
        title: '选择关联科研项目经费',
        subTitle: '从导师已授权的项目经费直接划扣，免垫资与贴票',
        options: projectOptions.map((p) => ({
          id: p.id,
          title: p.title,
          sub: `核算编号：${p.code} ｜ 项目负责人：${p.owner}`,
          badge: p.id === 'pj_ani_1' ? '常用推荐' : undefined,
          badgeColor: '#059669',
        })),
        selectedId: selectedProjectId,
        onSelect: (item) => {
          selectedProjectId = item.id
          syncTriggerViews()
        },
      })
    })

    // 绑定校区选择抽屉（外购）
    slot.querySelector('#trigger-campus')?.addEventListener('click', () => {
      openMobilePicker(appContainer, {
        title: '选择期望送达校区',
        subTitle: '供应商按校区动物中心屏障收货点统一配送',
        options: campusOptions.map((c) => ({
          id: c.id,
          title: c.title,
        })),
        selectedId: selectedCampusId,
        onSelect: (item) => {
          selectedCampusId = item.id
          syncTriggerViews()
        },
      })
    })

    qtyInput?.addEventListener('input', updateStockAndPrice)
    daysInput?.addEventListener('input', updateStockAndPrice)
    animalCountInput?.addEventListener('input', () => {
      const count = parseInt(animalCountInput.value || '20', 10) || 20
      const rec = Math.max(1, Math.ceil(count / 5))
      if (qtyInput) qtyInput.value = String(rec)
      updateStockAndPrice()
    })
    updateStockAndPrice()

    // 确认提交申办
    slot.querySelector('#apply-btn-submit')?.addEventListener('click', () => {
      const s = curService()
      const serviceName = s.title
      const spec = s.spec
      const price = s.priceFen
      const stockItemId = s.stockItemId
      const supplierId = s.supplierId
      const unit = s.unit
      const isBreeding = kind === 'breeding'
      const expectDateInput = slot.querySelector('#apply-expect-date') as HTMLInputElement | null
      const expectStartDate = isBreeding ? (expectDateInput?.value || addDays(todayStr(), 1)) : undefined
      const animalCount = isBreeding ? (parseInt(animalCountInput?.value || '20', 10) || 20) : undefined
      const recCages = isBreeding ? Math.max(1, Math.ceil((animalCount || 20) / 5)) : undefined
      const qty = parseInt(qtyInput.value || (isBreeding ? String(recCages) : '10'), 10)
      const feedDays = isBreeding && daysInput ? (parseInt(daysInput.value || '14', 10) || 14) : undefined
      const expectEndDate = isBreeding && expectStartDate && feedDays ? addDays(expectStartDate, feedDays) : undefined
      const iacucNo = isBreeding ? (iacucInput?.value?.trim() || 'GZMU-IACUC-2026-088') : undefined
      const totalFen = isBreeding ? price * qty * (feedDays || 14) : price * qty
      const projectId = selectedProjectId
      const remark = remarkArea?.value || (isBreeding ? 'SPF屏障笼位饲养及实验观测' : '科研实验用途')

      if (kind === 'internal' && stockItemId) {
        const avail = availableStockOf(stockItemId)
        if (qty > avail) {
          toast(`申购数量（${qty} 只）已超过当前可用现货（仅剩 ${avail} 只）`, 'error')
          return
        }
      }

      const newOrder: Order = {
        id: uid('ord'),
        labId: 'animal',
        code: `AD-ORD-${String(data().orders.length + 1).padStart(4, '0')}`,
        kind,
        serviceId: s.id,
        serviceName,
        itemName: serviceName.split('（')[0],
        spec,
        unit,
        quantity: qty,
        unitPriceFen: price,
        auditMode: 'system',
        auditStatus: isBreeding ? 'pending' : 'approved',
        fulfillStatus: kind === 'internal' ? 'pending_out' : KIND_INITIAL_FULFILL[kind],
        source: 'user',
        stockItemId,
        supplierId: kind === 'external' ? supplierId : undefined,
        applicantName: '张立（基础医学院）',
        applicantOrg: '基础医学院中药药理课题组',
        projectId,
        remark,
        animalCount,
        feedDays,
        expectStartDate,
        expectEndDate,
        recommendedCages: recCages,
        reserveStatus: isBreeding ? 'none' : undefined,
        iacucNo,
        preFreezeAmountFen: totalFen,
        feeStatus: isBreeding || kind === 'external' ? 'frozen' : undefined,
        createdAt: todayStr(),
        updatedAt: todayStr(),
        history: [
          {
            at: todayStr(),
            actor: '张立（研究生）',
            action: isBreeding
              ? '通过移动端提交笼位排位预订'
              : kind === 'internal'
                ? '提交自产小鼠申购并锁定现货'
                : '提交外购集采申办（预冻结项目经费）',
            note: isBreeding
              ? `拟入场：${expectStartDate}，拟养 ${feedDays} 天；拟养 ${animalCount} 只动物（推荐 ${recCages} 笼，实际预订 ${qty} 笼），已预冻结项目经费 ¥${(totalFen / 100).toFixed(2)}`
              : kind === 'internal'
                ? `已成功锁定现货 ${qty} 只（实时冻结库存配额），请持学生姓名【张立】至中心交接窗口核销出库领走`
                : `申请集采 ${qty} ${unit}，已预冻结课题项目经费 ¥${(totalFen / 100).toFixed(2)}，待中心老师汇总后统一发送供货商`,
          },
        ],
      }

      currentView = 'orders'
      orderFilter = 'all'
      expandedOrderIds.add(newOrder.id)

      updateData((d) => ({ ...d, orders: [...d.orders, newOrder] }))
      notify()
      toast(
        isBreeding
          ? `排位预订已提交！拟入场：${expectStartDate}，已预冻结经费 ¥${(totalFen / 100).toFixed(2)}，待中心实验师审核排位`
          : kind === 'internal'
            ? `申购成功！已为您锁定 ${qty} 只现货，请持姓名【张立】前往中心窗口核销出库`
            : `外购集采已提交！已预冻结经费 ¥${(totalFen / 100).toFixed(2)}，状态已进入【待发给供应商】`,
        'success',
      )
      window.scrollTo(0, 0)
    })
  }

  /* ==========================================================================
     页面 3：【我的订单】（状态过滤条 + 订单卡片列表 + 展开时间轴）
     ========================================================================== */
  function renderOrdersPage(slot: HTMLElement): void {
    const allOrders = data().orders.slice().reverse()
    const processingOrders = allOrders.filter(isOrderProcessing)
    const completedOrders = allOrders.filter(isOrderCompleted)

    const filteredOrders = allOrders.filter((o) => {
      if (orderFilter === 'processing') return isOrderProcessing(o)
      if (orderFilter === 'completed') return isOrderCompleted(o)
      return true
    })

    slot.innerHTML = `
      <div class="orders-page">
        <div class="orders-page__header">
          <h2 class="orders-page__title">我的办件订单</h2>
          <span style="font-size:12px;color:#2563eb;cursor:pointer;font-weight:600;" id="orders-refresh-btn">刷新 ↻</span>
        </div>

        <!-- 订单状态过滤条：三大核心分类 -->
        <div class="orders-filter-bar">
          <div class="orders-filter-chip ${orderFilter === 'all' ? 'is-active' : ''}" data-filter="all">全部 (${allOrders.length})</div>
          <div class="orders-filter-chip ${orderFilter === 'processing' ? 'is-active' : ''}" data-filter="processing">进行中 (${processingOrders.length})</div>
          <div class="orders-filter-chip ${orderFilter === 'completed' ? 'is-active' : ''}" data-filter="completed">已完成 (${completedOrders.length})</div>
        </div>

        <!-- 订单卡片列表 -->
        <div class="orders-list" id="orders-list-body"></div>
      </div>
    `

    slot.querySelector('#orders-refresh-btn')?.addEventListener('click', () => {
      render()
      toast('订单状态已与中心管理端实时对齐', 'success')
    })

    slot.querySelectorAll('.orders-filter-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        const f = chip.getAttribute('data-filter') as any
        if (f) {
          orderFilter = f
          renderOrdersPage(slot)
        }
      })
    })

    const listBody = slot.querySelector('#orders-list-body') as HTMLElement

    if (filteredOrders.length === 0) {
      listBody.innerHTML = `
        <div style="text-align:center;padding:50px 0;color:#94a3b8;font-size:13px;">
          暂无该状态下的订单记录
        </div>
      `
      return
    }

    filteredOrders.forEach((o) => {
      const isExpanded = expandedOrderIds.has(o.id)
      const feeding = data().feedings.find((f) => f.orderId === o.id)
      const occupiedCages = feeding
        ? data().cages.filter((c) => feeding.cageIds.includes(c.id)).map((c) => c.code)
        : []

      let statusBadgeClass = 'order-status-pill--done'
      let statusText = '已完成'
      let statusHint = '已整单出库交付'

      if (o.kind === 'breeding') {
        if (o.auditStatus === 'pending') {
          statusBadgeClass = 'order-status-pill--pending'
          statusText = '待中心排位'
          const preFreezeYuan = (
            (o.preFreezeAmountFen || o.unitPriceFen * o.quantity * (o.feedDays || 14)) /
            100
          ).toFixed(2)
          statusHint = `已预冻结经费 ¥${preFreezeYuan} ｜ 待实验师李建国审核排位`
        } else if (o.fulfillStatus === 'incoming') {
          statusBadgeClass = 'order-status-pill--processing'
          statusText = '已同意·待入场'
          statusHint = '中心排位已通过 ｜ 动物到校后请前往屏障交接区办理现场核验入笼'
        } else if (o.fulfillStatus === 'breeding') {
          statusBadgeClass = 'order-status-pill--done'
          statusText = '在养中'
          statusHint = `物理笼位已分配：${occupiedCages.join('、') || '分配中'}（共 ${feeding ? feeding.cageIds.length : o.quantity} 笼）`
        } else if (o.fulfillStatus === 'exited') {
          statusBadgeClass = 'order-status-pill--done'
          statusText = '已退场'
          statusHint = '已完成实验退场，物理笼位已释放归档'
        }
      } else if (o.kind === 'internal') {
        if (o.auditStatus === 'pending') {
          statusBadgeClass = 'order-status-pill--pending'
          statusText = '待确认'
          statusHint = '已锁定现货配额 · 待中心确认'
        } else if (o.fulfillStatus === 'pending_out') {
          statusBadgeClass = 'order-status-pill--processing'
          statusText = '待现场领取'
          statusHint = '已锁定现货 · 请凭申请人姓名至中心窗口出库领走'
        } else if (o.fulfillStatus === 'completed') {
          statusBadgeClass = 'order-status-pill--done'
          statusText = '已出库交接'
          statusHint = '已于中心交接窗口完成核销出库交付'
        } else {
          statusBadgeClass = 'order-status-pill--done'
          statusText = '已办结'
          statusHint = '订单已办结归档'
        }
      } else {
        if (o.auditStatus === 'pending' || o.fulfillStatus === 'pending_collect' || o.fulfillStatus === 'pending_send') {
          statusBadgeClass = 'order-status-pill--processing'
          statusText = '待发给供应商'
          statusHint = '已预冻结课题项目经费 · 待中心老师汇总统一发给供货商'
        } else if (o.fulfillStatus === 'sent') {
          statusBadgeClass = 'order-status-pill--done'
          statusText = '汇总并发送厂商'
          statusHint = '中心已汇总报单发往厂商 · 厂商送达后电话联系交接 · 订单已结束'
        } else {
          statusBadgeClass = 'order-status-pill--done'
          statusText = '已办结'
          statusHint = '订单已办结归档'
        }
      }

      const isApproved =
        o.auditStatus === 'approved' ||
        o.fulfillStatus === 'completed' ||
        o.fulfillStatus === 'sent' ||
        o.fulfillStatus === 'breeding'
      const isFulfilled =
        o.fulfillStatus === 'completed' ||
        o.fulfillStatus === 'sent' ||
        o.fulfillStatus === 'breeding' ||
        o.fulfillStatus === 'exited'

      const card = el('div', 'order-item-card')
      card.innerHTML = `
        <div class="order-item-card__head">
          <span class="order-item-card__code">${o.code}</span>
          <span class="order-status-pill ${statusBadgeClass}">${statusText}</span>
        </div>

        <div class="order-item-card__body">
          <h4 class="order-item-card__title">${o.serviceName}</h4>
          ${
            o.kind === 'breeding'
              ? `
            <div class="order-item-card__meta">
              预订规模：拟养 <strong>${o.animalCount || 20} 只</strong> ➔ 预订 <strong>${o.quantity} 笼</strong> · 拟养 <strong>${o.feedDays || 14} 天</strong>
            </div>
            <div class="order-item-card__meta">IACUC 伦理：${escapeHtml(o.iacucNo || 'GZMU-IACUC-2026-088')}</div>
            <div class="order-item-card__meta">
              课题经费：${o.projectId ? '已关联科研项目直接划转' : '基础医学院中药药理课题组'}
              <span style="font-size:11px;color:${o.feeStatus === 'charged' ? '#059669' : '#d97706'};font-weight:600;margin-left:4px;">
                (${o.feeStatus === 'charged' ? '基础预付已正式划扣·不退' : '经费已预冻结'})
              </span>
            </div>
            ${
              o.fulfillStatus === 'breeding' && feeding
                ? `
              <div style="margin-top:6px;padding:8px 10px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;font-size:11.5px;">
                <div style="color:#0f172a;font-weight:700;">🏠 屏障现场在养信息：</div>
                <div style="margin-top:2px;color:#475569;">
                  入场办理日：<strong>${feeding.entryAt || o.createdAt}</strong>（真实起始日） ｜ 预订天数：${o.feedDays || 14} 天
                </div>
                <div style="margin-top:2px;color:#7e22ce;font-weight:600;">
                  分配物理笼位：${occupiedCages.map((c) => `<span class="breeding-cage-tag">${c}</span>`).join('') || '已就绪'}
                </div>
              </div>
              ${
                feeding.changeLogs && feeding.changeLogs.length > 0
                  ? `
                <div class="breeding-change-notice">
                  <div class="breeding-change-title">🔔 笼位变更通知流水（${feeding.changeLogs.length}次）</div>
                  ${feeding.changeLogs
                    .map(
                      (log) => `
                    <div class="breeding-change-item">
                      <div style="font-weight:700;">${log.at} · ${log.action}</div>
                      <div>变动明细：在养笼数 ${log.beforeCages} ➔ ${log.afterCages} 笼 ｜ 原因：${escapeHtml(log.note)}</div>
                      <div class="change-hint">💡 费用说明：期初基础费用不退，提前合笼释放笼位由中心线下补发等额饲料耗材平衡</div>
                    </div>
                  `,
                    )
                    .join('')}
                </div>
              `
                  : ''
              }
            `
                : ''
            }
            <div class="order-item-card__meta" style="color:#059669;font-weight:600;margin-top:4px;">状态说明：${statusHint}</div>
          `
              : `
            <div class="order-item-card__meta">品规数量：${o.spec} × <strong>${o.quantity} ${o.unit}</strong></div>
            <div class="order-item-card__meta">
              课题经费：${o.projectId ? '已关联科研项目直接划转' : '基础医学院中药药理课题组'}
              ${
                o.kind === 'external'
                  ? `<span style="font-size:11px;color:${o.feeStatus === 'charged' ? '#059669' : '#d97706'};font-weight:600;margin-left:4px;">(${o.feeStatus === 'charged' ? '预冻结已划扣结转' : '经费已预冻结'})</span>`
                  : ''
              }
            </div>
            ${
              o.kind === 'internal' && o.fulfillStatus === 'pending_out'
                ? `
              <div style="margin-top:8px;padding:8px 10px;background:#f0fdf4;border-radius:8px;border:1px solid #bbf7d0;font-size:11.5px;color:#166534;line-height:1.5;">
                <div style="font-weight:700;display:flex;align-items:center;gap:4px;">
                  <span>📍 现场提货核销指引</span>
                </div>
                <div style="margin-top:2px;">现货已为您成功锁定 <strong>${o.quantity} ${o.unit}</strong>！</div>
                <div style="margin-top:2px;">请凭申请人姓名【<strong>${escapeHtml(o.applicantName || '张立')}</strong>】或单号【<strong>${o.code}</strong>】前往实验动物中心交接窗口办理出库领走。</div>
              </div>
            `
                : o.kind === 'internal' && o.fulfillStatus === 'completed'
                  ? `
              <div style="margin-top:8px;padding:8px 10px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;font-size:11.5px;color:#475569;line-height:1.5;">
                <div style="font-weight:700;color:#059669;">✅ 已完成线下核销出库交付</div>
                <div style="margin-top:2px;">申请人报姓名现场核验无误，实物库存已扣减，课题经费已正式结转划扣。</div>
              </div>
            `
                : o.kind === 'external' && (o.fulfillStatus === 'pending_collect' || o.fulfillStatus === 'pending_send' || o.auditStatus === 'pending')
                  ? `
              <div style="margin-top:8px;padding:8px 10px;background:#fefce8;border-radius:8px;border:1px solid #fef08a;font-size:11.5px;color:#854d0e;line-height:1.5;">
                <div style="font-weight:700;display:flex;align-items:center;gap:4px;">
                  <span>⏰ 待发给供应商（经费已冻结）</span>
                </div>
                <div style="margin-top:2px;">课题项目经费已预先冻结（<strong>¥${((o.preFreezeAmountFen ?? o.quantity * o.unitPriceFen) / 100).toFixed(2)}</strong>）。中心老师将集中汇总后统一发送供货商。</div>
              </div>
            `
                : o.kind === 'external' && o.fulfillStatus === 'sent'
                  ? `
              <div style="margin-top:8px;padding:8px 10px;background:#f0fdf4;border-radius:8px;border:1px solid #bbf7d0;font-size:11.5px;color:#166534;line-height:1.5;">
                <div style="font-weight:700;display:flex;align-items:center;gap:4px;color:#15803d;">
                  <span>✅ 汇总并发送厂商（订单已结束）</span>
                </div>
                <div style="margin-top:2px;">中心老师已完成外购需求汇总并正式发往厂商排产发货，预冻结项目经费已结转，订单业务流转已结束。</div>
                <div style="margin-top:2px;font-weight:600;color:#166534;">供货商到校送达后，将直接电话联系学生线下交接取货。</div>
              </div>
            `
                  : ''
            }
            <div class="order-item-card__meta" style="color:#059669;font-weight:600;margin-top:4px;">状态说明：${statusHint}</div>
          `
          }
        </div>

        <div class="order-item-card__foot">
          <span>申请时间：${o.createdAt}</span>
          <span style="color:#2563eb;font-weight:600;">${isExpanded ? '收起流转 ▲' : '审批流转 ▼'}</span>
        </div>

        ${
          isExpanded
            ? `
          <div class="order-timeline-box">
            <div class="timeline-step is-done">
              <div class="timeline-step__dot"></div>
              <div>
                <div class="timeline-step__title">${
                  o.kind === 'breeding'
                    ? '学生提交排位预订'
                    : o.kind === 'internal'
                      ? '学生在线申购（现货锁库）'
                      : '学生在线填报（经费预冻结）'
                }</div>
                <div class="timeline-step__desc">${o.createdAt} · 手机端在线提交 · ${
                  o.kind === 'breeding'
                    ? `拟养 ${o.animalCount || 20} 只/预订 ${o.quantity} 笼/${o.feedDays || 14} 天 · 预冻结项目经费`
                    : o.kind === 'internal'
                      ? `已成功锁定现货 ${o.quantity} 只 · 实时冻结库存配额`
                      : `申请集采 ${o.quantity} ${o.unit} · 预冻结项目经费 ¥${((o.preFreezeAmountFen ?? o.quantity * o.unitPriceFen) / 100).toFixed(2)}`
                }</div>
              </div>
            </div>
            <div class="timeline-step ${isApproved ? 'is-done' : 'is-current'}">
              <div class="timeline-step__dot"></div>
              <div>
                <div class="timeline-step__title">${
                  o.kind === 'internal'
                    ? (o.fulfillStatus === 'completed'
                      ? '中心窗口核销（报姓名出库）'
                      : '待持学生姓名至中心现场交接')
                    : o.kind === 'external'
                      ? (isApproved ? '中心老师需求审核汇总' : '中心实验师审核中')
                      : isApproved
                        ? '中心实验师审核排位通过（预分配锁定）'
                        : (o.reserveStatus === 'expired_released' ? '超期2天未到校·预留笼位已释放' : '中心实验师排位审核中')
                }</div>
                <div class="timeline-step__desc">${
                  o.kind === 'internal'
                    ? (o.fulfillStatus === 'completed'
                      ? `申请人【${escapeHtml(o.applicantName || '张立')}】现场核对提货完成`
                      : `请凭申请人姓名【${escapeHtml(o.applicantName || '张立')}】或单号至中心窗口出库`)
                    : o.kind === 'external'
                      ? (isApproved
                        ? '核准实验品系与经费预算，已纳入供货商外购汇总清单'
                        : '中心老师正在核验课题组经费与动物品系')
                      : isApproved
                        ? `已预分配锁定物理笼位：${o.allocatedCageIds?.length ? o.allocatedCageIds.join('、') : '已指定'} · 拟入场：${o.expectStartDate || '—'} · 最晚保留至 ${o.reserveExpireAt || '—'}`
                        : (o.reserveStatus === 'expired_released'
                          ? '⚠️ 该预约已超过最晚保留期限，系统已自动释放锁定的物理笼位，等待实验师与您联系重新排位'
                          : '屏障房排位空间与伦理审查中')
                }</div>
              </div>
            </div>
            ${
              isApproved && o.kind === 'breeding' && o.fulfillStatus === 'incoming' && o.reserveExpireAt
                ? `
              <div style="background:#fefce8;border:1px solid #fef08a;border-radius:6px;padding:8px 10px;margin:8px 0;font-size:12px;color:#854d0e;line-height:1.5;">
                <div style="font-weight:700;display:flex;align-items:center;gap:4px;margin-bottom:2px;">
                  <span>⏰ 2天保留到期提醒</span>
                </div>
                <div>已为您预分配并锁定物理笼位 <strong>${o.allocatedCageIds?.join('、') || '—'}</strong>。</div>
                <div>请于 <strong>${o.expectStartDate || '—'} ~ ${o.reserveExpireAt}</strong> 持动物检疫合格证前往屏障交接区办理入住（最晚保留至 ${o.reserveExpireAt} 23:59，逾期系统将自动释放重排）。</div>
              </div>
            `
                : ''
            }
            <div class="timeline-step ${isFulfilled ? 'is-done' : ''}">
              <div class="timeline-step__dot"></div>
              <div>
                <div class="timeline-step__title">
                  ${
                    o.kind === 'internal'
                      ? (isFulfilled ? '管理员出库交付完成（经费已结转）' : '等待现场提货完成交付')
                      : o.kind === 'external'
                        ? (o.fulfillStatus === 'sent' ? '【汇总并发送厂商】（订单已结束）' : '等待汇总发送厂商')
                        : (isFulfilled ? '屏障现场核验入笼办理完成' : '等待动物到校现场核验入住')
                  }
                </div>
                <div class="timeline-step__desc">${
                  isFulfilled
                    ? (o.kind === 'breeding'
                      ? `现场正式划扣基础费用，分配物理笼位 ${occupiedCages.join('、') || ''}（计为真实 Day 1）`
                      : o.kind === 'internal'
                        ? '实物库存物理扣减完成，课题经费已正式结转划扣'
                        : '中心老师已向协议供货商统一报单，经费已正式结转，厂商到校后电话联系学生交付取货，订单已结束')
                    : (o.kind === 'breeding'
                      ? '动物到校后请前往屏障交接区办理现场核验入笼'
                      : o.kind === 'internal'
                        ? '中心管理员核验姓名后一键办理出库并划转经费'
                        : '等待中心老师定期集中汇总并标记发送入围厂商')
                }</div>
              </div>
            </div>
            ${
              o.kind === 'breeding' && (o.fulfillStatus === 'breeding' || o.fulfillStatus === 'exited')
                ? `
              <div class="timeline-step ${o.fulfillStatus === 'exited' ? 'is-done' : 'is-current'}">
                <div class="timeline-step__dot"></div>
                <div>
                  <div class="timeline-step__title">在养巡房管护及动态调笼</div>
                  <div class="timeline-step__desc">${feeding?.changeLogs?.length ? `管理员已记录 ${feeding.changeLogs.length} 次调笼变更流水` : '日常屏障巡房管护中，合笼释放笼位线下补发耗材'}</div>
                </div>
              </div>
            `
                : ''
            }
          </div>
        `
            : ''
        }
      `

      card.addEventListener('click', () => {
        if (expandedOrderIds.has(o.id)) {
          expandedOrderIds.delete(o.id)
        } else {
          expandedOrderIds.add(o.id)
        }
        renderOrdersPage(slot)
      })

      listBody.appendChild(card)
    })
  }

  render()
  host.appendChild(stage)
}

/* ==========================================================================
   移动端专属底部抽屉选择器组件 (Mobile Bottom Sheet Picker)
   ========================================================================== */
interface MobilePickerOptionItem {
  id: string
  title: string
  sub?: string
  badge?: string
  badgeColor?: string
}

interface MobilePickerOptions {
  title: string
  subTitle?: string
  options: MobilePickerOptionItem[]
  selectedId: string
  onSelect: (item: MobilePickerOptionItem) => void
}

function openMobilePicker(container: HTMLElement, opts: MobilePickerOptions): void {
  // 清理已有弹层
  container.querySelectorAll('.mobile-picker-mask, .mobile-picker-sheet').forEach((el) => el.remove())

  const mask = el('div', 'mobile-picker-mask')
  const sheet = el('div', 'mobile-picker-sheet')

  sheet.innerHTML = `
    <div class="mobile-picker-handle-bar">
      <div class="mobile-picker-handle"></div>
    </div>
    <div class="mobile-picker-header">
      <div>
        <h3 class="mobile-picker-title">${opts.title}</h3>
        ${opts.subTitle ? `<div style="font-size:11px;color:#64748b;margin-top:2px;">${opts.subTitle}</div>` : ''}
      </div>
      <button class="mobile-picker-close" aria-label="关闭">✕</button>
    </div>
    <div class="mobile-picker-list">
      ${opts.options
        .map(
          (o) => `
        <div class="mobile-picker-item ${o.id === opts.selectedId ? 'is-selected' : ''}" data-id="${o.id}">
          <div class="mobile-picker-item__main">
            <div style="display:flex;align-items:center;gap:6px;">
              <span class="mobile-picker-item__label">${o.title}</span>
              ${
                o.badge
                  ? `<span style="font-size:11px;padding:1px 6px;border-radius:4px;background:${
                      o.badgeColor ? `${o.badgeColor}15` : '#f1f5f9'
                    };color:${o.badgeColor || '#475569'};font-weight:600;border:1px solid ${
                      o.badgeColor ? `${o.badgeColor}35` : '#e2e8f0'
                    };">${o.badge}</span>`
                  : ''
              }
            </div>
            ${o.sub ? `<div class="mobile-picker-item__desc">${o.sub}</div>` : ''}
          </div>
          <div class="mobile-picker-item__check">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
        </div>
      `,
        )
        .join('')}
    </div>
  `

  container.appendChild(mask)
  container.appendChild(sheet)

  requestAnimationFrame(() => {
    mask.classList.add('is-open')
    sheet.classList.add('is-open')
  })

  function close(): void {
    mask.classList.remove('is-open')
    sheet.classList.remove('is-open')
    setTimeout(() => {
      mask.remove()
      sheet.remove()
    }, 280)
  }

  mask.addEventListener('click', close)
  sheet.querySelector('.mobile-picker-close')?.addEventListener('click', close)

  sheet.querySelectorAll('.mobile-picker-item').forEach((itemEl) => {
    itemEl.addEventListener('click', () => {
      const id = itemEl.getAttribute('data-id')
      const target = opts.options.find((o) => o.id === id)
      if (target) {
        opts.onSelect(target)
      }
      close()
    })
  })
}

