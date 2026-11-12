/** 项目组管理：左侧为当前用户有权限的项目，右侧维护该项目的成员名单与经费情况 */

import { addMember, listManageableProjects, listMembers, projectFund, removeMember } from '../core/biz/project'
import { getCurrentUser } from '../core/auth'
import { escapeHtml, moneyText } from '../core/utils'
import type { Project, ProjectMember, ProjectStatus } from '../types'
import type { PageDef } from '../router'
import { rerender } from '../router'
import { confirmDialog, el, renderTable, tagHtml, type RowAction } from '../ui'
import { formDialog, pageShell } from '../ui/form'
import { runGuarded, showResult } from './common'

/** 当前选中的项目：模块级保存，重绘时保持选中 */
let selectedProjectId: string | null = null

const PROJECT_STATUS: Record<ProjectStatus, { text: string; tone: 'success' | 'default' | 'warning' }> = {
  active: { text: '在研', tone: 'success' },
  ended: { text: '已结题', tone: 'default' },
  paused: { text: '已暂停', tone: 'warning' },
}

export const projectPage: PageDef = {
  title: '项目组管理',
  render(host: HTMLElement) {
    const page = pageShell(host)

    const user = getCurrentUser()
    const isTeacher = user.code === 'teacher'
    const projects = listManageableProjects()

    if (!selectedProjectId || !projects.some((p) => p.id === selectedProjectId)) {
      selectedProjectId = projects[0]?.id ?? null
    }

    const layout = el('div', '')
    layout.style.display = 'flex'
    layout.style.gap = '16px'
    layout.style.alignItems = 'flex-start'

    const left = el('div', 'panel')
    left.style.width = '320px'
    left.style.flexShrink = '0'
    left.style.padding = '0'
    left.style.overflow = 'hidden'
    left.innerHTML = `<h2 class="panel-title" style="margin:16px 16px 8px;">${isTeacher ? '我的项目' : '全部项目'}</h2>`
    const listBox = el('div', '')
    listBox.style.padding = '0 8px 8px'
    if (!projects.length) {
      listBox.innerHTML = `<div class="state-area"><p class="state-area__text">${isTeacher ? '暂无由您负责的项目' : '暂无项目'}</p></div>`
    } else {
      projects.forEach((p) => {
        const active = p.id === selectedProjectId
        const usable = p.status === 'active'
        const fund = projectFund(p)
        const memberCount = listMembers(p.id).length
        const item = el('div', '')
        item.style.cssText = `padding:12px;border-radius:8px;cursor:pointer;margin-bottom:4px;${
          active ? 'background:#eef4ff;border:1px solid #bcd0fb;' : 'border:1px solid transparent;'
        }${usable ? '' : 'opacity:0.55;'}`
        item.innerHTML = `
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:6px;">
            <div style="font-weight:600;color:#0f172a;font-size:13px;line-height:1.4;">${escapeHtml(p.name)}</div>
            ${tagHtml(PROJECT_STATUS[p.status].text, PROJECT_STATUS[p.status].tone)}
          </div>
          <div style="color:#94a3b8;font-size:12px;margin-top:3px;">${escapeHtml(p.code)}</div>
          <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-top:8px;">
            <div>
              <div style="color:#94a3b8;font-size:11px;">可用余额</div>
              <div style="font-size:16px;font-weight:700;color:${fund.available > 0 ? '#059669' : '#94a3b8'};">${moneyText(fund.available)}</div>
            </div>
            <div style="color:#64748b;font-size:12px;">${memberCount} 名成员</div>
          </div>
        `
        item.addEventListener('click', () => {
          if (selectedProjectId === p.id) return
          selectedProjectId = p.id
          rerender()
        })
        listBox.appendChild(item)
      })
    }
    left.appendChild(listBox)

    const right = el('div', 'panel panel-table')
    right.style.flex = '1'
    right.style.minWidth = '0'

    const current = projects.find((p) => p.id === selectedProjectId)
    if (current) {
      right.appendChild(renderMemberPanel(current))
    } else {
      right.innerHTML = `<div class="state-area"><p class="state-area__text">请先在左侧选择一个项目</p></div>`
    }

    layout.appendChild(left)
    layout.appendChild(right)
    page.appendChild(layout)
  },
}

