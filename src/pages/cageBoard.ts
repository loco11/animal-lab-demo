/** 笼位空间看板：分校区楼栋、分楼层、分房间物理空间感知，机架网格化直观展示空闲与在养状态，与笼位台账双向联动 */

import { data, scoped } from '../core/data'
import { daysBetween, escapeHtml, todayStr } from '../core/utils'
import { completeCageCleaning } from '../core/biz/feeding'
import type { Cage, CageOccupancy, Feeding, Order } from '../types'
import type { PageDef } from '../router'
import { currentQuery, navigate, rerender } from '../router'
import { el, openDialog, tagHtml, toast } from '../ui'
import { detailGrid, pageShell } from '../ui/form'
import { showResult } from './common'
import { setCageStatus } from './cage'

interface ViewState {
  building: string
  floor: string
  room: string
  status: 'all' | 'free' | 'reserved' | 'occupied' | 'cleaning' | 'disabled'
  searchKeyword: string
}

const view: ViewState = {
  building: '',
  floor: 'all',
  room: 'all',
  status: 'all',
  searchKeyword: '',
}

export const cageBoardPage: PageDef = {
  title: '笼位空间看板',
  render(host: HTMLElement) {
    const page = pageShell(host, {})

    const allCages = scoped(data().cages)
    const buildings = [...new Set(allCages.map((c) => c.building || '云漫湖校区·实验动物中心（SPF屏障实验楼）'))]

    // 检查是否有外部跳转的定位目标笼位（如从台账列表点击“🎯 看板定位”）
    const q = currentQuery()
    const focusCode = (q.focusCage as string | undefined)?.trim()
    let focusedCage: Cage | undefined
    if (focusCode) {
      focusedCage = allCages.find((c) => c.code.toLowerCase() === focusCode.toLowerCase())
      if (focusedCage) {
        if (focusedCage.building && buildings.includes(focusedCage.building)) {
          view.building = focusedCage.building
        }
        if (focusedCage.floor) {
          view.floor = focusedCage.floor
        }
        if (focusedCage.room) {
          view.room = focusedCage.room
        }
        view.status = 'all'
      }
    }

    if (!view.building || !buildings.includes(view.building)) {
      view.building = buildings[0] || '云漫湖校区·实验动物中心（SPF屏障实验楼）'
    }

    // 1. 楼栋切换卡片栏
    const buildingBar = el('div', 'cage-building-bar')
    buildingBar.style.cssText = 'display:flex;gap:12px;margin-bottom:16px;'

    buildings.forEach((bName) => {
      const bCages = allCages.filter((c) => (c.building || buildings[0]) === bName)
      const freeCount = bCages.filter((c) => c.status === 'free').length
      const occCount = bCages.filter((c) => c.status === 'occupied').length
      const isSelected = view.building === bName

      const card = el('div', `panel building-tab-card ${isSelected ? 'is-active' : ''}`)
      card.style.cssText = `
        flex: 1;
        cursor: pointer;
        padding: 14px 18px;
        border-radius: var(--radius-md);
        border: 2px solid ${isSelected ? 'var(--c-primary)' : 'var(--c-border-table)'};
        background: ${isSelected ? 'var(--c-primary-bg)' : '#ffffff'};
        transition: all 0.2s ease;
        box-shadow: ${isSelected ? 'var(--shadow-sm)' : 'none'};
      `

      card.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
          <strong style="font-size:14px;color:${isSelected ? 'var(--c-primary)' : 'var(--c-title)'};display:flex;align-items:center;gap:6px;">
            <span style="font-size:16px;">🏢</span> ${escapeHtml(bName)}
          </strong>
          ${isSelected ? '<span style="font-size:11px;background:#16529b;color:#fff;padding:1px 6px;border-radius:3px;font-weight:600;">当前所在</span>' : ''}
        </div>
        <div style="font-size:12px;color:var(--c-desc);display:flex;gap:14px;">
          <span>总容量: <strong>${bCages.length}</strong> 笼</span>
          <span style="color:var(--c-success);">🟢 空闲: <strong>${freeCount}</strong></span>
          <span style="color:#0284c7;">🔵 在养: <strong>${occCount}</strong></span>
        </div>
      `

      card.addEventListener('click', () => {
        if (view.building !== bName) {
          view.building = bName
          view.floor = 'all'
          view.room = 'all'
          view.status = 'all'
          view.searchKeyword = ''
          rerender()
        }
      })
      buildingBar.appendChild(card)
    })
    page.appendChild(buildingBar)

    // 2. 当前楼栋的数据指标与视图工具条
    const currentBuildingCages = allCages.filter((c) => (c.building || buildings[0]) === view.building)
    const bTotal = currentBuildingCages.length
    const bFree = currentBuildingCages.filter((c) => c.status === 'free').length
    const bOcc = currentBuildingCages.filter((c) => c.status === 'occupied').length
    const bDisabled = currentBuildingCages.filter((c) => c.status === 'disabled').length
    const occRate = bTotal > 0 ? Math.round((bOcc / bTotal) * 100) : 0

    // 计算当前在养动物总数
    let activeAnimalCount = 0
    currentBuildingCages.forEach((c) => {
      const occ = data().occupancies.find((o) => o.cageId === c.id && o.end === null)
      if (occ) {
        const feeding = data().feedings.find((f) => f.id === occ.feedingId)
        if (feeding) activeAnimalCount += feeding.quantity || c.capacity
      }
    })

    const summaryPanel = el('div', 'panel')
    summaryPanel.style.cssText =
      'padding:14px 20px;margin-bottom:16px;background:#ffffff;border:1px solid var(--c-border-table);border-radius:var(--radius-md);'
    summaryPanel.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;">
        <div style="display:flex;align-items:center;gap:20px;flex-wrap:wrap;">
          <div>
            <div style="font-size:11px;color:var(--c-desc);margin-bottom:2px;">所在楼栋总笼位</div>
            <div style="font-size:20px;font-weight:700;color:var(--c-title);">${bTotal} <span style="font-size:12px;font-weight:normal;color:var(--c-desc);">笼</span></div>
          </div>
          <div style="height:28px;width:1px;background:var(--c-border-divider);"></div>
          <div>
            <div style="font-size:11px;color:var(--c-desc);margin-bottom:2px;">实时在架占用率</div>
            <div style="font-size:20px;font-weight:700;color:#0284c7;">${occRate}%</div>
          </div>
          <div style="height:28px;width:1px;background:var(--c-border-divider);"></div>
          <div>
            <div style="font-size:11px;color:var(--c-desc);margin-bottom:2px;">空闲可用笼位</div>
            <div style="font-size:20px;font-weight:700;color:var(--c-success);">${bFree} <span style="font-size:12px;font-weight:normal;color:var(--c-desc);">笼</span></div>
          </div>
          <div style="height:28px;width:1px;background:var(--c-border-divider);"></div>
          <div>
            <div style="font-size:11px;color:var(--c-desc);margin-bottom:2px;">在养动物总数</div>
            <div style="font-size:20px;font-weight:700;color:var(--c-title);">${activeAnimalCount} <span style="font-size:12px;font-weight:normal;color:var(--c-desc);">只</span></div>
          </div>
          <div style="height:28px;width:1px;background:var(--c-border-divider);"></div>
          <div>
            <div style="font-size:11px;color:var(--c-desc);margin-bottom:2px;">停用检修</div>
            <div style="font-size:20px;font-weight:700;color:var(--c-desc);">${bDisabled} <span style="font-size:12px;font-weight:normal;color:var(--c-desc);">笼</span></div>
          </div>
        </div>
      </div>
    `
    page.appendChild(summaryPanel)

    // 3. 楼层、房间、状态快速筛选与实时搜索条
    const floors = ['all', ...new Set(currentBuildingCages.map((c) => c.floor || '1F'))]
    let filteredByFloor = currentBuildingCages
    if (view.floor !== 'all') {
      filteredByFloor = filteredByFloor.filter((c) => (c.floor || '1F') === view.floor)
    }
    const rooms = ['all', ...new Set(filteredByFloor.map((c) => c.room))]

    const filterHost = el('div', 'panel')
    filterHost.style.cssText =
      'padding:14px 20px;margin-bottom:16px;background:#ffffff;border:1px solid var(--c-border-table);border-radius:var(--radius-md);'

    const filterHtml = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;padding-bottom:12px;border-bottom:1px dashed var(--c-border-divider);flex-wrap:wrap;gap:12px;">
        <div style="display:flex;align-items:center;gap:16px;">
          <span style="font-size:12px;font-weight:600;color:var(--c-title);width:60px;">物理楼层:</span>
          <div style="display:flex;gap:8px;" id="floor-buttons">
            ${floors
              .map(
                (f) => `
              <button class="btn ${view.floor === f ? 'btn-primary' : 'btn-default'}" data-floor="${f}" style="height:28px;padding:0 12px;font-size:12px;">
                ${f === 'all' ? '全部楼层' : f}
              </button>
            `,
              )
              .join('')}
          </div>
        </div>

        <div style="display:flex;align-items:center;gap:8px;">
          <input type="text" id="cage-board-search" value="${escapeHtml(view.searchKeyword)}" placeholder="输入笼号 / 教师 / 品系..." style="height:28px;width:200px;border:1px solid var(--c-border-table);border-radius:4px;padding:0 8px;font-size:12px;" />
          ${view.searchKeyword ? '<button class="btn btn-default" id="btn-clear-search" style="height:28px;padding:0 8px;font-size:11px;">清除</button>' : ''}
        </div>
      </div>

      <div style="display:flex;align-items:center;gap:16px;margin-bottom:12px;padding-bottom:12px;border-bottom:1px dashed var(--c-border-divider);">
        <span style="font-size:12px;font-weight:600;color:var(--c-title);width:60px;">具体房间:</span>
        <div style="display:flex;flex-wrap:wrap;gap:8px;" id="room-buttons">
          ${rooms
            .map((r) => {
              const rCages = filteredByFloor.filter((c) => r === 'all' || c.room === r)
              const rFree = rCages.filter((c) => c.status === 'free').length
              const rOcc = rCages.filter((c) => c.status === 'occupied').length
              const isSelected = view.room === r
              return `
                <button class="btn ${isSelected ? 'btn-primary' : 'btn-default'}" data-room="${escapeHtml(r)}" style="height:28px;padding:0 12px;font-size:12px;display:flex;align-items:center;gap:6px;">
                  <span>${r === 'all' ? '全部房间' : escapeHtml(r)}</span>
                  <span style="font-size:10px;opacity:0.85;">(空${rFree}/用${rOcc})</span>
                </button>
              `
            })
            .join('')}
        </div>
      </div>

      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
        <div style="display:flex;align-items:center;gap:16px;">
          <span style="font-size:12px;font-weight:600;color:var(--c-title);width:60px;">状态过滤:</span>
          <div style="display:flex;gap:8px;flex-wrap:wrap;" id="status-buttons">
            <button class="btn ${view.status === 'all' ? 'btn-primary' : 'btn-default'}" data-status="all" style="height:26px;padding:0 10px;font-size:12px;">全部 (${filteredByFloor.length})</button>
            <button class="btn ${view.status === 'free' ? 'btn-primary' : 'btn-default'}" data-status="free" style="height:26px;padding:0 10px;font-size:12px;color:var(--c-success);">🟢 空闲 (${filteredByFloor.filter((c) => c.status === 'free').length})</button>
            <button class="btn ${view.status === 'reserved' ? 'btn-primary' : 'btn-default'}" data-status="reserved" style="height:26px;padding:0 10px;font-size:12px;color:#d97706;">🟡 预分配 (${filteredByFloor.filter((c) => c.status === 'reserved').length})</button>
            <button class="btn ${view.status === 'occupied' ? 'btn-primary' : 'btn-default'}" data-status="occupied" style="height:26px;padding:0 10px;font-size:12px;color:#0284c7;">🟣 在养 (${filteredByFloor.filter((c) => c.status === 'occupied').length})</button>
            <button class="btn ${view.status === 'cleaning' ? 'btn-primary' : 'btn-default'}" data-status="cleaning" style="height:26px;padding:0 10px;font-size:12px;color:#0ea5e9;">🧼 待消杀 (${filteredByFloor.filter((c) => c.status === 'cleaning').length})</button>
            <button class="btn ${view.status === 'disabled' ? 'btn-primary' : 'btn-default'}" data-status="disabled" style="height:26px;padding:0 10px;font-size:12px;color:var(--c-desc);">⚪ 停用 (${filteredByFloor.filter((c) => c.status === 'disabled').length})</button>
          </div>
        </div>
      </div>
    `
    filterHost.innerHTML = filterHtml

    filterHost.querySelectorAll('button[data-floor]').forEach((btn) => {
      btn.addEventListener('click', () => {
        view.floor = (btn as HTMLElement).dataset.floor || 'all'
        view.room = 'all'
        rerender()
      })
    })

    filterHost.querySelectorAll('button[data-room]').forEach((btn) => {
      btn.addEventListener('click', () => {
        view.room = (btn as HTMLElement).dataset.room || 'all'
        rerender()
      })
    })

    filterHost.querySelectorAll('button[data-status]').forEach((btn) => {
      btn.addEventListener('click', () => {
        view.status = ((btn as HTMLElement).dataset.status as ViewState['status']) || 'all'
        rerender()
      })
    })

    const searchInput = filterHost.querySelector('#cage-board-search') as HTMLInputElement
    searchInput?.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') {
        view.searchKeyword = searchInput.value.trim()
        rerender()
      }
    })
    filterHost.querySelector('#btn-clear-search')?.addEventListener('click', () => {
      view.searchKeyword = ''
      rerender()
    })

    page.appendChild(filterHost)

    // 4. 机架矩阵渲染区 (Rack Grid)
    let displayCages = filteredByFloor
    if (view.room !== 'all') {
      displayCages = displayCages.filter((c) => c.room === view.room)
    }
    if (view.status !== 'all') {
      displayCages = displayCages.filter((c) => c.status === view.status)
    }

    if (!displayCages.length) {
      const emptyPanel = el('div', 'panel')
      emptyPanel.innerHTML = `
        <div class="state-area" style="padding:48px 0;">
          <p class="state-area__text">当前筛选条件下暂无笼位</p>
          <p class="hint" style="margin-top:6px;">可尝试切换楼层、房间或清除状态过滤条件</p>
        </div>
      `
      page.appendChild(emptyPanel)
      return
    }

    // 按机架 (Rack) 分组展示
    const rackGroups = new Map<string, Cage[]>()
    displayCages.forEach((c) => {
      const rName = c.rack || `${c.room} - 默认机架`
      if (!rackGroups.has(rName)) rackGroups.set(rName, [])
      rackGroups.get(rName)!.push(c)
    })

    const boardHost = el('div', 'cage-racks-container')
    boardHost.style.cssText = 'display:flex;flex-direction:column;gap:18px;'

    rackGroups.forEach((cagesOnRack, rackName) => {
      const rackPanel = el('div', 'panel')
      rackPanel.style.cssText =
        'background:#ffffff;border:1px solid var(--c-border-table);border-radius:var(--radius-md);padding:16px 20px;'

      const rTotal = cagesOnRack.length
      const rFree = cagesOnRack.filter((c) => c.status === 'free').length
      const rOcc = cagesOnRack.filter((c) => c.status === 'occupied').length
      const rRate = rTotal > 0 ? Math.round((rOcc / rTotal) * 100) : 0

      const rackHeader = el('div')
      rackHeader.style.cssText =
        'display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid var(--c-border-divider);flex-wrap:wrap;gap:8px;'
      rackHeader.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;">
          <strong style="font-size:14px;color:var(--c-title);">${escapeHtml(rackName)}</strong>
          <span style="font-size:11px;color:var(--c-desc);background:#f1f5f9;padding:2px 8px;border-radius:4px;">
            ${escapeHtml(cagesOnRack[0]?.room || '')} · ${cagesOnRack[0]?.env === 'SPF' ? 'SPF屏障独立通风' : '普通环境'}
          </span>
        </div>
        <div style="font-size:12px;color:var(--c-desc);display:flex;align-items:center;gap:14px;">
          <div style="display:flex;align-items:center;gap:6px;">
            <div style="width:80px;height:6px;background:#e2e8f0;border-radius:3px;overflow:hidden;">
              <div style="width:${rRate}%;height:100%;background:${rRate > 80 ? '#f59e0b' : '#0284c7'};border-radius:3px;"></div>
            </div>
            <span style="font-size:11px;font-weight:600;color:${rRate > 0 ? '#0284c7' : '#64748b'};">${rRate}%</span>
          </div>
          <span>机位容量: <strong>${rTotal}</strong> 笼</span>
          <span style="color:var(--c-success);">🟢 空闲: <strong>${rFree}</strong></span>
          <span style="color:#0284c7;">🔵 在养: <strong>${rOcc}</strong></span>
        </div>
      `
      rackPanel.appendChild(rackHeader)

      // 笼架网格
      const grid = el('div', 'cage-grid')
      grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill, minmax(210px, 1fr));gap:12px;'

      cagesOnRack.forEach((cage) => {
        const isTarget = Boolean(focusCode && cage.code.toLowerCase() === focusCode.toLowerCase())
        grid.appendChild(renderCageCard(cage, isTarget, view.searchKeyword))
      })

      rackPanel.appendChild(grid)
      boardHost.appendChild(rackPanel)
    })

    page.appendChild(boardHost)

    // 添加聚焦动画样式与定位滚动
    if (focusedCage) {
      setTimeout(() => {
        const targetNode = page.querySelector('.cage-slot-card.is-focused')
        if (targetNode) {
          targetNode.scrollIntoView({ behavior: 'smooth', block: 'center' })
          toast(`已在看板中为您精准定位至笼位：${focusedCage.code}`, 'info')
        }
      }, 100)
    }
  },
}

