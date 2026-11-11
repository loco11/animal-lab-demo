/** 服务管理页面 */

import { listServices, saveService, toggleSale } from '../core/biz/service'
import { categoryDef } from '../core/biz/stock'
import { listSupplierItems } from '../core/biz/purchase'
import { showResult, buildQuery, runGuarded } from './common'
import { escapeHtml, moneyText, parseYuan } from '../core/utils'
import { AUDIT_MODE_TEXT } from '../core/labels'
import { data, scoped } from '../core/data'
import type { AuditMode, Service } from '../types'
import type { PageDef } from '../router'
import { rerender } from '../router'
import { el, renderPager, renderTable, tagHtml, toast, type RowAction } from '../ui'
import { formDialog, pageShell } from '../ui/form'

const view = {
  page: 1,
  pageSize: 10,
  filters: {} as Record<string, string>,
}

export const servicePage: PageDef = {
  title: '服务管理',
  render(host: HTMLElement) {
    const page = pageShell(host, {
    })

    const query = buildQuery(
      [
        { key: 'name', label: '服务名称', type: 'text', placeholder: '服务名称' },
        {
          key: 'type',
          label: '服务类型',
          type: 'select',
          options: [
            { value: 'animal_internal', label: '自产动物（出库）' },
            { value: 'animal_external', label: '外购动物（集采）' },
            { value: 'breeding', label: '饲养寄养（笼位）' },
          ],
        },
        {
          key: 'onSale',
          label: '上架状态',
          type: 'select',
          options: [
            { value: '1', label: '已上架' },
            { value: '0', label: '已下架' },
          ],
        },
      ],
      view.filters,
      (values) => {
        view.filters = values
        view.page = 1
        toast('已应用查询条件', 'info')
        rerender()
      },
      () => {
        view.filters = {}
        view.page = 1
        toast('查询条件已重置', 'info')
        rerender()
      },
    )
    page.appendChild(query.node)

    const toolbar = el('div', 'toolbar')
    toolbar.innerHTML =
      '<div class="toolbar__actions"><button class="btn btn-primary" data-act="create">新增服务</button></div>'
    toolbar.querySelector('button[data-act="create"]')?.addEventListener('click', () => {
      runGuarded('service:edit', () => openEdit())
    })

    const rows = filtered()
    // 规范 5／7 章：工具栏与表格共用一个白色容器
    const tableHost = el('div', 'panel panel-table')
    tableHost.appendChild(toolbar)
    renderTable<Service>(
      tableHost,
      {
        cols: [
          { key: 'name', title: '服务名称', width: '180px' },
          {
            key: 'type',
            title: '服务类型',
            width: '95px',
            render: (r) => {
              if (r.type === 'breeding') return tagHtml('饲养寄养', 'primary')
              return r.stockItemId ? tagHtml('自产动物', 'success') : tagHtml('外购代采', 'warning')
            },
          },
          { key: 'spec', title: '规格型号', ellipsis: true },
          {
            key: 'price',
            title: '收费标准',
            render: (r) => `<strong>${moneyText(r.unitPriceFen)}</strong> <span class="hint">/ ${r.unit}</span>`,
          },
          { key: 'audit', title: '审核方式', width: '100px', render: (r) => AUDIT_MODE_TEXT[r.auditMode] },
          {
            key: 'stock',
            title: '履约模式 / 关联',
            ellipsis: true,
            render: (r) => {
              if (r.type === 'breeding') return '<span class="hint" style="color:#0369a1;">笼位按日结算</span>'
              if (r.stockItemId) return `自繁自育 <span class="hint">(${stockName(r.id)})</span>`
              const sName = supplierName(r.supplierId)
              const sShort = shortSupplierName(r.supplierId)
              return `<span title="签约供货商：${sName}">厂商直送 <span class="hint" style="color:#b45309;">(${sShort})</span></span>`
            },
          },
          {
            key: 'onSale',
            title: '状态',
            width: '80px',
            render: (r) => (r.onSale ? tagHtml('已上架', 'success') : tagHtml('已下架', 'default')),
          },
        ],
        rows,
        actions: (r) => [
          { text: '编辑', act: 'edit' },
          r.onSale
            ? { text: '下架', act: 'off', danger: true }
            : { text: '上架', act: 'on' },
        ] as RowAction[],
        queryActive: Object.values(view.filters).some(Boolean),
        emptyText: '当前实验室暂无服务，可点击“新增服务”添加',
      },
      {
        onAction: (act, row) => {
          if (act === 'edit') runGuarded('service:edit', () => openEdit(row))
          if (act === 'on') runGuarded('service:edit', () => showResult(toggleSale(row.id, true)))
          if (act === 'off') runGuarded('service:edit', () => showResult(toggleSale(row.id, false)))
        },
      },
    )
    page.appendChild(tableHost)

    // 规范 2 章：分页在白色容器内、表格下方
    renderPager(tableHost, {
      total: rows.length,
      page: view.page,
      pageSize: view.pageSize,
      onChange: (p, size) => {
        view.page = p
        view.pageSize = size
        rerender()
      },
    })
  },
}

