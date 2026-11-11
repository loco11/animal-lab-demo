/**
 * 实验动物中心 · 学生移动端
 * 页面架构：
 *   1. 首页 (Home) - 个人信息卡、统计四宫格、极简服务卡片
 *   2. 独立申办页 (Apply Page) - 全屏独立表单、实时库存联动、多科研项目下拉、多行文本域、吸底结算栏
 *   3. 我的订单 (Orders) - 状态过滤条、条目化订单卡片、三段式审批时间轴展开
 */

import { data, updateData } from '../core/data'
import { KIND_INITIAL_FULFILL } from '../core/labels'
import { notify } from '../core/store'
import { moneyText, todayStr, uid } from '../core/utils'
import type { Order, OrderKind } from '../types'
import { el, toast } from '../ui'

// 现代矢量线性图标
const ICON_HOME = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`
const ICON_ORDER = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`
const ICON_USER = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`

export function mobilePage(host: HTMLElement): void {
  // 当前视图：'home' (首页) | 'orders' (我的订单) | 'apply' (独立服务申办页)
  let currentView: 'home' | 'orders' | 'apply' = 'home'
  // 当前申办的服务类型
  let currentApplyKind: OrderKind = 'internal'
  // 订单筛选过滤
  let orderFilter: 'all' | 'pending' | 'processing' | 'breeding' | 'completed' = 'all'
  // 记录展开详情的订单 ID
  const expandedOrderIds = new Set<string>()

  const stage = el('div', 'mobile-view-stage')

  function render(): void {
    const orders = data().orders
    const pendingCount = orders.filter((o) => o.auditStatus === 'pending').length
    const processingCount = orders.filter((o) => o.fulfillStatus === 'pending_out' || o.fulfillStatus === 'sent').length
    const breedingCount = orders.filter((o) => o.fulfillStatus === 'breeding').length

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
                ${pendingCount > 0 ? `<span class="tab-badge-num">${pendingCount}</span>` : ''}
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
      renderHomePage(bodySlot, { total: orders.length, pending: pendingCount, processing: processingCount, breeding: breedingCount })
    } else if (currentView === 'orders') {
      renderOrdersPage(bodySlot)
    } else {
      renderApplyPage(bodySlot, currentApplyKind)
    }
  }

  /* ==========================================================================
     页面 1：【首页】（个人信息头 + 统计四宫格 + 极简服务卡片）
     ========================================================================== */
  function renderHomePage(
    slot: HTMLElement,
    stats: { total: number; pending: number; processing: number; breeding: number }
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
        <!-- 统计四宫格：一行四格，文字在上、数字在下 -->
        <section class="stats-grid">
          <div class="stat-card" data-jump="all">
            <span class="stat-card__label">我的订单</span>
            <span class="stat-card__num">${stats.total}</span>
          </div>
          <div class="stat-card" data-jump="pending">
            <span class="stat-card__label">审核中</span>
            <span class="stat-card__num">${stats.pending}</span>
          </div>
          <div class="stat-card" data-jump="processing">
            <span class="stat-card__label">进行中</span>
            <span class="stat-card__num">${stats.processing}</span>
          </div>
          <div class="stat-card" data-jump="breeding">
            <span class="stat-card__label">在养中</span>
            <span class="stat-card__num">${stats.breeding}</span>
          </div>
        </section>

        <!-- 服务入口卡片区（极简版：展示服务类型、包含服务名称、所属中心/学院名称） -->
        <section class="service-section">
          <div class="section-header">
            <div class="section-title">
              <span>在架服务申办</span>
            </div>
          </div>

          <!-- 卡片 1：自产动物 -->
          <div class="service-clean-card" id="card-apply-internal">
            <div class="service-clean-card__head">
              <span class="service-clean-kind-badge badge-kind-internal">自产动物</span>
              <div class="service-clean-center">
                <span class="service-clean-center__dot" style="background:#16a34a;"></span>
                基础医学院
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
                药学院
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
                公共卫生学院
              </div>
            </div>
            <div class="service-clean-card__body">
              <h3 class="service-clean-title">屏障笼位饲养及托管</h3>
              <div class="service-item-chips">
                <span class="service-item-chip"><strong>小鼠笼位饲养</strong>（SPF屏障独立通风IVC）</span>
                <span class="service-item-chip"><strong>教学动物普通寄养</strong>（普通环境笼位）</span>
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
    const pageTitle = isInternal ? '校内自产实验动物申购' : isBreeding ? '屏障笼位饲养及托管预约' : '外购特种实验动物申购'

    // 获取底层实时数据
    const stockItems = data().stockItems
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
      serviceOptions = [
        {
          id: 'km',
          title: 'KM小鼠（SPF级）',
          spec: 'SPF级，4周龄',
          priceFen: 4500,
          unit: '只',
          stockItemId: 'st_ani_km',
          badge: '在库 120 只',
          badgeColor: '#059669',
        },
        {
          id: 'sd',
          title: 'SD大鼠（SPF级）',
          spec: 'SPF级，6周龄',
          priceFen: 12000,
          unit: '只',
          stockItemId: 'st_ani_sd',
          badge: '在库 20 只',
          badgeColor: '#059669',
        },
        {
          id: 'wt',
          title: '教学用野生型小鼠',
          spec: '普通级，5周龄',
          priceFen: 2700,
          unit: '只',
          stockItemId: 'st_ani_wt',
          badge: '在库 60 只',
          badgeColor: '#059669',
        },
      ]
    } else if (isBreeding) {
      serviceOptions = [
        {
          id: 'cage-spf',
          title: 'SPF级独立通风笼位（IVC）',
          spec: 'SPF独立屏障，含全价垫料与饲料',
          priceFen: 1000,
          unit: '笼·天',
          badge: `${idleCages} 笼空闲`,
          badgeColor: '#7e22ce',
        },
        {
          id: 'cage-normal',
          title: '教学动物普通寄养',
          spec: '普通环境笼位，按日计费',
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
      { id: 'campus_1', title: '贵医大云漫湖校区实验动物中心', desc: 'SPF屏障实验楼（新校区）' },
      { id: 'campus_2', title: '贵医大北京路校区实验动物中心', desc: '老校区动物楼实验区' },
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
          <h2 class="apply-nav-title">${pageTitle}</h2>
          <div class="apply-nav-right"></div>
        </div>

        <div class="apply-body">
          <!-- 实时库存与资源状态卡 -->
          <div class="apply-stock-box" id="apply-stock-display">
            <div class="apply-stock-box__left">
              <span class="apply-stock-dot"></span>
              <span class="apply-stock-text" id="apply-stock-title">当前中心实时在库可用</span>
            </div>
            <div class="apply-stock-num" id="apply-stock-val">--</div>
          </div>

          <!-- 表单主体卡片 -->
          <div class="apply-form-card">
            <!-- 字段 1：品规选择（移动端专属底部抽屉选择器） -->
            <div class="apply-field">
              <label class="apply-label">
                <span>实验动物品系及规格</span>
                <span class="apply-label-hint">贵州省实验动物工程技术中心</span>
              </label>
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
                  <label class="apply-label">预约笼位数（笼）</label>
                  <input type="number" class="apply-input" id="apply-quantity" value="2" min="1" max="20" />
                </div>
                <div class="apply-field">
                  <label class="apply-label">预估天数（天）</label>
                  <input type="number" class="apply-input" id="apply-days" value="14" min="1" max="90" />
                </div>
              </div>
            `
                : `
              <div class="apply-field">
                <label class="apply-label">
                  <span>申购数量（只）</span>
                  <span class="apply-label-hint">中心核验配发</span>
                </label>
                <input type="number" class="apply-input" id="apply-quantity" value="20" min="1" max="100" />
              </div>
            `
            }

            <!-- 字段 3：外购送达校区（移动端专属底部抽屉选择器，仅外购） -->
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

            <!-- 字段 4：关联科研项目经费（移动端专属底部抽屉选择器） -->
            <div class="apply-field">
              <label class="apply-label">
                <span>关联科研项目经费（支持点击选择）</span>
                <span class="apply-label-hint" style="color:#059669;">导师孙志伟授权</span>
              </label>
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
              <span style="font-size:11px;color:#64748b;margin-top:2px;">
                * 审核办结后将由学校统一结算系统从所选科研项目直接划扣，师生无需个人垫资与贴票报销。
              </span>
            </div>

            <!-- 字段 5：实验说明（多行文本域 textarea） -->
            <div class="apply-field">
              <label class="apply-label">
                <span>实验用途或课题说明（多行文本）</span>
                <span class="apply-label-hint">IACUC 伦理审核依据</span>
              </label>
              <textarea
                class="apply-textarea"
                id="apply-remark"
                rows="3"
                placeholder="请输入详细实验用途（如：贵州特有中草药抗肿瘤分子机制体内药效评价，已通过 IACUC 动物伦理审查）。"
              >用于中草药活性分子抗肿瘤药效体内模型实验，已取得伦理审查批件</textarea>
              <div class="apply-quick-tags">
                <span class="apply-quick-tag" data-tag="抗肿瘤药效评价">＋ 抗肿瘤药效</span>
                <span class="apply-quick-tag" data-tag="药代动力学分析">＋ 药代动力学</span>
                <span class="apply-quick-tag" data-tag="免疫缺陷对照模型">＋ 免疫对照</span>
                <span class="apply-quick-tag" data-tag="教学实验验证">＋ 教学实验</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 底部吸底提交栏 -->
        <div class="apply-sticky-bar">
          <div class="apply-total-info">
            <span class="apply-total-label">预估划转总额</span>
            <span class="apply-total-price" id="apply-total-price">¥ 0.00</span>
          </div>
          <button class="apply-submit-btn" id="apply-btn-submit">
            <span>确认提交申办</span>
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

    // 快捷标签填词
    const remarkArea = slot.querySelector('#apply-remark') as HTMLTextAreaElement
    slot.querySelectorAll('.apply-quick-tag').forEach((tag) => {
      tag.addEventListener('click', () => {
        const text = tag.getAttribute('data-tag') || ''
        if (remarkArea && text) {
          remarkArea.value = remarkArea.value ? `${remarkArea.value}；${text}` : text
        }
      })
    })

    const qtyInput = slot.querySelector('#apply-quantity') as HTMLInputElement
    const daysInput = slot.querySelector('#apply-days') as HTMLInputElement | null
    const stockTitle = slot.querySelector('#apply-stock-title') as HTMLElement
    const stockVal = slot.querySelector('#apply-stock-val') as HTMLElement
    const totalPriceEl = slot.querySelector('#apply-total-price') as HTMLElement

    const serviceTriggerText = slot.querySelector('#trigger-service-text') as HTMLElement
    const projectCardName = slot.querySelector('#trigger-project-name') as HTMLElement | null
    const projectCardSub = slot.querySelector('#trigger-project-sub') as HTMLElement | null
    const campusTriggerText = slot.querySelector('#trigger-campus-text') as HTMLElement | null

    // 刷新选择器触发器展示
    function syncTriggerViews(): void {
      const s = curService()
      if (serviceTriggerText) {
        serviceTriggerText.textContent = `${s.title} (${s.spec}) - ¥${(s.priceFen / 100).toFixed(2)}/${s.unit}`
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
        campusTriggerText.textContent = `${c.title} (${c.desc})`
      }
    }

    // 实时计算库存与费用
    function updateStockAndPrice(): void {
      syncTriggerViews()
      const s = curService()
      const price = s.priceFen
      const stockId = s.stockItemId
      const qty = parseInt(qtyInput?.value || '1', 10) || 1
      const days = daysInput ? parseInt(daysInput.value || '1', 10) || 1 : 1

      // 1. 实时库存展示
      if (isInternal && stockId) {
        const item = stockItems.find((it) => it.id === stockId)
        const count = item ? item.quantity : 0
        stockTitle.textContent = `中心仓库实时在库可用`
        stockVal.innerHTML = `<span style="color:#059669;font-weight:800;">${count}</span> 只现货`
        if (count < qty) {
          stockVal.innerHTML += ` <span style="font-size:11px;color:#dc2626;">(库存预警)</span>`
        }
      } else if (isBreeding) {
        stockTitle.textContent = `SPF 屏障独立通风笼位实时空闲`
        stockVal.innerHTML = `<span style="color:#7e22ce;font-weight:800;">${idleCages}</span> 笼可用`
      } else {
        stockTitle.textContent = `入围厂商直供状态`
        stockVal.innerHTML = `<span style="color:#2563eb;font-weight:800;">现货协议直发</span>`
      }

      // 2. 实时总价计算（自动根据学生提交的数量生成金额）
      const totalFen = isBreeding ? price * qty * days : price * qty
      totalPriceEl.textContent = moneyText(totalFen)
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
          sub: c.desc,
        })),
        selectedId: selectedCampusId,
        onSelect: (item) => {
          selectedCampusId = item.id
          syncTriggerViews()
        },
      })
    })

    qtyInput.addEventListener('input', updateStockAndPrice)
    daysInput?.addEventListener('input', updateStockAndPrice)
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
      const qty = parseInt(qtyInput.value || '10', 10)
      const projectId = selectedProjectId
      const remark = remarkArea?.value || '科研实验用途'

      const newOrder: Order = {
        id: uid('ord'),
        labId: 'animal',
        code: `AD-ORD-${String(data().orders.length + 1).padStart(4, '0')}`,
        kind,
        serviceId: `sv_${kind}_${Date.now()}`,
        serviceName,
        itemName: serviceName.split('（')[0],
        spec,
        unit,
        quantity: qty,
        unitPriceFen: price,
        auditMode: 'system',
        auditStatus: 'pending',
        fulfillStatus: KIND_INITIAL_FULFILL[kind],
        source: 'user',
        stockItemId,
        supplierId: kind === 'external' ? supplierId : undefined,
        applicantName: '张立（基础医学院）',
        applicantOrg: '基础医学院中药药理课题组',
        projectId,
        remark,
        createdAt: todayStr(),
        updatedAt: todayStr(),
        history: [{ at: todayStr(), actor: '张立（研究生）', action: '通过移动端提交申办', note: remark }],
      }

      updateData((d) => ({ ...d, orders: [...d.orders, newOrder] }))
      notify()
      toast('申办已成功提交！已流转至实验动物中心待办', 'success')
      currentView = 'orders'
      orderFilter = 'all'
      render()
      window.scrollTo(0, 0)
    })
  }

  /* ==========================================================================
     页面 3：【我的订单】（状态过滤条 + 订单卡片列表 + 展开时间轴）
     ========================================================================== */
  function renderOrdersPage(slot: HTMLElement): void {
    const allOrders = data().orders.slice().reverse()

    const filteredOrders = allOrders.filter((o) => {
      if (orderFilter === 'pending') return o.auditStatus === 'pending'
      if (orderFilter === 'processing') return o.fulfillStatus === 'pending_out' || o.fulfillStatus === 'sent'
      if (orderFilter === 'breeding') return o.fulfillStatus === 'breeding'
      if (orderFilter === 'completed') return o.fulfillStatus === 'completed' || o.fulfillStatus === 'exited'
      return true
    })

    slot.innerHTML = `
      <div class="orders-page">
        <div class="orders-page__header">
          <h2 class="orders-page__title">我的办件订单</h2>
          <span style="font-size:12px;color:#2563eb;cursor:pointer;font-weight:600;" id="orders-refresh-btn">刷新 ↻</span>
        </div>

        <!-- 订单状态过滤条 -->
        <div class="orders-filter-bar">
          <div class="orders-filter-chip ${orderFilter === 'all' ? 'is-active' : ''}" data-filter="all">全部 (${allOrders.length})</div>
          <div class="orders-filter-chip ${orderFilter === 'pending' ? 'is-active' : ''}" data-filter="pending">审核中</div>
          <div class="orders-filter-chip ${orderFilter === 'processing' ? 'is-active' : ''}" data-filter="processing">进行中</div>
          <div class="orders-filter-chip ${orderFilter === 'breeding' ? 'is-active' : ''}" data-filter="breeding">在养中</div>
          <div class="orders-filter-chip ${orderFilter === 'completed' ? 'is-active' : ''}" data-filter="completed">已办结</div>
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

      let statusBadgeClass = 'order-status-pill--done'
      let statusText = '已完成'
      let statusHint = '已整单出库交付'

      if (o.auditStatus === 'pending') {
        statusBadgeClass = 'order-status-pill--pending'
        statusText = '审核中'
        statusHint = '实验师李建国待审核'
      } else if (o.fulfillStatus === 'pending_out') {
        statusBadgeClass = 'order-status-pill--processing'
        statusText = '待出库'
        statusHint = '中心仓库整单配发中'
      } else if (o.fulfillStatus === 'sent') {
        statusBadgeClass = 'order-status-pill--processing'
        statusText = '采购中'
        statusHint = '已向入围厂商汇总集采'
      } else if (o.fulfillStatus === 'breeding') {
        statusBadgeClass = 'order-status-pill--done'
        statusText = '在养中'
        statusHint = 'SPF独立通风笼位动态计费'
      } else if (o.fulfillStatus === 'completed') {
        statusBadgeClass = 'order-status-pill--done'
        statusText = '可领取'
        statusHint = '请持办件单号至中心交接'
      } else if (o.fulfillStatus === 'exited') {
        statusBadgeClass = 'order-status-pill--done'
        statusText = '已结项'
        statusHint = '已完成退出，费用划转结清'
      }

      const isApproved = o.auditStatus === 'approved' || o.fulfillStatus === 'completed' || o.fulfillStatus === 'sent' || o.fulfillStatus === 'breeding'
      const isFulfilled = o.fulfillStatus === 'completed' || o.fulfillStatus === 'sent' || o.fulfillStatus === 'breeding' || o.fulfillStatus === 'exited'

      const card = el('div', 'order-item-card')
      card.innerHTML = `
        <div class="order-item-card__head">
          <span class="order-item-card__code">${o.code}</span>
          <span class="order-status-pill ${statusBadgeClass}">${statusText}</span>
        </div>

        <div class="order-item-card__body">
          <h4 class="order-item-card__title">${o.serviceName}</h4>
          <div class="order-item-card__meta">品规数量：${o.spec} × <strong>${o.quantity} ${o.unit}</strong></div>
          <div class="order-item-card__meta">课题经费：${o.projectId ? '已关联科研项目划转' : '国自然专项'}</div>
          <div class="order-item-card__meta" style="color:#059669;font-weight:600;margin-top:2px;">状态说明：${statusHint}</div>
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
                <div class="timeline-step__title">申请人在线填报</div>
                <div class="timeline-step__desc">${o.createdAt} · 手机端在线提交 · 关联科研项目经费</div>
              </div>
            </div>
            <div class="timeline-step ${isApproved ? 'is-done' : 'is-current'}">
              <div class="timeline-step__dot"></div>
              <div>
                <div class="timeline-step__title">${isApproved ? '中心实验师李建国审核通过' : '中心实验师审核中'}</div>
                <div class="timeline-step__desc">${isApproved ? '核准实验品系、IACUC伦理与实验级别' : '中心待办审核中'}</div>
              </div>
            </div>
            <div class="timeline-step ${isFulfilled ? 'is-done' : ''}">
              <div class="timeline-step__dot"></div>
              <div>
                <div class="timeline-step__title">
                  ${o.kind === 'internal' ? (isFulfilled ? '仓库已完成整单配发' : '等待仓库整单出库') : o.kind === 'external' ? (isFulfilled ? '已向入围供应商汇总采购' : '等待采购汇总') : (isFulfilled ? '现场核验完成已分配笼位' : '等待线下交接入场')}
                </div>
                <div class="timeline-step__desc">${isFulfilled ? '请持电子单号至云漫湖动物中心交接' : '系统流转中'}</div>
              </div>
            </div>
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