function renderCageCard(cage: Cage, isFocused = false, searchKeyword = ''): HTMLElement {
  const isFree = cage.status === 'free'
  const isOccupied = cage.status === 'occupied'
  const isReserved = cage.status === 'reserved'
  const isCleaning = cage.status === 'cleaning'

  const occ = isOccupied ? data().occupancies.find((o) => o.cageId === cage.id && o.end === null) : undefined
  const feeding = occ ? data().feedings.find((f) => f.id === occ.feedingId) : undefined
  const order = feeding ? data().orders.find((o) => o.id === feeding.orderId) : undefined

  const resOcc = isReserved ? data().occupancies.find((o) => o.cageId === cage.id && o.type === 'reserve') : undefined
  const resOrder = resOcc ? data().orders.find((o) => o.id === resOcc.orderId) : undefined

  // 搜索关键字高亮与过滤判断
  let isSearchMatched = true
  if (searchKeyword) {
    const kw = searchKeyword.toLowerCase()
    const matchCode = cage.code.toLowerCase().includes(kw)
    const matchRoom = cage.room.toLowerCase().includes(kw)
    const matchApplicant = (order?.applicantName || resOrder?.applicantName || '').toLowerCase().includes(kw)
    const matchStrain = feeding?.animalName ? feeding.animalName.toLowerCase().includes(kw) : false
    isSearchMatched = matchCode || matchRoom || matchApplicant || matchStrain
  }

  const cardBorder = isFocused
    ? '2px solid #eab308'
    : isFree
      ? '1px solid #bbf7d0'
      : isOccupied
        ? '1px solid #bae6fd'
        : isReserved
          ? '1px solid #fde047'
          : isCleaning
            ? '1px solid #bae6fd'
            : '1px solid #e2e8f0'

  const cardBg = isFree
    ? '#ffffff'
    : isOccupied
      ? '#f0f9ff'
      : isReserved
        ? '#fefce8'
        : isCleaning
          ? '#f8fafc'
          : '#f8fafc'

  const card = el('div', `cage-slot-card status-${cage.status} ${isFocused ? 'is-focused' : ''}`)
  card.style.cssText = `
    border-radius: 6px;
    border: ${cardBorder};
    background: ${cardBg};
    padding: 10px 12px;
    cursor: pointer;
    transition: all 0.2s ease;
    box-shadow: ${isFocused ? '0 0 12px rgba(234, 179, 8, 0.45)' : 'var(--shadow-sm)'};
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    min-height: 108px;
    position: relative;
    overflow: hidden;
    opacity: ${isSearchMatched ? '1' : '0.25'};
  `

  // 左侧状态指示色条
  const indicatorColor = isFree
    ? '#22c55e'
    : isOccupied
      ? '#0284c7'
      : isReserved
        ? '#eab308'
        : isCleaning
          ? '#0ea5e9'
          : '#94a3b8'

  const indicator = el('div')
  indicator.style.cssText = `position:absolute;left:0;top:0;bottom:0;width:4px;background:${indicatorColor};`
  card.appendChild(indicator)

  let contentHtml = ''

  if (isFree) {
    contentHtml = `
      <div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
          <strong style="font-size:14px;color:#0f172a;font-family:monospace;">${escapeHtml(cage.code)}</strong>
          <span style="font-size:11px;background:#f0fdf4;color:#15803d;border:1px solid #bbf7d0;padding:1px 6px;border-radius:3px;font-weight:600;">空闲可用</span>
        </div>
        <div style="font-size:12px;color:#64748b;margin-bottom:4px;">
          容纳标准：<strong>${cage.capacity}</strong> 只/笼
        </div>
        <div style="font-size:11px;color:#94a3b8;">
          ${cage.env === 'SPF' ? 'SPF屏障 · IVC独立通风' : '普通环境寄养'}
        </div>
      </div>
      <div style="font-size:11px;color:#16529b;margin-top:8px;display:flex;justify-content:space-between;border-top:1px dashed #e2e8f0;padding-top:4px;">
        <span>未占用</span>
        <span style="font-weight:600;">点击办理/排位 ›</span>
      </div>
    `
  } else if (isOccupied) {
    const days = occ?.start ? Math.max(1, daysBetween(occ.start, todayStr())) : 1
    const applicantName = order?.applicantName || '在养科研组'
    contentHtml = `
      <div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
          <strong style="font-size:14px;color:#0284c7;font-family:monospace;">${escapeHtml(cage.code)}</strong>
          <span style="font-size:11px;background:#e0f2fe;color:#0369a1;border:1px solid #bae6fd;padding:1px 6px;border-radius:3px;font-weight:600;">在养使用</span>
        </div>
        <div style="font-size:12px;color:#1e293b;font-weight:600;margin-bottom:2px;display:flex;align-items:center;gap:4px;">
          <span>${escapeHtml(applicantName)}</span>
        </div>
        <div style="font-size:11px;color:#475569;display:flex;align-items:center;gap:4px;">
          <span>${escapeHtml(feeding?.animalName || '实验鼠')}</span>
          <span style="font-size:11px;color:#64748b;">(${feeding?.quantity || cage.capacity}只)</span>
        </div>
      </div>
      <div style="font-size:11px;color:#0284c7;margin-top:8px;display:flex;justify-content:space-between;border-top:1px dashed #bae6fd;padding-top:4px;">
        <span>在架 <strong>${days}</strong> 天</span>
        <span style="font-weight:600;">查看档案 ›</span>
      </div>
    `
  } else if (isReserved) {
    const applicantName = resOrder?.applicantName || '已预留'
    contentHtml = `
      <div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
          <strong style="font-size:14px;color:#854d0e;font-family:monospace;">${escapeHtml(cage.code)}</strong>
          <span style="font-size:11px;background:#fef9c3;color:#a16207;border:1px solid #fde047;padding:1px 6px;border-radius:3px;font-weight:600;">预分配锁定</span>
        </div>
        <div style="font-size:12px;color:#1e293b;font-weight:600;margin-bottom:2px;">
          👤 ${escapeHtml(applicantName)}
        </div>
        <div style="font-size:11px;color:#854d0e;">
          保留至: <strong>${resOrder?.reserveExpireAt || '—'}</strong>
        </div>
      </div>
      <div style="font-size:11px;color:#a16207;margin-top:8px;display:flex;justify-content:space-between;border-top:1px dashed #fde047;padding-top:4px;">
        <span>拟入场 ${resOrder?.expectStartDate || '—'}</span>
        <span style="font-weight:600;">办理入住 ›</span>
      </div>
    `
  } else if (isCleaning) {
    contentHtml = `
      <div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
          <strong style="font-size:14px;color:#0284c7;font-family:monospace;">${escapeHtml(cage.code)}</strong>
          <span style="font-size:11px;background:#e0f2fe;color:#0369a1;border:1px solid #bae6fd;padding:1px 6px;border-radius:3px;font-weight:600;">待消杀</span>
        </div>
        <div style="font-size:12px;color:#0369a1;font-weight:600;margin-bottom:2px;">
          合笼 / 退出释放
        </div>
        <div style="font-size:11px;color:#64748b;">
          紫外臭氧熏蒸中
        </div>
      </div>
      <div style="font-size:11px;color:#0284c7;margin-top:8px;display:flex;justify-content:space-between;border-top:1px dashed #bae6fd;padding-top:4px;">
        <span>待恢复空闲</span>
        <span style="font-weight:600;">完成消杀 ›</span>
      </div>
    `
  } else {
    // disabled
    contentHtml = `
      <div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
          <strong style="font-size:14px;color:#64748b;font-family:monospace;">${escapeHtml(cage.code)}</strong>
          <span style="font-size:11px;background:#f1f5f9;color:#64748b;border:1px solid #e2e8f0;padding:1px 6px;border-radius:3px;">维护停用</span>
        </div>
        <div style="font-size:12px;color:#94a3b8;margin-bottom:4px;">
          暂停使用 / 设备检修
        </div>
        <div style="font-size:11px;color:#94a3b8;">
          ${escapeHtml(cage.note || '定期清洗消毒/检修')}
        </div>
      </div>
      <div style="font-size:11px;color:#64748b;margin-top:8px;display:flex;justify-content:space-between;border-top:1px dashed #e2e8f0;padding-top:4px;">
        <span>不可入驻</span>
        <span style="font-weight:600;">点击启用 ›</span>
      </div>
    `
  }

  const contentWrap = el('div', '', contentHtml)
  contentWrap.style.cssText = 'height:100%;display:flex;flex-direction:column;justify-content:space-between;'
  card.appendChild(contentWrap)

  card.addEventListener('click', () => {
    openCageDetailModal(cage, occ, feeding, order, resOrder)
  })

  return card
}