function filtered(): Service[] {
  let list = listServices()
  const { name, type, onSale } = view.filters
  if (name) list = list.filter((s) => s.name.includes(name))
  if (type === 'animal_internal') list = list.filter((s) => s.type === 'animal' && Boolean(s.stockItemId))
  else if (type === 'animal_external') list = list.filter((s) => s.type === 'animal' && !s.stockItemId)
  else if (type === 'breeding') list = list.filter((s) => s.type === 'breeding')
  else if (type === 'animal') list = list.filter((s) => s.type === 'animal')

  if (onSale === '1') list = list.filter((s) => s.onSale)
  if (onSale === '0') list = list.filter((s) => !s.onSale)
  const start = (view.page - 1) * view.pageSize
  return list.slice(start, start + view.pageSize)
}

function stockName(serviceId: string): string {
  const service = data().services.find((s) => s.id === serviceId)
  if (!service?.stockItemId) return '—'
  return data().stockItems.find((s) => s.id === service.stockItemId)?.name ?? '—'
}

function supplierName(supplierId?: string): string {
  if (!supplierId) return '—'
  return data().suppliers.find((s) => s.id === supplierId)?.name ?? '—'
}

function shortSupplierName(supplierId?: string): string {
  const full = supplierName(supplierId)
  if (full === '—') return '未指定'
  return full.replace('有限公司', '').replace('技术', '').replace('实验动物', '')
}