function renderMemberPanel(project: Project): HTMLElement {
  const members = listMembers(project.id)
  const fund = projectFund(project)
  const usable = project.status === 'active'
  const status = PROJECT_STATUS[project.status]

  const head = el('div', '')
  head.style.padding = '16px 16px 0'
  head.innerHTML = `
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;">
      <div>
        <div style="font-size:15px;font-weight:700;color:#0f172a;">
          ${escapeHtml(project.name)}
          <span style="margin-left:6px;">${tagHtml(status.text, status.tone)}</span>
        </div>
        <div style="color:#64748b;font-size:12px;margin-top:4px;">${escapeHtml(project.code)} ｜ 负责人：${escapeHtml(project.owner)}</div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;">
        <span class="hint">成员 ${members.length} 人</span>
        <button class="btn btn-primary" data-act="add"${usable ? '' : ' disabled'}>添加成员</button>
      </div>
    </div>
    <div style="display:flex;gap:20px;flex-wrap:wrap;background:#f8fafc;border:1px solid #eef2f7;border-radius:8px;padding:10px 14px;margin-top:12px;">
      <div style="font-size:12px;color:#64748b;">经费总额 <strong style="color:#0f172a;margin-left:4px;">${moneyText(fund.total)}</strong></div>
      <div style="font-size:12px;color:#64748b;">已划扣 <strong style="color:#0f172a;margin-left:4px;">${moneyText(fund.spent)}</strong></div>
      <div style="font-size:12px;color:#64748b;">预冻结 <strong style="color:#b45309;margin-left:4px;">${moneyText(fund.frozen)}</strong></div>
      <div style="font-size:12px;color:#64748b;">可用余额 <strong style="color:${fund.available > 0 ? '#059669' : '#94a3b8'};margin-left:4px;">${moneyText(fund.available)}</strong></div>
      <div style="font-size:12px;color:#64748b;">来源 <strong style="color:#0f172a;margin-left:4px;">${escapeHtml(project.fundSource)}</strong></div>
    </div>
    <div style="height:1px;background:#eef2f7;margin:14px 0 0;"></div>
  `
  const addBtn = head.querySelector('button[data-act="add"]') as HTMLButtonElement | null
  addBtn?.addEventListener('click', () => {
    runGuarded('project:edit', () => openAddMember(project))
  })
  if (!usable && addBtn) {
    addBtn.title = status.text === '已结题' ? '该项目已结题，无法添加成员' : '该项目已暂停，无法添加成员'
  }

  const tableHost = el('div', '')
  renderTable<ProjectMember>(
    tableHost,
    {
      cols: [
        { key: 'name', title: '姓名', width: '120px' },
        { key: 'no', title: '学工号', width: '140px' },
        { key: 'org', title: '所属单位', ellipsis: true },
        { key: 'createdAt', title: '加入时间', width: '120px' },
      ],
      rows: members,
      actions: (m) => [{ text: '移除', act: 'remove', danger: true }] as RowAction[],
      emptyText: usable ? '该项目暂无成员，点击右上角「添加成员」' : '该项目暂无成员',
    },
    {
      onAction: (act, row) => {
        if (act === 'remove') runGuarded('project:edit', () => confirmRemove(row))
      },
    },
  )

  head.appendChild(tableHost)
  return head
}

function openAddMember(project: Project): void {
  formDialog(
    `添加成员：${project.name}`,
    [
      { kind: 'text', key: 'name', label: '姓名', required: true, placeholder: '如：张立' },
      { kind: 'text', key: 'no', label: '学工号', required: true, placeholder: '如：202409012' },
      { kind: 'text', key: 'org', label: '所属单位', placeholder: '如：基础医学院', full: true },
    ],
    (values) => {
      const result = addMember(project.id, {
        name: values.name,
        no: values.no,
        org: values.org,
      })
      showResult(result)
      return result.ok
    },
    '保存',
  )
}

async function confirmRemove(member: ProjectMember): Promise<void> {
  const ok = await confirmDialog('移除成员', `确定将「${member.name}（${member.no}）」移出该项目？移除后将无法再申用该项目经费。`, '移除')
  if (ok) showResult(removeMember(member.id))
}
