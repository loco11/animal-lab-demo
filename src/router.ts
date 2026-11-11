/** 极简 hash 路由（无框架）：避免静态托管需要服务端 rewrite */

import { canViewPath } from './core/auth'
import { renderState } from './ui'

export interface PageDef {
  title: string
  render: (host: HTMLElement) => void
}

const pages = new Map<string, PageDef>()

export function registerPage(path: string, def: PageDef): void {
  pages.set(path, def)
}

export function getPageDef(path: string): PageDef | undefined {
  return pages.get(path)
}

export function currentPath(): string {
  const raw = location.hash.replace(/^#/, '')
  return raw.startsWith('/') ? raw : '/hub'
}

/** 路径部分（去掉 ? 后的查询串），用于页面匹配与权限校验 */
export function routePath(): string {
  return currentPath().split('?')[0]
}

/** 查询部分：列表页的筛选入口（如从概览点击“待出库”） */
export function currentQuery(): Record<string, string> {
  const query: Record<string, string> = {}
  const raw = currentPath().split('?')[1]
  if (!raw) return query
  raw.split('&').forEach((kv) => {
    const [k, v] = kv.split('=')
    if (k) query[decodeURIComponent(k)] = decodeURIComponent(v ?? '')
  })
  return query
}

export function navigate(path: string): void {
  if (currentPath() === path) return
  location.hash = path
}

/** 渲染当前路由到 host。返回最终渲染的路径 */
export function renderRoute(host: HTMLElement): string {
  host.innerHTML = ''
  const path = routePath()
  const def = getPageDef(path)

  if (!def) {
    navigate('/dashboard')
    return renderRoute(host)
  }

  if (path !== '/login' && !canViewPath(path)) {
    renderPermissionDenied(host, path)
    return path
  }

  def.render(host)
  return path
}

/**
 * 重新渲染当前路由：页签切换、筛选查询、翻页等纯视图交互后刷新列表。
 * 页面内部的 view 状态保存在模块级，重绘不会丢失；写操作则通过 store 订阅自动刷新。
 */
export function rerender(): void {
  const host = document.querySelector('.app-content') as HTMLElement | null
  if (!host) return
  const y = window.scrollY
  renderRoute(host)
  window.scrollTo(0, y)
}

function renderPermissionDenied(host: HTMLElement, path: string): void {
  const page = document.createElement('div')
  page.className = 'page'
  page.innerHTML = `<h1 class="page-title">无权限访问</h1>
    <p class="page-desc">当前角色的菜单授权中不包含该页面（${path}）。这是直接构造地址也会被拦截的检查，不是只隐藏入口。</p>`
  const panel = document.createElement('div')
  panel.className = 'panel'
  renderState(panel, 'error', '无权限访问该页面，请切换身份或联系超级管理员授权')
  page.appendChild(panel)
  host.appendChild(page)
}
