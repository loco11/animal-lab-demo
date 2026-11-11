/**
 * 业务流转大纲与场景架构看板（Hub）
 * 供汇报前梳理业务场景与架构，讲清管理端与移动端的业务分工与协同闭环。
 */

import { navigate } from '../router'
import { el } from '../ui'

export function hubPage(host: HTMLElement): void {
  let activeTab: 'admin' | 'student' = 'admin'

  const container = el('div', 'hub-root')

  function render(): void {
    container.innerHTML = `
      <div class="hub-container">
        <!-- 头部公文标识 -->
        <div class="hub-header">
          <div class="hub-badge-group">
            <span>贵州医科大学</span>
            <span>·</span>
            <span>贵州省实验动物工程技术中心</span>
          </div>
          <h1 class="hub-title">实验动物综合业务管理系统 · 协同流转与统一结算大纲</h1>
          <p class="hub-subtitle">
            依据贵州医科大学动物实验业务及全校统一结算体系调研建设。覆盖校内自产供应、外部合规订购、动物动态饲养计费及科研项目统一结算全流程。
          </p>
        </div>

        <!-- 视图切换（管理端 vs 移动办事端） -->
        <div class="hub-tab-bar">
          <div class="hub-segmented">
            <button class="hub-tab-btn ${activeTab === 'admin' ? 'is-active' : ''}" data-tab="admin">
              管理端业务协同矩阵 (PC)
            </button>
            <button class="hub-tab-btn ${activeTab === 'student' ? 'is-active' : ''}" data-tab="student">
              师生在线办事服务 (移动端)
            </button>
          </div>
        </div>

        <!-- 场景内容区 -->
        <div class="hub-content"></div>
      </div>
    `

    const content = container.querySelector('.hub-content') as HTMLElement
    const tabBtns = container.querySelectorAll('.hub-tab-btn')

    tabBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const tab = btn.getAttribute('data-tab') as 'admin' | 'student'
        if (tab && tab !== activeTab) {
          activeTab = tab
          render()
        }
      })
    })

    if (activeTab === 'admin') {
      renderAdminScenarios(content)
    } else {
      renderStudentScenarios(content)
    }
  }

  function renderAdminScenarios(host: HTMLElement): void {
    host.innerHTML = `
      <div class="hub-grid">
        <!-- 矩阵 1 -->
        <div class="hub-card">
          <div class="hub-card__top">
            <span class="hub-card__tag is-blue">业务矩阵 01</span>
            <span class="hub-card__num">MOD-STOCK</span>
          </div>
          <h3 class="hub-card__title">校内自产实验动物：台账管理与出库闭环</h3>
          <p class="hub-card__desc">
            针对中心内部繁殖生产的常规小鼠（KM/SD），实现批次规格台账、出库防超扣与唯一流水管理。
          </p>
          <div class="hub-flow">
            <span class="hub-flow__step">师生在线申请</span>
            <span class="hub-flow__arrow">→</span>
            <span class="hub-flow__step">中心审核确认</span>
            <span class="hub-flow__arrow">→</span>
            <span class="hub-flow__step">仓库出库</span>
            <span class="hub-flow__arrow">→</span>
            <span class="hub-flow__step">扣减库存生成费用</span>
          </div>
          <div class="hub-card__rule">
            <strong>管理规则：</strong>审核通过不等于交付完成。必须由管理员核验并完成出库后扣减库存并流转至结算，库存不足实时阻断。
          </div>
        </div>

        <!-- 矩阵 2 -->
        <div class="hub-card">
          <div class="hub-card__top">
            <span class="hub-card__tag is-amber">业务矩阵 02</span>
            <span class="hub-card__num">MOD-PURCHASE</span>
          </div>
          <h3 class="hub-card__title">外购特种实验动物：汇总订购与合规到校交接</h3>
          <p class="hub-card__desc">
            针对裸鼠、基因敲除鼠等特种品系，由管理员汇总需求统一发送入围供应商，学生线下到校直接交接。
          </p>
          <div class="hub-flow">
            <span class="hub-flow__step">汇总外购需求</span>
            <span class="hub-flow__arrow">→</span>
            <span class="hub-flow__step">按供应商形成批次</span>
            <span class="hub-flow__arrow">→</span>
            <span class="hub-flow__step">导出清单发送</span>
            <span class="hub-flow__arrow">→</span>
            <span class="hub-flow__step">线下交接/异常登记</span>
          </div>
          <div class="hub-card__rule">
            <strong>管理规则：</strong>外购动物绝不进入中心内部库存；管理端进度停留在“已发送供应商”，支持少供/死亡等异常工单留痕闭环。
          </div>
        </div>

        <!-- 矩阵 3 -->
        <div class="hub-card">
          <div class="hub-card__top">
            <span class="hub-card__tag is-emerald">业务矩阵 03</span>
            <span class="hub-card__num">MOD-FEEDING</span>
          </div>
          <h3 class="hub-card__title">实验动物饲养与屏障笼位：动态切段精准计费</h3>
          <p class="hub-card__desc">
            对动物房、笼架及 SPF 独立通风笼位进行空间资源建模，支撑在养期间分笼增减与周期性结算。
          </p>
          <div class="hub-flow">
            <span class="hub-flow__step">线下携动物入场</span>
            <span class="hub-flow__arrow">→</span>
            <span class="hub-flow__step">分配空闲屏障笼位</span>
            <span class="hub-flow__arrow">→</span>
            <span class="hub-flow__step">在养期间笼位增减</span>
            <span class="hub-flow__arrow">→</span>
            <span class="hub-flow__step">退出时区间切段计费</span>
          </div>
          <div class="hub-card__rule">
            <strong>管理规则：</strong>订购与饲养业务严格独立。笼位计费按“实际占用笼位数 × 占用天数 × 环境基准单价”精准切段累计。
          </div>
        </div>

        <!-- 矩阵 4 -->
        <div class="hub-card">
          <div class="hub-card__top">
            <span class="hub-card__tag is-purple">业务矩阵 04</span>
            <span class="hub-card__num">MOD-SETTLE</span>
          </div>
          <h3 class="hub-card__title">学校统一结算：科研项目经费直连与扣款</h3>
          <p class="hub-card__desc">
            业务费用统一归集并对接学校财务科研项目系统，具备幂等防重、失败重试及外部客户账目隔离。
          </p>
          <div class="hub-flow">
            <span class="hub-flow__step">业务费用统一归集</span>
            <span class="hub-flow__arrow">→</span>
            <span class="hub-flow__step">核对科研经费编号</span>
            <span class="hub-flow__arrow">→</span>
            <span class="hub-flow__step">调用统一结算接口</span>
            <span class="hub-flow__arrow">→</span>
            <span class="hub-flow__step">生成财务划转凭证</span>
          </div>
          <div class="hub-card__rule">
            <strong>管理规则：</strong>独立封装学校接口适配层（schoolapi.ts），校外单位与附属医院独立标记为外部结算待确认。
          </div>
        </div>
      </div>

      <!-- 操作横幅 -->
      <div class="hub-action-banner">
        <div class="hub-action-banner__info">
          <h3>进入管理端业务系统走查</h3>
          <p>涵盖概览大盘、服务配置、订单管理、库存流水、采购批次、饲养笼位、费用结算与多角色权限等 12 个功能页面。</p>
        </div>
        <button class="hub-launch-btn" id="btn-enter-admin">
          <span>进入 PC 管理端</span>
          <span>→</span>
        </button>
      </div>
    `

    host.querySelector('#btn-enter-admin')?.addEventListener('click', () => {
      navigate('/dashboard')
    })
  }

  function renderStudentScenarios(host: HTMLElement): void {
    host.innerHTML = `
      <div class="hub-grid">
        <!-- 事项 1 -->
        <div class="hub-card">
          <div class="hub-card__top">
            <span class="hub-card__tag is-blue">申办服务 01</span>
            <span class="hub-card__num">SVC-01</span>
          </div>
          <h3 class="hub-card__title">校内实验动物订购申请</h3>
          <p class="hub-card__desc">
            研究生及实验人员在线填报 KM小鼠、SD大鼠申购需求，系统自动校验并关联导师科研项目经费号。
          </p>
          <div class="hub-flow">
            <span class="hub-flow__step">选择实验品系规格</span>
            <span class="hub-flow__arrow">→</span>
            <span class="hub-flow__step">录入所需数量</span>
            <span class="hub-flow__arrow">→</span>
            <span class="hub-flow__step">自动绑定课题经费</span>
            <span class="hub-flow__arrow">→</span>
            <span class="hub-flow__step">提交中心审核</span>
          </div>
          <div class="hub-card__rule">
            <strong>管理规范：</strong>支持按照 4周龄、6周龄等标准规格申报，替代传统手工单据与微信登记。
          </div>
        </div>

        <!-- 事项 2 -->
        <div class="hub-card">
          <div class="hub-card__top">
            <span class="hub-card__tag is-amber">申办服务 02</span>
            <span class="hub-card__num">SVC-02</span>
          </div>
          <h3 class="hub-card__title">外购特种实验动物申购</h3>
          <p class="hub-card__desc">
            针对中心无法自给的特殊品系（如裸鼠、免疫缺陷鼠），支持课题组提前报备需求与期望送达校区。
          </p>
          <div class="hub-flow">
            <span class="hub-flow__step">选择特种品系</span>
            <span class="hub-flow__arrow">→</span>
            <span class="hub-flow__step">指定送达校区</span>
            <span class="hub-flow__arrow">→</span>
            <span class="hub-flow__step">汇总发供应商</span>
            <span class="hub-flow__arrow">→</span>
            <span class="hub-flow__step">到校凭通知自提</span>
          </div>
          <div class="hub-card__rule">
            <strong>管理规范：</strong>严格按照学校入围供应商采购规范执行，支持到货异常反馈代登记。
          </div>
        </div>

        <!-- 事项 3 -->
        <div class="hub-card">
          <div class="hub-card__top">
            <span class="hub-card__tag is-emerald">申办服务 03</span>
            <span class="hub-card__num">SVC-03</span>
          </div>
          <h3 class="hub-card__title">实验动物饲养及笼位预约申请</h3>
          <p class="hub-card__desc">
            填报实验动物进驻屏障环境（IVC/SPF）饲养需求，预估笼位数与饲养周期，支撑线下入场核验。
          </p>
          <div class="hub-flow">
            <span class="hub-flow__step">选择屏障环境级别</span>
            <span class="hub-flow__arrow">→</span>
            <span class="hub-flow__step">预估笼位与天数</span>
            <span class="hub-flow__arrow">→</span>
            <span class="hub-flow__step">线下携动物核验</span>
            <span class="hub-flow__arrow">→</span>
            <span class="hub-flow__step">现场绑定空闲笼位</span>
          </div>
          <div class="hub-card__rule">
            <strong>管理规范：</strong>必须由申请人本人携动物到中心核验并办理实际入场，保障生物安全隔离。
          </div>
        </div>

        <!-- 事项 4 -->
        <div class="hub-card">
          <div class="hub-card__top">
            <span class="hub-card__tag is-purple">协同闭环</span>
            <span class="hub-card__num">SYS-SYNC</span>
          </div>
          <h3 class="hub-card__title">移动办事与管理端即时协同机制</h3>
          <p class="hub-card__desc">
            移动端填报的办件实时推送至管理端待办池；管理端出库或排笼后，移动端时间轴即时更新反馈。
          </p>
          <div class="hub-card__rule" style="border-left-color:#7e22ce;">
            <strong>现场演示重点：</strong>可在移动端提交申请后，切到管理端执行审核出库，再切回移动端查看进度推进，完成全流程实机验证。
          </div>
        </div>
      </div>

      <!-- 操作横幅 -->
      <div class="hub-action-banner" style="background:#0f5132;">
        <div class="hub-action-banner__info">
          <h3>查看移动端办事服务模拟界面</h3>
          <p>模拟贵州医科大学企业微信微应用，支持师生在线填报动物申购并跟踪办件审批进度。</p>
        </div>
        <button class="hub-launch-btn" id="btn-enter-mobile" style="color: #0f5132;">
          <span>打开移动端办事大厅</span>
          <span>→</span>
        </button>
      </div>
    `

    host.querySelector('#btn-enter-mobile')?.addEventListener('click', () => {
      navigate('/mobile')
    })
  }

  render()
  host.appendChild(container)
}
