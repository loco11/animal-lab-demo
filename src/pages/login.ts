/** 登录：选择身份与进入的实验室 */

import { manageableLabsOf, switchLab, switchUser, users } from '../core/auth'
import type { PageDef } from '../router'
import { navigate } from '../router'
import { el } from '../ui'

export const loginPage: PageDef = {
  title: '登录',
  render(host: HTMLElement) {
    const wrap = el('div', 'login-wrap')
    const box = el('div', 'login-box')
    box.style.maxWidth = '420px'
    box.innerHTML = `
      <div style="text-align:center;margin-bottom:20px;">
        <div style="display:inline-block;font-size:12px;font-weight:700;color:#16529b;background:#f0f5fb;border:1px solid #d4e3f5;padding:3px 12px;border-radius:4px;margin-bottom:8px;">
          贵州医科大学 · 实验动物中心
        </div>
        <h1 class="page-title" style="font-size:18px;font-weight:700;color:#0f172a;margin:0 0 6px 0;">校级实验室业务协同管理系统</h1>
        <p style="font-size:12px;color:#64748b;margin:0;">演示环境快速切换通道</p>
      </div>
    `

    const field = el('div', 'field')
    field.innerHTML = '<span class="field__label">选择演示账号</span>'
    const sel = el('select') as HTMLSelectElement
    users()
      .filter((u) => u.enabled && manageableLabsOf(u).length)
      .forEach((u) => {
        const op = el('option', '', `${u.name} · ${u.org} (${manageableLabsOf(u).map((l) => l.shortName).join('/')})`) as HTMLOptionElement
        op.value = u.id
        sel.appendChild(op)
      })
    field.appendChild(sel)

    const labField = el('div', 'field')
    labField.style.marginTop = '16px'
    labField.innerHTML = '<span class="field__label">进入的实验室 / 中心</span>'
    const labSel = el('select') as HTMLSelectElement

    function renderLabOptions(): void {
      labSel.innerHTML = ''
      const user = users().find((u) => u.id === sel.value)
      manageableLabsOf(user ?? users()[0]).forEach((l) => {
        const op = el('option', '', l.name) as HTMLOptionElement
        op.value = l.id
        labSel.appendChild(op)
      })
    }
    sel.addEventListener('change', renderLabOptions)
    renderLabOptions()
    labField.appendChild(labSel)

    const btn = el('button', 'btn btn-primary', '进入 PC 管理端') as HTMLButtonElement
    btn.style.width = '100%'
    btn.style.marginTop = '20px'
    btn.style.height = '38px'
    btn.style.fontSize = '14px'
    btn.addEventListener('click', () => {
      switchUser(sel.value)
      switchLab(labSel.value)
      navigate('/dashboard')
    })

    const navLinks = el('div', '')
    navLinks.style.display = 'flex'
    navLinks.style.justifyContent = 'space-between'
    navLinks.style.marginTop = '16px'
    navLinks.style.fontSize = '13px'
    navLinks.innerHTML = `
      <a href="#/hub" style="color:#16529b;font-weight:500;">返回业务大纲</a>
      <a href="#/mobile" style="color:#16529b;font-weight:500;">进入移动办事端 →</a>
    `

    box.appendChild(field)
    box.appendChild(labField)
    box.appendChild(btn)
    box.appendChild(navLinks)
    wrap.appendChild(box)
    host.appendChild(wrap)
  },
}
