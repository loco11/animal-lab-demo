/** 应用外壳：顶栏（实验室切换 / 身份 / 恢复数据 / 视图切换）+ 左侧菜单 + 内容区 */

import { getCurrentUser, visibleGroups, users } from './core/auth'
import { releaseCall } from './core/biz/serviceCall'
import { data } from './core/data'
import { getState, notify, resetState, subscribe } from './core/store'
import { renderRoute, navigate, currentPath, routePath } from './router'
import { escapeHtml } from './core/utils'
import { confirmDialog, el, toast } from './ui'
import type { ServiceCall } from './types'

export function mountApp(root: HTMLElement): void {
  root.innerHTML = `
    <!-- Standalone 模式顶栏（在业务大纲 / 移动端时展示） -->
    <div class="standalone-top-bar">
      <div class="standalone-brand">
        <strong>贵州医科大学</strong> · 实验动物业务原型系统
        <span style="font-size:11px;font-weight:400;color:#64748b;margin-left:6px;background:#f1f5f9;padding:1px 6px;border-radius:3px">贵州省实验动物工程技术中心</span>
      </div>
      <div class="standalone-views">
        <button class="view-switch-btn" data-target="/hub">业务大纲</button>
        <button class="view-switch-btn" data-target="/dashboard">PC 管理端</button>
        <button class="view-switch-btn" data-target="/mobile">移动办事端</button>
        <button class="view-switch-btn standalone-reset-btn" style="border:1px solid #cbd5e1;margin-left:6px;" title="重置所有演示数据">重置数据</button>
      </div>
    </div>

    <div class="app-shell">
      <!-- 标准 PC 后台顶栏（集成居中导航与右侧人员实验室切换，完全零重叠） -->
      <header class="app-header">
        <div class="app-header__left">
          <div class="app-header__brand">
            <span style="color:#16529b;font-weight:700;margin-right:6px">贵州医科大学</span> · 实验动物综合业务管理系统
          </div>
        </div>

        <div class="app-header__right"></div>
      </header>

      <div class="app-body">
        <nav class="app-nav"></nav>
        <main class="app-content"></main>
      </div>
    </div>
  `

  const appShell = root.querySelector('.app-shell') as HTMLElement
  const headerRight = root.querySelector('.app-header__right') as HTMLElement
  const nav = root.querySelector('.app-nav') as HTMLElement
  const content = root.querySelector('.app-content') as HTMLElement

  /* ---------- 视图切换按钮事件绑定 ---------- */
  root.querySelectorAll('.view-switch-btn[data-target]').forEach((btn) => {
    const target = btn.getAttribute('data-target')
    if (target) {
      btn.addEventListener('click', () => navigate(target))
    }
  })

  // Standalone 重置数据按钮
  root.querySelector('.standalone-reset-btn')?.addEventListener('click', async () => {
    const ok = await confirmDialog('恢复演示数据', '将重置所有订单、出库、笼位与结算数据回到初始干净状态，确定继续？', '确定恢复')
    if (!ok) return
    resetState()
    toast('已恢复初始演示数据', 'success')
  })

  function updateViewSwitchers(path: string): void {
    root.querySelectorAll('.view-switch-btn[data-target]').forEach((btn) => {
      const target = btn.getAttribute('data-target')
      if (!target) return
      if (target === '/hub') {
        btn.classList.toggle('is-active', path === '/hub')
      } else if (target === '/mobile') {
        btn.classList.toggle('is-active', path === '/mobile')
      } else if (target === '/dashboard') {
        btn.classList.toggle('is-active', path !== '/hub' && path !== '/mobile')
      }
    })
  }

  /* ---------- 顶栏右侧内容 ---------- */
  function renderHeader(): void {
    const user = getCurrentUser()
    headerRight.innerHTML = ''

    headerRight.appendChild(el('span', 'app-header__user', `${user.name}（${user.roleName}）`))

    const switchBtn = el('button', 'btn-text', '切换账号') as HTMLButtonElement
    switchBtn.addEventListener('click', () => navigate('/login'))
    headerRight.appendChild(switchBtn)
  }

  function getNavIcon(path: string): string {
    switch (path) {
      case '/dashboard':
        return '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9"></rect><rect x="14" y="3" width="7" height="5"></rect><rect x="14" y="12" width="7" height="9"></rect><rect x="3" y="16" width="7" height="5"></rect></svg>'
      case '/service':
        return '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>'
      case '/order':
      case '/order/internal':
        return '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path><line x1="3" y1="6" x2="21" y2="6"></line><path d="M16 10a4 4 0 0 1-8 0"></path></svg>'
      case '/stock':
        return '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="21 8 21 21 3 21 3 8"></polyline><rect x="1" y="3" width="22" height="5"></rect><line x1="10" y1="12" x2="14" y2="12"></line></svg>'
      case '/purchase':
        return '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>'
      case '/feeding':
        return '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z"></path><circle cx="12" cy="12" r="3"></circle></svg>'
      case '/cage':
        return '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="3" y1="15" x2="21" y2="15"></line><line x1="9" y1="3" x2="9" y2="21"></line><line x1="15" y1="3" x2="15" y2="21"></line></svg>'
      case '/fee':
        return '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect><line x1="1" y1="10" x2="23" y2="10"></line></svg>'
      case '/system/menu':
        return '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>'
      case '/system/role':
        return '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>'
      case '/system/user':
        return '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="7" r="4"></circle><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path></svg>'
      default:
        return '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle></svg>'
    }
  }

  /* ---------- 左侧菜单 ---------- */
  function renderNav(activePath: string): void {
    nav.innerHTML = ''
    visibleGroups().forEach((g) => {
      const groupEl = el('div', 'app-nav__group-wrap')

      const headerEl = el('div', 'app-nav__group-header')
      headerEl.innerHTML = `
        <span class="app-nav__group-bar"></span>
        <span class="app-nav__group-title">${g.title}</span>
      `
      groupEl.appendChild(headerEl)

      const bodyEl = el('div', 'app-nav__group-body')
      g.items.forEach((item) => {
        const isActive = item.path === activePath
        const link = el(
          'div',
          `app-nav__item${isActive ? ' is-active' : ''}`,
        ) as HTMLElement

        link.innerHTML = `
          <span class="app-nav__icon">${getNavIcon(item.path)}</span>
          <span class="app-nav__text">${item.title}</span>
          ${isActive ? '<span class="app-nav__active-dot"></span>' : ''}
        `
        link.addEventListener('click', () => navigate(item.path))
        bodyEl.appendChild(link)
      })
      groupEl.appendChild(bodyEl)
      nav.appendChild(groupEl)
    })
  }

  /* ---------- 路由渲染 ---------- */
  function handleRoute(): void {
    const rawPath = routePath()
    const isStandalone = rawPath === '/hub' || rawPath === '/mobile'
    appShell.classList.toggle('is-standalone', isStandalone)

    const path = renderRoute(content)
    if (!isStandalone) {
      renderNav(path)
    }
    updateViewSwitchers(path)
  }

  renderHeader()
  handleRoute()

  window.addEventListener('hashchange', () => {
    handleRoute()
    renderCallQueue()
  })
  subscribe(() => {
    renderHeader()
    handleRoute()
  })

  /* ---------- 学生现场取号：教师端右下角折叠队列 ---------- */
  const CALL_KIND_TEXT: Record<string, string> = {
    internal: '自产动物出库',
    external: '外购代采',
    breeding: '饲养寄养入住',
  }

  const queueRoot = document.createElement('div')
  queueRoot.className = 'call-queue-root'
  document.body.appendChild(queueRoot)

  let queueOpen = false

  function pendingCalls(): ServiceCall[] {
    return data().serviceCalls.filter((c) => c.status === 'waiting' || c.status === 'called')
  }

  function renderCallQueue(): void {
    const path = routePath()
    if (path === '/hub' || path === '/mobile' || path === '/login') {
      queueRoot.style.display = 'none'
      return
    }
    queueRoot.style.display = ''

    const pending = pendingCalls()

    queueRoot.innerHTML = `
      <button class="call-fab" type="button" title="现场取号队列">
        <span class="call-fab__icon">🔔</span>
        <span class="call-fab__text">取号</span>
        ${pending.length ? `<span class="call-fab__badge">${pending.length}</span>` : ''}
      </button>
      <div class="call-queue-panel${queueOpen ? ' is-open' : ''}">
        <div class="call-queue-panel__head">
          <span class="call-queue-panel__title">现场取号队列</span>
          <span class="call-queue-panel__count">${pending.length} 人等待</span>
        </div>
        <div class="call-queue-panel__list">
          ${
            pending.length
              ? pending
                  .map(
                    (call) => `
              <div class="call-queue-card">
                <div class="call-queue-card__head">
                  <span class="call-queue-card__seq">#${String(call.seq).padStart(3, '0')}</span>
                  <span class="call-queue-card__name">${escapeHtml(call.name)}</span>
                </div>
                <div class="call-queue-card__body">
                  <div class="call-queue-card__row"><span>学工号</span><strong>${escapeHtml(call.no)}</strong></div>
                  <div class="call-queue-card__row"><span>单位</span><strong>${escapeHtml(call.org)}</strong></div>
                  <div class="call-queue-card__row"><span>订单编号</span><strong>${escapeHtml(call.orderCode)}</strong></div>
                  <div class="call-queue-card__row"><span>订单类型</span><strong>${escapeHtml(CALL_KIND_TEXT[call.orderKind] ?? call.orderKind)}</strong></div>
                </div>
                <div class="call-queue-card__actions">
                  <button class="btn btn-primary" data-call-act="goto" data-call-id="${call.id}">去办理</button>
                  <button class="btn btn-default" data-call-act="release" data-call-id="${call.id}">忽略 / 释放</button>
                </div>
              </div>
            `,
                  )
                  .join('')
              : '<div class="call-queue-empty">暂无待处理的现场取号</div>'
          }
        </div>
      </div>
    `

    queueRoot.querySelector('.call-fab')?.addEventListener('click', () => {
      queueOpen = !queueOpen
      renderCallQueue()
    })

    queueRoot.querySelectorAll<HTMLElement>('[data-call-act]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.callId
        const act = btn.dataset.callAct
        const call = data().serviceCalls.find((c) => c.id === id)
        if (!call) return
        if (act === 'release') {
          releaseCall(call.id)
          renderCallQueue()
        } else if (act === 'goto') {
          queueOpen = false
          navigate(call.biz === 'outstock' ? '/order/internal' : '/feeding')
        }
      })
    })
  }

  subscribe(renderCallQueue)
  renderCallQueue()
  // 兜底轮询：教师端每 3 秒刷新队列（无论跨窗口同步是否生效）
  setInterval(renderCallQueue, 3000)

  // 首次进入默认落到 /hub
  const state = getState()
  if (!users().some((u) => u.id === state.currentUserId)) {
    state.currentUserId = users()[0]?.id ?? 'u_super'
    notify()
  }

  if (!currentPath().startsWith('/')) navigate('/hub')
}