function openCageDetailModal(
  cage: Cage,
  occ?: CageOccupancy,
  feeding?: Feeding,
  order?: Order,
  resOrder?: Order,
): void {
  const isOccupied = cage.status === 'occupied'
  const isReserved = cage.status === 'reserved'
  const isCleaning = cage.status === 'cleaning'
  const isFree = cage.status === 'free'
  const isDisabled = cage.status === 'disabled'

  const locationDesc = `${cage.building || '云漫湖校区实验楼'} ➔ ${cage.floor || '1F'} ➔ ${cage.room} ➔ ${cage.rack || '默认机架'}`

  const items: [string, string][] = [
    ['笼位编号', `<strong>${escapeHtml(cage.code)}</strong>`],
    ['物理坐标', locationDesc],
    ['所在房间', cage.room],
    ['所在机架', cage.rack || '01号IVC小鼠笼架'],
    ['环境等级', cage.env === 'SPF' ? tagHtml('SPF级屏障环境（IVC独立送排风）', 'success') : tagHtml('普通环境', 'default')],
    ['容纳标准', `${cage.capacity} 只/笼`],
    [
      '当前状态',
      isOccupied
        ? tagHtml('在养使用', 'primary')
        : isReserved
          ? tagHtml('预分配锁定', 'warning')
          : isCleaning
            ? tagHtml('待消杀', 'primary')
            : isFree
              ? tagHtml('空闲可用', 'success')
              : tagHtml('维护停用', 'default'),
    ],
  ]

  if (isOccupied && feeding) {
    const days = occ?.start ? Math.max(1, daysBetween(occ.start, todayStr())) : 1
    const cost = days * 10
    items.push(['入场日期', occ?.start || '—'])
    items.push(['在架天数', `<strong>${days}</strong> 天`])
    items.push(['入驻课题组/人员', `<strong>${escapeHtml(order?.applicantName || '—')}</strong>`])
    items.push(['在养动物品系', `${escapeHtml(feeding.animalName)} (${feeding.quantity}只)`])
    items.push(['计费标准', '¥10.00 / 笼·天'])
    items.push(['累计预估饲养费', `<span style="color:#b91c1c;font-weight:700;">¥${cost.toFixed(2)}</span>`])
    items.push(['关联出库/饲养单', `<code>${order?.code || feeding.id}</code>`])
  } else if (isReserved) {
    items.push(['预留课题组/人员', `<strong>${escapeHtml(resOrder?.applicantName || '—')}</strong>`])
    items.push(['拟入住区间', `${resOrder?.expectStartDate || '—'} 至 ${resOrder?.expectEndDate || '—'}`])
    items.push(['2天保留截止时间', `<strong style="color:#d97706;">${resOrder?.reserveExpireAt || '—'} 23:59</strong>`])
    items.push(['保留风控说明', '自拟入场日起超期 2 天未办理入住，系统将自动释放'])
    items.push(['关联申请单', `<code>${resOrder?.code || '—'}</code>`])
  } else if (isCleaning) {
    items.push(['消杀原因', '合笼或退场释放，屏障物理消杀中'])
    items.push(['消杀要求', '紫外+臭氧熏蒸 24 小时'])
  } else if (isDisabled) {
    items.push(['停用原因/说明', cage.note || '设备例行维护与消毒'])
  }

  const grid = detailGrid(items, 3)

  const actions = []
  if (isOccupied) {
    actions.push({
      text: '📋 前往饲养管理（办理退场/领用）',
      primary: true,
      onClick: () => {
        navigate('/feeding')
      },
    })
  } else if (isReserved) {
    actions.push({
      text: '📋 前往待入场办理现场入住',
      primary: true,
      onClick: () => {
        navigate('/feeding')
      },
    })
  } else if (isCleaning) {
    actions.push({
      text: '🧼 完成消杀并恢复空闲',
      primary: true,
      onClick: () => {
        showResult(completeCageCleaning(cage.id))
        rerender()
      },
    })
  } else if (isFree) {
    actions.push({
      text: '➕ 前往待入场排位',
      primary: true,
      onClick: () => {
        navigate('/feeding')
      },
    })
    actions.push({
      text: '🔧 标记停用/维护',
      onClick: () => {
        showResult(setCageStatus(cage.id, 'disabled'))
        rerender()
      },
    })
  } else if (isDisabled) {
    actions.push({
      text: '✅ 恢复空闲启用',
      primary: true,
      onClick: () => {
        showResult(setCageStatus(cage.id, 'free'))
        rerender()
      },
    })
  }

  actions.push({ text: '关闭', onClick: () => {} })

  const dlg = openDialog({
    title: `笼位空间档案：${cage.code}（${isOccupied ? '在养占用' : isReserved ? '预分配锁定' : isCleaning ? '待消杀' : isFree ? '空闲可用' : '维护停用'}）`,
    bodyHtml: '',
    wide: true,
    actions,
  })

  const body = dlg.querySelector('.dlg__body') as HTMLElement
  grid.style.margin = '0 0 16px'
  body.appendChild(grid)

  // 历史占用流水
  const historyList = data()
    .occupancies.filter((o) => o.cageId === cage.id)
    .sort((a, b) => (a.start < b.start ? 1 : -1))

  if (historyList.length) {
    const histWrap = el('div')
    histWrap.innerHTML = `
      <div style="font-size:13px;font-weight:700;color:var(--c-title);margin-bottom:8px;">该笼位历史占用与流转记录</div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>入场日期</th>
              <th>结束日期</th>
              <th>使用单据</th>
              <th>变动原因</th>
              <th>操作实验师</th>
            </tr>
          </thead>
          <tbody>
            ${historyList
              .map((h) => {
                const f = data().feedings.find((feed) => feed.id === h.feedingId)
                const ord = f ? data().orders.find((o) => o.id === f.orderId) : undefined
                return `
                <tr>
                  <td>${h.start}</td>
                  <td>${h.end ? h.end : '<span style="color:#0284c7;font-weight:600;">在养占用中</span>'}</td>
                  <td>${ord?.code || f?.id || '—'}</td>
                  <td>${h.reason}</td>
                  <td>${h.operator}</td>
                </tr>
              `
              })
              .join('')}
          </tbody>
        </table>
      </div>
    `
    body.appendChild(histWrap)
  }
}