function openEdit(service?: Service): void {
  const animalItems = scoped(data().stockItems)
    .filter((s) => categoryDef(s.category)?.isAnimal)
    .map((s) => ({ value: s.id, label: `${s.name}（${s.spec}）` }))

  const supplierOptions = scoped(data().suppliers)
    .filter((s) => s.enabled)
    .map((s) => ({ value: s.id, label: s.name }))

  const currentCategory = service
    ? service.type === 'breeding'
      ? 'breeding'
      : service.stockItemId
        ? 'animal_internal'
        : 'animal_external'
    : 'animal_internal'

  const COMMON_UNITS = [
    { value: '只', label: '只（实验小鼠/大鼠/常规动物）' },
    { value: '笼·天', label: '笼·天（IVC独立通风笼位饲养）' },
    { value: '只·天', label: '只·天（大动物/单只饲养）' },
    { value: '张', label: '张（病理切片/组织染色）' },
    { value: '样', label: '样（生化/血液/病原检测）' },
    { value: '小时', label: '小时（大型仪器机时）' },
    { value: '次', label: '次（场地预约/处置服务）' },
    { value: '份', label: '份（综合检测包/审查批件）' },
    { value: '盒', label: '盒（实验耗材/特殊试剂）' },
  ]

  const defaultUnit = service?.unit || (currentCategory === 'breeding' ? '笼·天' : '只')
  // 若历史服务单位不在常用列表中，追加进选项保持回显
  const unitOptions = COMMON_UNITS.some((u) => u.value === defaultUnit)
    ? COMMON_UNITS
    : [{ value: defaultUnit, label: defaultUnit }, ...COMMON_UNITS]

  formDialog(
    service ? `编辑服务：${service.name}` : '新增服务',
    [
      { kind: 'text', key: 'name', label: '服务名称', value: service?.name ?? '', required: true, placeholder: '如：C57BL/6J 小鼠、IVC独立通气笼位饲养' },
      {
        kind: 'select',
        key: 'categoryMode',
        label: '服务类型',
        value: currentCategory,
        options: [
          { value: 'animal_internal', label: '自产动物（出库核销，需关联库存）' },
          { value: 'animal_external', label: '外购动物（汇入采购池，厂商直送）' },
          { value: 'breeding', label: '饲养寄养（占用笼位，按日结算）' },
        ],
        required: true,
      },
      { kind: 'text', key: 'spec', label: '规格型号', value: service?.spec ?? '', placeholder: '如：SPF级，6~8周龄、带IVC通风主机' },
      {
        kind: 'select',
        key: 'unit',
        label: '计价单位',
        value: defaultUnit,
        required: true,
        options: unitOptions,
      },
      {
        kind: 'text',
        key: 'price',
        label: '单价（元）',
        value: service ? String(service.unitPriceFen / 100) : '',
        required: true,
        placeholder: '如：48.00',
      },
      {
        kind: 'select',
        key: 'auditMode',
        label: '审核方式',
        value: service?.auditMode ?? 'system',
        options: [
          { value: 'none', label: '无需审核' },
          { value: 'system', label: '系统内确认' },
          { value: 'hall', label: '服务大厅审批' },
        ],
        required: true,
      },
      {
        kind: 'select',
        key: 'onSale',
        label: '上架状态',
        value: service ? (service.onSale ? '1' : '0') : '1',
        options: [
          { value: '1', label: '已上架' },
          { value: '0', label: '已下架' },
        ],
        required: true,
      },
      {
        kind: 'select',
        key: 'stockItemId',
        label: '关联动物库存品目',
        value: service?.stockItemId ?? '',
        options: animalItems,
        placeholder: '仅【自产动物】需要选择库存品目',
      },
      {
        kind: 'select',
        key: 'supplierId',
        label: '入围合作供货商',
        value: service?.supplierId ?? '',
        options: supplierOptions,
        placeholder: '仅【外购动物】需选择签约供货商',
      },
      {
        kind: 'select',
        key: 'supplierItemId',
        label: '供应条目（品系）',
        value: service?.supplierItemId ?? '',
        options: [],
        placeholder: '选择供应商后加载其动物品系',
      },
      { kind: 'textarea', key: 'applyNote', label: '申请说明', value: service?.applyNote ?? '', full: true, placeholder: '供师生在办事大厅查看的申请须知或实验注意事项...' },
      { kind: 'note', text: '保存后新订单使用当前单价；历史订单与已生成费用保持原价格快照。', full: true },
    ],
    (values) => {
      const fen = parseYuan(values.price)
      if (fen === null) {
        toast('请输入合法单价', 'error')
        return false
      }
      let realType: 'animal' | 'breeding' = 'animal'
      let realStockItemId: string | undefined = undefined
      let realSupplierId: string | undefined = undefined

      if (values.categoryMode === 'breeding') {
        realType = 'breeding'
      } else if (values.categoryMode === 'animal_internal') {
        realType = 'animal'
        realStockItemId = values.stockItemId || undefined
        if (!realStockItemId) {
          toast('自产动物必须选择关联的动物库存品目', 'warning')
          return false
        }
      } else {
        realType = 'animal'
        realSupplierId = values.supplierId || undefined
        if (!realSupplierId) {
          toast('外购动物代采必须关联入围合作供货商', 'warning')
          return false
        }
        if (!values.supplierItemId) {
          toast('外购动物必须选择该供应商的供应条目（品系）', 'warning')
          return false
        }
      }

      const result = saveService({
        id: service?.id,
        name: values.name,
        type: realType,
        spec: values.spec,
        unit: values.unit,
        unitPriceFen: fen,
        auditMode: values.auditMode as AuditMode,
        onSale: values.onSale === '1',
        applyNote: values.applyNote,
        stockItemId: realStockItemId,
        supplierId: realSupplierId,
        supplierItemId: values.categoryMode === 'animal_external' ? values.supplierItemId : undefined,
      })
      showResult(result)
      return result.ok
    },
    '保存',
    (formNode) => {
      const getCtrl = (k: string) =>
        formNode.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(`[data-key="${k}"]`)

      const handleCategoryChange = (mode: string) => {
        const stockSelect = getCtrl('stockItemId') as HTMLSelectElement | null
        const supplierSelect = getCtrl('supplierId') as HTMLSelectElement | null
        const unitSelect = getCtrl('unit') as HTMLSelectElement | null
        const noteInput = getCtrl('applyNote') as HTMLTextAreaElement | null
        if (!stockSelect) return
        const stockField = stockSelect.closest('.field') as HTMLElement | null
        const supplierField = supplierSelect?.closest('.field') as HTMLElement | null
        const toggleField = (el: HTMLElement | null, show: boolean) => {
          if (el) el.style.display = show ? '' : 'none'
        }
        // 外购动物无库存：隐藏库存品目字段；自产动物无供应商：隐藏供货商字段
        toggleField(stockField, mode === 'animal_internal')
        toggleField(supplierField, mode === 'animal_external')

        if (mode === 'animal_internal') {
          stockSelect.disabled = false
          if (!stockSelect.value && animalItems[0]) stockSelect.value = animalItems[0].value
          if (supplierSelect) {
            supplierSelect.value = ''
            supplierSelect.disabled = true
          }
          if (unitSelect && (!unitSelect.value || unitSelect.value === '笼·天')) unitSelect.value = '只'
          if (!service && noteInput && (!noteInput.value || noteInput.value.includes('集采代报') || noteInput.value.includes('在架实际笼位数'))) {
            noteInput.value = '中心动物房自繁自育，实验员凭单在中心102库房核销出库。'
          }
        } else if (mode === 'animal_external') {
          stockSelect.value = ''
          stockSelect.disabled = true
          if (supplierSelect) {
            supplierSelect.disabled = false
            if (!supplierSelect.value && supplierOptions[0]) supplierSelect.value = supplierOptions[0].value
          }
          if (unitSelect && (!unitSelect.value || unitSelect.value === '笼·天')) unitSelect.value = '只'
          if (!service && noteInput && (!noteInput.value || noteInput.value.includes('自繁自育') || noteInput.value.includes('在架实际笼位数'))) {
            noteInput.value = '外部供应商集采代报，每周一/周四统一发厂商，厂商送货直接电话联系学生交接。'
          }
        } else if (mode === 'breeding') {
          stockSelect.value = ''
          stockSelect.disabled = true
          if (supplierSelect) {
            supplierSelect.value = ''
            supplierSelect.disabled = true
          }
          if (unitSelect && (!unitSelect.value || unitSelect.value === '只')) unitSelect.value = '笼·天'
          if (!service && noteInput && (!noteInput.value || noteInput.value.includes('自繁自育') || noteInput.value.includes('集采代报'))) {
            noteInput.value = '按在架实际笼位数与天数分段计费，出场时清算总费用。'
          }
        }
      }

      const itemSelect = getCtrl('supplierItemId') as HTMLSelectElement | null
      const specInput = getCtrl('spec') as HTMLInputElement | null
      const unitInput = getCtrl('unit') as HTMLInputElement | null
      const priceInput = getCtrl('price') as HTMLInputElement | null
      const supplierSelect = getCtrl('supplierId') as HTMLSelectElement | null

      const fillItems = () => {
        if (!itemSelect || !supplierSelect) return
        const items = listSupplierItems(supplierSelect.value).filter((i) => i.kind === 'animal' && i.enabled)
        const keep = itemSelect.value
        itemSelect.innerHTML =
          '<option value="">请选择供应条目</option>' +
          items
            .map((i) => `<option value="${i.id}">${i.code}｜${escapeHtml(i.name)}（${escapeHtml(i.spec)}，${(i.priceFen / 100).toFixed(2)}元/${escapeHtml(i.unit)}）</option>`)
            .join('')
        itemSelect.value = items.some((i) => i.id === keep) ? keep : ''
        if (itemSelect.value) applyItem()
      }
      const applyItem = () => {
        if (!itemSelect) return
        const item = listSupplierItems().find((i) => i.id === itemSelect.value)
        if (!item) return
        if (specInput) specInput.value = item.spec
        if (unitInput) unitInput.value = item.unit
        if (priceInput) priceInput.value = (item.priceFen / 100).toFixed(2)
      }
      supplierSelect?.addEventListener('change', fillItems)
      itemSelect?.addEventListener('change', applyItem)
      if (supplierSelect) fillItems()

      const catSelect = getCtrl('categoryMode') as HTMLSelectElement | null
      if (catSelect) {
        catSelect.addEventListener('change', () => {
          handleCategoryChange(catSelect.value)
        })
        handleCategoryChange(catSelect.value)
      }
    },
  )
}
