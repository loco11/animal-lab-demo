/**
 * 极简状态容器（替代 Pinia）：
 * - 单一状态对象，所有变更走 setState（纯函数变换）
 * - localStorage 持久化，刷新保留；种子版本变化时自动重置
 * - 提供 reset 恢复初始数据、subscribe 触发重绘
 */

import type { AppState } from '../types'
import { createSeedState, SEED_VERSION } from './seed'

const STORAGE_KEY = 'lab-demo-state'

let state: AppState = load()
const listeners = new Set<() => void>()

function load(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return createSeedState()
    const parsed = JSON.parse(raw) as AppState
    if (parsed.version !== SEED_VERSION) return createSeedState()
    return parsed
  } catch {
    return createSeedState()
  }
}

function persist(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    /* 隐私模式或无 localStorage 环境（如测试）忽略 */
  }
}

export function getState(): AppState {
  return state
}

export function setState(mutator: (prev: AppState) => AppState): void {
  const next = mutator(state)
  if (next === state) return
  state = next
  persist()
  notify()
  // 跨窗口/标签页广播：教师端（其他上下文）实时感知学生端取号等变更
  syncChannel?.postMessage(state)
}

export function notify(): void {
  listeners.forEach((fn) => fn())
}

export function subscribe(fn: () => void): void {
  listeners.add(fn)
}

export function resetState(): void {
  state = createSeedState()
  persist()
  notify()
}

/** 数据范围：null 表示全校；所有列表取数必须经此，保证租户隔离 */
export function scopeLabId(): string | null {
  const s = state
  return s.wholeSchool ? null : s.currentLabId
}

/* 跨标签页/窗口同步：学生端取号后，教师端标签页实时感知并弹窗 */
function applyIncoming(incoming: AppState): void {
  // 仅同步业务数据，保留本标签页的身份与实验室上下文
  state = {
    ...incoming,
    currentUserId: state.currentUserId,
    currentLabId: state.currentLabId,
    wholeSchool: state.wholeSchool,
  }
  notify()
}

let syncChannel: BroadcastChannel | null = null
if (typeof window !== 'undefined') {
  // 优先使用 BroadcastChannel：同源多窗口/iframe 实时广播，不依赖 localStorage 写入
  if ('BroadcastChannel' in window) {
    syncChannel = new BroadcastChannel('lab-demo-sync')
    syncChannel.addEventListener('message', (e) => {
      try {
        applyIncoming(e.data as AppState)
      } catch {
        /* 忽略解析失败 */
      }
    })
  }
  // storage 事件兜底：BroadcastChannel 不可用或跨浏览器场景
  window.addEventListener('storage', (e) => {
    if (e.key !== STORAGE_KEY || !e.newValue) return
    try {
      applyIncoming(JSON.parse(e.newValue) as AppState)
    } catch {
      /* 忽略解析失败 */
    }
  })
}
