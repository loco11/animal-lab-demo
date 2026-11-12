/**
 * 版本化种子数据：演示的可复现基础。
 * 所有实体均携带稳定 ID 与 labId；两个实验室放置相似名称的数据，用于验证稳定 ID 与隔离。
 * 人名、单位、金额、课题均为明确虚构，不代表学校真实业务。
 */

import { addDays, todayStr } from './utils'
import type {
  AppState,
  AuditStatus,
  Cage,
  CageOccupancy,
  ChargeRequest,
  Customer,
  DemoData,
  Fee,
  Feeding,
  Lab,
  MenuNode,
  Order,
  OrderEvent,
  OrderKind,
  Project,
  PurchaseAnomaly,
  PurchaseBatch,
  Role,
  Service,
  StockCategoryDef,
  StockCheck,
  StockFlow,
  StockItem,
  Supplier,
  SupplierItem,
  User,
} from '../types'

export const SEED_VERSION = 21

/** 演示基准日：种子数据围绕该日期编排，保证演示脚本可重复执行 */
export const DEMO_TODAY = '2026-10-25'

export const LABS: Lab[] = [
  { id: 'animal', name: '实验动物中心', shortName: '动物中心', note: '即贵州省实验动物工程技术中心' },
  {
    id: 'analysis',
    name: '分析测试中心',
    shortName: '分析中心',
    note: '动物业务独立配置',
  },
]

/* ---------------- 菜单 ---------------- */

/** 已实现的页面入口：菜单维护只能从这里选择，避免生成失效链接 */
export const ROUTE_OPTIONS: { path: string; title: string }[] = [
  { path: '/dashboard', title: '业务概览' },
  { path: '/service', title: '服务管理' },
  { path: '/order', title: '订单管理' },
  { path: '/order/internal', title: '内部动物订购' },
  { path: '/stock', title: '库存管理' },
  { path: '/purchase', title: '外购汇总' },
  { path: '/supplier', title: '供应商管理' },
  { path: '/feeding', title: '饲养管理' },
  { path: '/cage', title: '笼位管理' },
  { path: '/fee', title: '费用结算' },
  { path: '/system/menu', title: '菜单管理' },
  { path: '/system/role', title: '角色管理' },
  { path: '/system/user', title: '用户管理' },
]

/** 全部操作权限标识：菜单树中的操作项由这里生成 */
export const ACTION_OPTIONS: { key: string; title: string; parent: string }[] = [
  { key: 'service:edit', title: '服务新增编辑', parent: 'm_service' },
  { key: 'order:create', title: '代录订单', parent: 'm_order' },
  { key: 'order:approve', title: '订单审核确认', parent: 'm_order' },
  { key: 'order:reject', title: '订单退回', parent: 'm_order' },
  { key: 'order:outstock', title: '内部订单出库', parent: 'm_order' },
  { key: 'stock:in', title: '库存入库', parent: 'm_stock' },
  { key: 'stock:loss', title: '库存损耗登记', parent: 'm_stock' },
  { key: 'stock:check', title: '库存盘点调整', parent: 'm_stock' },
  { key: 'supplier:edit', title: '供应商维护', parent: 'm_supplier' },
  { key: 'purchase:batch', title: '外购需求汇总', parent: 'm_purchase' },
  { key: 'purchase:send', title: '标记已发送', parent: 'm_purchase' },
  { key: 'purchase:anomaly', title: '外购异常登记', parent: 'm_purchase' },
  { key: 'feeding:entry', title: '饲养入场', parent: 'm_feeding' },
  { key: 'feeding:change', title: '笼位分配变更', parent: 'm_feeding' },
  { key: 'feeding:exit', title: '饲养退出', parent: 'm_feeding' },
  { key: 'feeding:supply', title: '耗材领用', parent: 'm_feeding' },
  { key: 'cage:edit', title: '笼位维护', parent: 'm_cage' },
  { key: 'fee:generate', title: '生成费用', parent: 'm_fee' },
  { key: 'fee:submit', title: '提交学校扣费', parent: 'm_fee' },
  { key: 'system:edit', title: '平台基础维护', parent: 'm_sys_user' },
]

const SEED_MENUS: { id: string; parentId: string | null; title: string; type: MenuNode['type']; path?: string; key?: string; sort: number }[] = [
  { id: 'm_g_main', parentId: null, title: '工作台', type: 'dir', sort: 1 },
  { id: 'm_dashboard', parentId: 'm_g_main', title: '业务概览', type: 'menu', path: '/dashboard', sort: 1 },

  { id: 'm_g_service', parentId: null, title: '业务协同', type: 'dir', sort: 2 },
  { id: 'm_service', parentId: 'm_g_service', title: '服务管理', type: 'menu', path: '/service', sort: 1 },
  { id: 'm_order', parentId: 'm_g_service', title: '订单管理', type: 'menu', path: '/order', sort: 2 },

  { id: 'm_g_stock', parentId: null, title: '物资与采购', type: 'dir', sort: 3 },
  { id: 'm_stock', parentId: 'm_g_stock', title: '库存管理', type: 'menu', path: '/stock', sort: 1 },
  { id: 'm_purchase', parentId: 'm_g_stock', title: '外购汇总', type: 'menu', path: '/purchase', sort: 2 },
  { id: 'm_supplier', parentId: 'm_g_stock', title: '供应商管理', type: 'menu', path: '/supplier', sort: 3 },
  { id: 'm_order_internal', parentId: 'm_g_stock', title: '内部动物订购', type: 'menu', path: '/order/internal', sort: 4 },

  { id: 'm_g_animal', parentId: null, title: '饲养与空间', type: 'dir', sort: 4 },
  { id: 'm_cage_board', parentId: 'm_g_animal', title: '笼位空间看板', type: 'menu', path: '/cage/board', sort: 1 },
  { id: 'm_feeding', parentId: 'm_g_animal', title: '饲养管理', type: 'menu', path: '/feeding', sort: 2 },
  { id: 'm_cage', parentId: 'm_g_animal', title: '笼位管理', type: 'menu', path: '/cage', sort: 3 },

  { id: 'm_g_fee', parentId: null, title: '财务结算', type: 'dir', sort: 5 },
  { id: 'm_fee', parentId: 'm_g_fee', title: '费用结算', type: 'menu', path: '/fee', sort: 1 },

  { id: 'm_g_system', parentId: null, title: '系统管理', type: 'dir', sort: 6 },
  { id: 'm_sys_menu', parentId: 'm_g_system', title: '菜单管理', type: 'menu', path: '/system/menu', sort: 1 },
  { id: 'm_sys_role', parentId: 'm_g_system', title: '角色管理', type: 'menu', path: '/system/role', sort: 2 },
  { id: 'm_sys_user', parentId: 'm_g_system', title: '用户管理', type: 'menu', path: '/system/user', sort: 3 },
]

function buildMenus(): MenuNode[] {
  const list: MenuNode[] = SEED_MENUS.map((m) => ({
    id: m.id,
    parentId: m.parentId,
    title: m.title,
    type: m.type,
    path: m.path,
    key: m.key,
    sort: m.sort,
    enabled: true,
  }))
  ACTION_OPTIONS.forEach((a, i) => {
    list.push({
      id: `a_${a.key.replace(':', '_')}`,
      parentId: a.parent,
      title: a.title,
      type: 'action',
      key: a.key,
      sort: 100 + i,
      enabled: true,
    })
  })
  return list
}

const ALL_MENU_IDS = buildMenus().map((m) => m.id)

/* ---------------- 角色与用户 ---------------- */

const ADMIN_MENUS = [
  'm_g_main',
  'm_dashboard',
  'm_g_service',
  'm_service',
  'm_order',
  'm_g_stock',
  'm_stock',
  'm_purchase',
  'm_supplier',
  'm_order_internal',
  'm_g_animal',
  'm_cage_board',
  'm_feeding',
  'm_cage',
  'm_g_fee',
  'm_fee',
]

const ADMIN_ACTIONS = [
  'service:edit',
  'order:create',
  'order:approve',
  'order:reject',
  'order:outstock',
  'stock:in',
  'stock:loss',
  'stock:check',
  'supplier:edit',
  'purchase:batch',
  'purchase:send',
  'purchase:anomaly',
  'feeding:entry',
  'feeding:change',
  'feeding:exit',
  'feeding:supply',
  'cage:edit',
  'fee:generate',
  'fee:submit',
]

const ROLES: Role[] = [
  {
    id: 'r_super',
    code: 'super',
    name: '超级管理员',
    enabled: true,
    protected: true,
    labIds: LABS.map((l) => l.id),
    menuIds: [...ALL_MENU_IDS],
    actionKeys: ACTION_OPTIONS.map((a) => a.key),
  },
  {
    id: 'r_admin',
    code: 'lab_admin',
    name: '实验室管理员',
    enabled: true,
    protected: false,
    labIds: LABS.map((l) => l.id),
    menuIds: [...ADMIN_MENUS],
    actionKeys: [...ADMIN_ACTIONS],
  },
  {
    id: 'r_finance',
    code: 'finance',
    name: '财务人员',
    enabled: true,
    protected: false,
    labIds: LABS.map((l) => l.id),
    menuIds: ['m_g_main', 'm_dashboard', 'm_g_service', 'm_order', 'm_g_fee', 'm_fee'],
    actionKeys: ['fee:submit'],
  },
  {
    id: 'r_teacher',
    code: 'teacher',
    name: '项目负责人',
    enabled: true,
    protected: false,
    labIds: LABS.map((l) => l.id),
    menuIds: ['m_g_main', 'm_dashboard', 'm_g_service', 'm_service', 'm_order'],
    actionKeys: ['order:create'],
  },
]

/** 演示账号：覆盖超级管理员、单中心管理员、双中心管理员、财务与项目负责人 */
const USERS: User[] = [
  {
    id: 'u_super',
    name: '王超管',
    no: 'D2026001',
    org: '实验室与设备管理处',
    enabled: true,
    grants: LABS.map((l) => ({ userId: 'u_super', labId: l.id, roleId: 'r_super' })),
    note: '系统保护角色，可查看全校汇总',
  },
  {
    id: 'u_animal',
    name: '李动物',
    no: 'D2026002',
    org: '实验动物中心',
    enabled: true,
    grants: [{ userId: 'u_animal', labId: 'animal', roleId: 'r_admin' }],
  },
  {
    id: 'u_analysis',
    name: '张分析',
    no: 'D2026003',
    org: '分析测试中心',
    enabled: true,
    grants: [{ userId: 'u_analysis', labId: 'analysis', roleId: 'r_admin' }],
  },
  {
    id: 'u_both',
    name: '周双中',
    no: 'D2026004',
    org: '实验动物中心 / 分析测试中心',
    enabled: true,
    grants: [
      { userId: 'u_both', labId: 'animal', roleId: 'r_admin' },
      { userId: 'u_both', labId: 'analysis', roleId: 'r_admin' },
    ],
    note: '同时管理两个实验室，切换后菜单、数据与操作按新实验室生效',
  },
  {
    id: 'u_finance',
    name: '赵财务',
    no: 'D2026005',
    org: '财务处',
    enabled: true,
    grants: [{ userId: 'u_finance', labId: 'animal', roleId: 'r_finance' }],
  },
  {
    id: 'u_teacher',
    name: '孙老师',
    no: 'T2026006',
    org: '基础医学院课题组',
    enabled: true,
    grants: [{ userId: 'u_teacher', labId: 'animal', roleId: 'r_teacher' }],
  },
]

/* ---------------- 服务 ---------------- */

function servicesFor(labId: string, prefix: string, km: number, sd: number, cage: number): Service[] {
  return [
    {
      id: `sv_${prefix}_km`,
      labId,
      type: 'animal',
      name: 'KM小鼠（SPF级）',
      spec: 'SPF级，4周龄',
      unit: '只',
      unitPriceFen: km,
      auditMode: 'system',
      onSale: true,
      applyNote: '需填写课题编号与动物数量，提交后由中心在本系统内确认',
      updatedAt: DEMO_TODAY,
      stockItemId: `st_${prefix}_km`,
    },
    {
      id: `sv_${prefix}_sd`,
      labId,
      type: 'animal',
      name: 'SD大鼠（SPF级）',
      spec: 'SPF级，6周龄',
      unit: '只',
      unitPriceFen: sd,
      auditMode: 'system',
      onSale: true,
      applyNote: '大鼠需说明饲养笼位需求',
      updatedAt: DEMO_TODAY,
      stockItemId: `st_${prefix}_sd`,
    },
    {
      id: `sv_${prefix}_wt`,
      labId,
      type: 'animal',
      name: '教学用野生型小鼠',
      spec: '普通级，5周龄',
      unit: '只',
      unitPriceFen: Math.round(km * 0.6),
      auditMode: 'none',
      onSale: true,
      applyNote: '提交后直接进入待出库',
      updatedAt: DEMO_TODAY,
      stockItemId: `st_${prefix}_wt`,
    },
    {
      id: `sv_${prefix}_c57`,
      labId,
      type: 'animal',
      name: 'C57BL/6J 小鼠（入围厂商集采）',
      spec: 'SPF级，6~8周龄',
      unit: '只',
      unitPriceFen: 4800,
      auditMode: 'system',
      onSale: true,
      applyNote: '外部供应商集采代报，每周一/周四统一发厂商，厂商送货直接电话联系学生交接',
      updatedAt: DEMO_TODAY,
      supplierId: `su_${prefix}_1`,
      supplierItemId: `si_${prefix}_c57`,
    },
    {
      id: `sv_${prefix}_nude`,
      labId,
      type: 'animal',
      name: 'BALB/c 裸鼠（入围厂商集采）',
      spec: 'SPF级免疫缺陷，5周龄',
      unit: '只',
      unitPriceFen: 8500,
      auditMode: 'system',
      onSale: true,
      applyNote: '特种免疫缺陷品系，每周固定向北京斯贝福批量统购直送',
      updatedAt: DEMO_TODAY,
      supplierId: `su_${prefix}_2`,
      supplierItemId: `si_${prefix}_nude`,
    },
    {
      id: `sv_${prefix}_km_ext`,
      labId,
      type: 'animal',
      name: 'KM小鼠（外购集采）',
      spec: 'SPF级，4周龄',
      unit: '只',
      unitPriceFen: 4500,
      auditMode: 'system',
      onSale: true,
      applyNote: '外部供应商集采代报，按供应商汇总后统一发厂商',
      updatedAt: DEMO_TODAY,
      supplierId: `su_${prefix}_1`,
      supplierItemId: `si_${prefix}_km`,
    },
    {
      id: `sv_${prefix}_sd_ext`,
      labId,
      type: 'animal',
      name: 'SD大鼠（外购集采）',
      spec: 'SPF级，6周龄',
      unit: '只',
      unitPriceFen: 12000,
      auditMode: 'system',
      onSale: true,
      applyNote: '外部供应商集采代报，按供应商汇总后统一发厂商',
      updatedAt: DEMO_TODAY,
      supplierId: `su_${prefix}_1`,
      supplierItemId: `si_${prefix}_sd`,
    },
    {
      id: `sv_${prefix}_sd_region`,
      labId,
      type: 'animal',
      name: 'SD大鼠（区域现货）',
      spec: 'SPF级，6周龄',
      unit: '只',
      unitPriceFen: 12500,
      auditMode: 'system',
      onSale: true,
      applyNote: '西南片区应急现货调拨服务商直供',
      updatedAt: DEMO_TODAY,
      supplierId: `su_${prefix}_3`,
      supplierItemId: `si_${prefix}_sd2`,
    },
    {
      id: `sv_${prefix}_breed`,
      labId,
      type: 'breeding',
      name: '小鼠笼位饲养服务',
      spec: '独立通风笼位，含饲料垫料',
      unit: '笼·天',
      unitPriceFen: cage,
      auditMode: 'system',
      onSale: true,
      applyNote: '费用按“占用笼位数 × 天数 × 单价”分段累计，开始日含、结束日不含',
      updatedAt: DEMO_TODAY,
    },
    {
      id: `sv_${prefix}_breed_hall`,
      labId,
      type: 'breeding',
      name: '教学动物寄养（服务大厅审批）',
      spec: '普通环境笼位',
      unit: '笼·天',
      unitPriceFen: Math.round(cage * 0.8),
      auditMode: 'hall',
      onSale: true,
      applyNote: '服务大厅审批通过后进入待出库',
      updatedAt: DEMO_TODAY,
    },
    {
      id: `sv_${prefix}_off`,
      labId,
      type: 'animal',
      name: '暂未上架：裸鼠（NU/NU）',
      spec: '免疫缺陷，6周龄',
      unit: '只',
      unitPriceFen: 32000,
      auditMode: 'system',
      onSale: false,
      applyNote: '下架后不出现在新订单可选服务中',
      updatedAt: DEMO_TODAY,
    },
  ]
}

/* ---------------- 库存 ---------------- */

/**
 * 库存类别档案：校级预置，全校实验室共用。
 * 新增类别 = 增加一条配置（isAnimal 决定业务联动口径，lossReasons 提供损耗原因选项），业务代码不需要改动。
 */
export const STOCK_CATEGORIES: StockCategoryDef[] = [
  { id: 'cat_animal', name: '实验动物', isAnimal: true, lossReasons: ['死亡', '淘汰'], sort: 1, enabled: true },
  { id: 'cat_feed', name: '饲料垫料', isAnimal: false, lossReasons: ['过期', '损坏', '丢失'], sort: 2, enabled: true },
  { id: 'cat_reagent', name: '试剂耗材', isAnimal: false, lossReasons: ['过期', '报废', '丢失'], sort: 3, enabled: true },
  { id: 'cat_part', name: '维修配件', isAnimal: false, lossReasons: ['损坏', '丢失'], sort: 4, enabled: true },
  { id: 'cat_other', name: '其他物资', isAnimal: false, lossReasons: ['损坏', '丢失'], sort: 5, enabled: true },
]

function stockFor(labId: string, prefix: string): StockItem[] {
  return [
    {
      id: `st_${prefix}_km`,
      labId,
      category: 'cat_animal',
      name: 'KM小鼠',
      spec: 'SPF级，4周龄',
      unit: '只',
      quantity: 120,
      safeStock: 20,
      location: '屏障环境 A 区',
      refPriceFen: 4500,
    },
    {
      id: `st_${prefix}_sd`,
      labId,
      category: 'cat_animal',
      name: 'SD大鼠',
      spec: 'SPF级，6周龄',
      unit: '只',
      quantity: 20,
      safeStock: 10,
      location: '屏障环境 A 区',
      refPriceFen: 12000,
    },
    {
      id: `st_${prefix}_wt`,
      labId,
      category: 'cat_animal',
      name: '教学用野生型小鼠',
      spec: '普通级，5周龄',
      unit: '只',
      quantity: 60,
      safeStock: 10,
      location: '普通环境 B 区',
      refPriceFen: 2700,
    },
    {
      id: `st_${prefix}_nu`,
      labId,
      category: 'cat_animal',
      name: '裸鼠（NU/NU）',
      spec: 'SPF级，4周龄',
      unit: '只',
      quantity: 3,
      safeStock: 10,
      location: '屏障环境 A 区',
      refPriceFen: 30000,
    },
    {
      id: `st_${prefix}_hfd`,
      labId,
      category: 'cat_feed',
      name: '高脂造模饲料',
      spec: '10kg/袋',
      unit: 'kg',
      quantity: 8,
      safeStock: 30,
      location: '耗材库房',
      refPriceFen: 2600,
    },
    {
      id: `st_${prefix}_feed`,
      labId,
      category: 'cat_feed',
      name: '大小鼠维持饲料',
      spec: '10kg/袋',
      unit: 'kg',
      quantity: 260,
      safeStock: 50,
      location: '耗材库房',
      refPriceFen: 1200,
    },
    {
      id: `st_${prefix}_bedding`,
      labId,
      category: 'cat_feed',
      name: '玉米芯垫料',
      spec: '5kg/包',
      unit: 'kg',
      quantity: 152,
      safeStock: 40,
      location: '耗材库房',
      refPriceFen: 800,
    },
  ]
}

/**
 * 演示用库存流水：覆盖入库、出库、损耗、盘点四类，日期相对今天生成（近一周内），
 * 保证库存流水页签默认"近一周"筛选下即可看到全部类型。所有 before/after 与品目现存数量一致。
 */
function stockSeed(
  labId: string,
  prefix: string,
  operator: string,
  items: StockItem[],
): { flows: StockFlow[]; checks: StockCheck[] } {
  const when = (daysAgo: number, time: string) => `${addDays(todayStr(), -daysAgo)} ${time}`
  const get = (key: string) => items.find((s) => s.id === `st_${prefix}_${key}`)!
  const flows: StockFlow[] = []
  const checks: StockCheck[] = []
  const push = (f: Omit<StockFlow, 'labId' | 'operator'>) => flows.push({ ...f, labId, operator })

  // KM 小鼠：自繁入库 → 订单出库（关联历史订单） → 科研领用 → 死亡
  const km = get('km')
  const code = (n: number) => `${labId === 'animal' ? 'AD' : 'AN'}-ORD-${String(n).padStart(4, '0')}`
  push({ id: `flw_${prefix}_in_km`, itemId: km.id, type: 'in', quantity: 150, before: 0, after: 150, reason: '中心自繁登记', sourceType: 'internal', refType: 'manual', refId: km.id, createdAt: when(6, '09:00:00') })
  push({ id: `flw_${prefix}_out_km1`, itemId: km.id, type: 'out', quantity: -20, before: 150, after: 130, reason: `订单 ${code(21)} 整单出库`, refType: 'order', refId: `or_${prefix}_h1`, createdAt: when(5, '14:20:00') })
  push({ id: `flw_${prefix}_out_km2`, itemId: km.id, type: 'out', quantity: -8, before: 130, after: 122, reason: `订单 ${code(23)} 整单出库`, refType: 'order', refId: `or_${prefix}_h3`, createdAt: when(4, '15:10:00') })
  push({ id: `flw_${prefix}_loss_km`, itemId: km.id, type: 'loss', quantity: -2, before: 122, after: 120, reason: '死亡', refType: 'loss', refId: km.id, createdAt: when(3, '09:15:00') })

  // SD 大鼠：入库 → 教学出库 → 盘点调整
  const sd = get('sd')
  push({ id: `flw_${prefix}_in_sd`, itemId: sd.id, type: 'in', quantity: 30, before: 0, after: 30, reason: '供应商送货（育种引入）', sourceType: 'supplier', supplierId: `su_${prefix}_3`, supplierItemId: `si_${prefix}_sd2`, refType: 'manual', refId: sd.id, createdAt: when(5, '09:20:00') })
  push({ id: `flw_${prefix}_out_sd`, itemId: sd.id, type: 'out', quantity: -8, before: 30, after: 22, reason: `订单 ${code(24)} 整单出库`, refType: 'order', refId: `or_${prefix}_h4`, createdAt: when(4, '14:05:00') })
  const checkFlowId = `flw_${prefix}_check_sd`
  push({ id: checkFlowId, itemId: sd.id, type: 'check', quantity: -2, before: 22, after: 20, reason: '盘亏核实（实盘 20 只）', refType: 'check', refId: sd.id, createdAt: when(3, '16:40:00') })
  checks.push({ id: `chk_${prefix}_sd`, labId, batchNo: `PD-${addDays(todayStr(), -3).replace(/-/g, '')}-164000`, flowId: checkFlowId, itemId: sd.id, before: 22, counted: 20, diff: -2, reason: '盘亏核实（实盘 20 只）', operator, createdAt: when(3, '16:40:00') })

  // 教学用野生型小鼠：自繁入库 → 订单出库（关联历史订单）
  const wt = get('wt')
  push({ id: `flw_${prefix}_in_wt`, itemId: wt.id, type: 'in', quantity: 80, before: 0, after: 80, reason: '中心自繁登记', sourceType: 'internal', refType: 'manual', refId: wt.id, createdAt: when(6, '09:10:00') })
  push({ id: `flw_${prefix}_out_wt`, itemId: wt.id, type: 'out', quantity: -20, before: 80, after: 60, reason: `订单 ${code(22)} 整单出库`, refType: 'order', refId: `or_${prefix}_h2`, createdAt: when(2, '13:30:00') })

  // 维持饲料：供应商到货 → 饲养领用（关联饲养单） → 过期
  const feed = get('feed')
  push({ id: `flw_${prefix}_in_feed`, itemId: feed.id, type: 'in', quantity: 300, before: 0, after: 300, reason: '供应商到货', sourceType: 'supplier', supplierId: `su_${prefix}_4`, supplierItemId: `si_${prefix}_feed`, refType: 'manual', refId: feed.id, createdAt: when(6, '11:00:00') })
  push({ id: `flw_${prefix}_out_feed`, itemId: feed.id, type: 'out', quantity: -35, before: 300, after: 265, reason: '饲养单领用（在养批次）', refType: 'feeding', refId: `fd_${prefix}_1`, createdAt: when(4, '10:30:00') })
  push({ id: `flw_${prefix}_loss_feed`, itemId: feed.id, type: 'loss', quantity: -5, before: 265, after: 260, reason: '过期', refType: 'loss', refId: feed.id, createdAt: when(2, '10:30:00') })

  // 高脂造模饲料：供应商到货 → 过期（预警品目）
  const hfd = get('hfd')
  push({ id: `flw_${prefix}_in_hfd`, itemId: hfd.id, type: 'in', quantity: 20, before: 0, after: 20, reason: '供应商到货', sourceType: 'supplier', supplierId: `su_${prefix}_4`, supplierItemId: `si_${prefix}_hfd`, refType: 'manual', refId: hfd.id, createdAt: when(5, '10:00:00') })
  push({ id: `flw_${prefix}_loss_hfd`, itemId: hfd.id, type: 'loss', quantity: -12, before: 20, after: 8, reason: '过期', refType: 'loss', refId: hfd.id, createdAt: when(3, '09:10:00') })

  // 玉米芯垫料：供应商到货 → 受潮损坏
  const bedding = get('bedding')
  push({ id: `flw_${prefix}_in_bedding`, itemId: bedding.id, type: 'in', quantity: 160, before: 0, after: 160, reason: '供应商到货', sourceType: 'supplier', supplierId: `su_${prefix}_5`, supplierItemId: `si_${prefix}_bedding`, refType: 'manual', refId: bedding.id, createdAt: when(6, '11:10:00') })
  push({ id: `flw_${prefix}_loss_bedding`, itemId: bedding.id, type: 'loss', quantity: -10, before: 160, after: 150, reason: '受潮损坏', refType: 'loss', refId: bedding.id, createdAt: when(2, '15:30:00') })

  // 裸鼠：自繁转入 → 两次死亡（预警品目）
  const nu = get('nu')
  push({ id: `flw_${prefix}_in_nu`, itemId: nu.id, type: 'in', quantity: 10, before: 0, after: 10, reason: '中心自繁转入', sourceType: 'internal', refType: 'manual', refId: nu.id, createdAt: when(5, '08:30:00') })
  push({ id: `flw_${prefix}_loss_nu1`, itemId: nu.id, type: 'loss', quantity: -5, before: 10, after: 5, reason: '死亡', refType: 'loss', refId: nu.id, createdAt: when(3, '09:00:00') })
  push({ id: `flw_${prefix}_loss_nu2`, itemId: nu.id, type: 'loss', quantity: -2, before: 5, after: 3, reason: '死亡', refType: 'loss', refId: nu.id, createdAt: when(1, '09:05:00') })

  // 批量盘点：日常核对（野生型小鼠、维持饲料，零差异留痕）
  const batch2 = `PD-${addDays(todayStr(), -5).replace(/-/g, '')}-093000`
  push({ id: `flw_${prefix}_check_wt2`, itemId: wt.id, type: 'check', quantity: 0, before: 80, after: 80, reason: '日常核对', refType: 'check', refId: wt.id, createdAt: when(5, '09:30:00') })
  checks.push({ id: `chk_${prefix}_wt2`, labId, batchNo: batch2, flowId: `flw_${prefix}_check_wt2`, itemId: wt.id, before: 80, counted: 80, diff: 0, reason: '日常核对', operator, createdAt: when(5, '09:30:00') })
  push({ id: `flw_${prefix}_check_feed2`, itemId: feed.id, type: 'check', quantity: 0, before: 300, after: 300, reason: '日常核对', refType: 'check', refId: feed.id, createdAt: when(5, '09:30:00') })
  checks.push({ id: `chk_${prefix}_feed2`, labId, batchNo: batch2, flowId: `flw_${prefix}_check_feed2`, itemId: feed.id, before: 300, counted: 300, diff: 0, reason: '日常核对', operator, createdAt: when(5, '09:30:00') })

  // 批量盘点：日常核对（KM 小鼠、裸鼠，零差异留痕）
  const batch3 = `PD-${addDays(todayStr(), -2).replace(/-/g, '')}-101500`
  push({ id: `flw_${prefix}_check_km2`, itemId: km.id, type: 'check', quantity: 0, before: 120, after: 120, reason: '日常核对', refType: 'check', refId: km.id, createdAt: when(2, '10:15:00') })
  checks.push({ id: `chk_${prefix}_km2`, labId, batchNo: batch3, flowId: `flw_${prefix}_check_km2`, itemId: km.id, before: 120, counted: 120, diff: 0, reason: '日常核对', operator, createdAt: when(2, '10:15:00') })
  push({ id: `flw_${prefix}_check_nu2`, itemId: nu.id, type: 'check', quantity: 0, before: 5, after: 5, reason: '日常核对', refType: 'check', refId: nu.id, createdAt: when(2, '10:15:00') })
  checks.push({ id: `chk_${prefix}_nu2`, labId, batchNo: batch3, flowId: `flw_${prefix}_check_nu2`, itemId: nu.id, before: 5, counted: 5, diff: 0, reason: '日常核对', operator, createdAt: when(2, '10:15:00') })

  // 批量盘点：账目误差（玉米芯垫料盘盈 +2，台账 150 → 152）
  const batch4 = `PD-${addDays(todayStr(), -1).replace(/-/g, '')}-090000`
  push({ id: `flw_${prefix}_check_bedding`, itemId: bedding.id, type: 'check', quantity: 2, before: 150, after: 152, reason: '账目误差（盘盈）', refType: 'check', refId: bedding.id, createdAt: when(1, '09:00:00') })
  checks.push({ id: `chk_${prefix}_bedding`, labId, batchNo: batch4, flowId: `flw_${prefix}_check_bedding`, itemId: bedding.id, before: 150, counted: 152, diff: 2, reason: '账目误差（盘盈）', operator, createdAt: when(1, '09:00:00') })

  flows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  return { flows, checks }
}

/* ---------------- 笼位 ---------------- */

function cagesFor(labId: string, prefix: string): Cage[] {
  const list: Cage[] = []
  const bMain = '云漫湖校区·实验动物中心（SPF屏障实验楼）'
  const bOld = '北京路校区·实验动物中心（老校区动物楼）'

  // 1. 云漫湖校区主楼 - 1F - 101室（SPF小鼠屏障室）- 01号IVC小鼠笼架 (保留 cg_a1~a6 供单测与演示用)
  for (let i = 1; i <= 6; i++) {
    list.push({
      id: `cg_${prefix}_a${i}`,
      labId,
      code: `${prefix === 'ani' ? 'A' : 'C'}-10${i}`,
      building: bMain,
      floor: '1F',
      room: '101室（SPF小鼠屏障室）',
      rack: '01号IVC小鼠笼架',
      env: 'SPF',
      cageType: 'IVC小鼠笼',
      capacity: 5,
      status: 'free',
    })
  }

  // 贵安主楼 - 1F - 101室（SPF小鼠屏障室）- 02号IVC小鼠笼架 (A-109/110 供预排位锁定)
  for (let i = 7; i <= 12; i++) {
    list.push({
      id: `cg_${prefix}_a${i}`,
      labId,
      code: `${prefix === 'ani' ? 'A' : 'C'}-${100 + i}`,
      building: bMain,
      floor: '1F',
      room: '101室（SPF小鼠屏障室）',
      rack: '02号IVC小鼠笼架',
      env: 'SPF',
      cageType: 'IVC小鼠笼',
      capacity: 5,
      status: 'free',
    })
  }

  // 贵安主楼 - 1F - 102室（SPF大鼠屏障室）- 01号IVC大鼠笼架
  for (let i = 13; i <= 18; i++) {
    list.push({
      id: `cg_${prefix}_a${i}`,
      labId,
      code: `${prefix === 'ani' ? 'A' : 'C'}-20${i - 12}`,
      building: bMain,
      floor: '1F',
      room: '102室（SPF大鼠屏障室）',
      rack: '01号IVC大鼠笼架',
      env: 'SPF',
      cageType: 'IVC大鼠笼',
      capacity: 3,
      status: 'free',
    })
  }

  // 贵安主楼 - 2F - 201室（SPF免疫缺陷专用室）- 03号特种小鼠笼架
  for (let i = 19; i <= 24; i++) {
    list.push({
      id: `cg_${prefix}_a${i}`,
      labId,
      code: `${prefix === 'ani' ? 'A' : 'C'}-30${i - 18}`,
      building: bMain,
      floor: '2F',
      room: '201室（SPF免疫缺陷专用室）',
      rack: '03号特种小鼠笼架',
      env: 'SPF',
      cageType: '隔离包/特种小鼠笼',
      capacity: 5,
      status: 'free',
    })
  }

  // 2. 老校区医学科研楼 - 1F - 101室（普通教学寄养室）(保留 cg_b1~b3 供单测与演示用)
  for (let i = 1; i <= 3; i++) {
    list.push({
      id: `cg_${prefix}_b${i}`,
      labId,
      code: `${prefix === 'ani' ? 'B' : 'D'}-10${i}`,
      building: bOld,
      floor: '1F',
      room: '101室（普通教学寄养室）',
      rack: '01号教学寄养架',
      env: '普通',
      cageType: '普通开放笼',
      capacity: 4,
      status: i === 3 ? 'disabled' : 'free',
      note: i === 3 ? '停用检修笼位，不可用于入场' : undefined,
    })
  }

  // 老校区医学科研楼 - 2F - 201室（普通行为学配套室）
  for (let i = 4; i <= 6; i++) {
    list.push({
      id: `cg_${prefix}_b${i}`,
      labId,
      code: `${prefix === 'ani' ? 'B' : 'D'}-20${i - 3}`,
      building: bOld,
      floor: '2F',
      room: '201室（普通行为学配套室）',
      rack: '02号行为学寄养架',
      env: '普通',
      cageType: '普通开放笼',
      capacity: 4,
      status: 'free',
    })
  }

  return list
}

/* ---------------- 客户、供应商、项目 ---------------- */

function customersFor(labId: string, prefix: string): Customer[] {
  return [
    {
      id: `cu_${prefix}_hospital`,
      labId,
      name: '附属单位·黔康医学研究中心',
      type: 'org',
      contact: '联系人·李外部',
      phone: '0851-0000-0001',
      note: '外部单位，不登录系统，由管理员代录业务',
    },
    {
      id: `cu_${prefix}_person`,
      labId,
      name: '个人客户·王小外',
      type: 'person',
      contact: '王小外',
      phone: '138-0000-0000',
    },
  ]
}

function suppliersFor(labId: string, prefix: string): Supplier[] {
  return [
    {
      id: `su_${prefix}_1`,
      labId,
      name: '北京维通利华实验动物技术有限公司',
      enabled: true,
      contact: '李经理',
      phone: '010-8474-0001',
      note: '贵医大年度入围供货商（合同号：GYD-2026-SUP01）',
    },
    {
      id: `su_${prefix}_2`,
      labId,
      name: '北京斯贝福生物技术有限公司',
      enabled: true,
      contact: '王经理',
      phone: '010-6078-0002',
      note: '特种免疫缺陷品系指定协议厂商（合同号：GYD-2026-SUP02）',
    },
    {
      id: `su_${prefix}_3`,
      labId,
      name: '川黔实验动物繁育中心（区域仓）',
      enabled: true,
      contact: '赵经理',
      phone: '0851-8690-0003',
      note: '西南片区应急现货调拨服务商',
    },
    {
      id: `su_${prefix}_4`,
      labId,
      name: '贵阳黔灵饲料有限公司',
      enabled: true,
      contact: '周经理',
      phone: '0851-8650-0004',
      note: '维持饲料、高脂造模饲料供货商',
    },
    {
      id: `su_${prefix}_5`,
      labId,
      name: '贵州洁垫生物材料有限公司',
      enabled: true,
      contact: '曹经理',
      phone: '0851-8660-0005',
      note: '玉米芯垫料、灭菌垫料供货商',
    },
  ]
}

function supplierItemsFor(labId: string, prefix: string, startSeq: number): SupplierItem[] {
  const code = (n: number) => `SI-${String(n).padStart(4, '0')}`
  let seq = startSeq
  const mk = (
    id: string,
    supplierId: string,
    kind: 'animal' | 'supply',
    name: string,
    spec: string,
    unit: string,
    priceFen: number,
  ): SupplierItem => ({
    id: `si_${prefix}_${id}`,
    code: code(++seq),
    labId,
    supplierId: `su_${prefix}_${supplierId}`,
    kind,
    name,
    spec,
    unit,
    priceFen,
    enabled: true,
  })
  return [
    mk('km', '1', 'animal', 'KM小鼠', 'SPF级，4周龄', '只', 4500),
    mk('sd', '1', 'animal', 'SD大鼠', 'SPF级，6周龄', '只', 12000),
    mk('c57', '1', 'animal', 'C57BL/6J小鼠', 'SPF级，6~8周龄', '只', 4800),
    mk('nude', '2', 'animal', 'BALB/c裸鼠', 'SPF级免疫缺陷，5周龄', '只', 8500),
    mk('sd2', '3', 'animal', 'SD大鼠（区域现货）', 'SPF级，6周龄', '只', 12500),
    mk('feed', '4', 'supply', '大小鼠维持饲料', '10kg/袋', 'kg', 1200),
    mk('hfd', '4', 'supply', '高脂造模饲料', '10kg/袋', 'kg', 2600),
    mk('bedding', '5', 'supply', '玉米芯垫料', '5kg/包', 'kg', 800),
  ]
}

function projectsFor(labId: string, prefix: string): Project[] {
  return [
    {
      id: `pj_${prefix}_1`,
      labId,
      code: 'XM-2026-01',
      name: '肿瘤模型的影像学评价',
      owner: '孙老师',
      enabled: true,
    },
    {
      id: `pj_${prefix}_2`,
      labId,
      code: 'XM-2026-02',
      name: '代谢性疾病动物模型',
      owner: '孙老师',
      enabled: true,
    },
    {
      id: `pj_${prefix}_3`,
      labId,
      code: 'XM-2025-09',
      name: '已结题专项（停用）',
      owner: '负责人',
      enabled: false,
    },
  ]
}

/* ---------------- 订单 ---------------- */

function ev(at: string, actor: string, action: string, note?: string): OrderEvent {
  return { at, actor, action, note }
}

interface SeedOrder {
  id: string
  labId: string
  code: string
  kind: OrderKind
  serviceId: string
  serviceName: string
  itemName: string
  spec: string
  unit: string
  quantity: number
  unitPriceFen: number
  auditMode: NonNullable<Order['auditMode']>
  auditStatus: AuditStatus
  fulfillStatus: Order['fulfillStatus']
  source: Order['source']
  applicantName: string
  applicantOrg: string
  externalCustomerId?: string
  stockItemId?: string
  supplierId?: string
  confirmedAmountFen?: number
  projectId?: string
  rejectReason?: string
  expectDate?: string
  expectStartDate?: string
  expectEndDate?: string
  remark?: string
  animalCount?: number
  feedDays?: number
  recommendedCages?: number
  iacucNo?: string
  cageType?: string
  allocatedCageIds?: string[]
  reserveExpireAt?: string
  reserveStatus?: 'none' | 'reserved' | 'expired_released' | 'checked_in'
  preFreezeAmountFen?: number
  feeStatus?: 'frozen' | 'charged' | 'unpaid'
  createdAt: string
  history: OrderEvent[]
}

function toOrder(o: SeedOrder): Order {
  return {
    ...o,
    updatedAt: o.history.length ? o.history[o.history.length - 1].at : o.createdAt,
  }
}

/** 历史已完成订单：供种子出库流水关联（库存流水「查看订单」），不参与演示主线 */
function historyOrders(labId: string, prefix: string, sv: Service[], pj: Project[], st: StockItem[]): Order[] {
  const code = (n: number) => `${labId === 'animal' ? 'AD' : 'AN'}-ORD-${String(n).padStart(4, '0')}`
  const created = (daysAgo: number) => addDays(todayStr(), -daysAgo)
  const actor = labId === 'animal' ? '李动物' : '张分析'
  const service = (id: string) => sv.find((s) => s.id === id)!
  const km = service(`sv_${prefix}_km`)
  const sd = service(`sv_${prefix}_sd`)
  const wt = service(`sv_${prefix}_wt`)
  return [
    toOrder({
      labId,
      id: `or_${prefix}_h1`,
      code: code(21),
      kind: 'internal',
      serviceId: km.id,
      serviceName: km.name,
      itemName: km.name,
      spec: km.spec,
      unit: km.unit,
      quantity: 20,
      unitPriceFen: km.unitPriceFen,
      auditMode: 'system',
      auditStatus: 'approved',
      fulfillStatus: 'completed',
      source: 'user',
      applicantName: '学生·林同学',
      applicantOrg: '基础医学院课题组',
      stockItemId: st.find((x) => x.id === `st_${prefix}_km`)!.id,
      projectId: pj[0].id,
      remark: '历史订单：出库流水「查看订单」关联用',
      createdAt: created(6),
      history: [
        ev(created(6), '林同学', '使用端提交申请'),
        ev(created(5), actor, '中心确认通过'),
        ev(created(5), actor, '整单出库 20 只'),
      ],
    }),
    toOrder({
      labId,
      id: `or_${prefix}_h3`,
      code: code(23),
      kind: 'internal',
      serviceId: km.id,
      serviceName: km.name,
      itemName: km.name,
      spec: km.spec,
      unit: km.unit,
      quantity: 8,
      unitPriceFen: km.unitPriceFen,
      auditMode: 'system',
      auditStatus: 'approved',
      fulfillStatus: 'completed',
      source: 'user',
      applicantName: '教师·郑老师',
      applicantOrg: '公共卫生学院课题组',
      stockItemId: st.find((x) => x.id === `st_${prefix}_km`)!.id,
      projectId: pj[0].id,
      remark: '历史订单：出库流水「查看订单」关联用',
      createdAt: created(5),
      history: [
        ev(created(5), '郑老师', '使用端提交申请'),
        ev(created(4), actor, '中心确认通过'),
        ev(created(4), actor, '整单出库 8 只'),
      ],
    }),
    toOrder({
      labId,
      id: `or_${prefix}_h4`,
      code: code(24),
      kind: 'internal',
      serviceId: sd.id,
      serviceName: sd.name,
      itemName: sd.name,
      spec: sd.spec,
      unit: sd.unit,
      quantity: 8,
      unitPriceFen: sd.unitPriceFen,
      auditMode: 'system',
      auditStatus: 'approved',
      fulfillStatus: 'completed',
      source: 'user',
      applicantName: '教师·冯老师',
      applicantOrg: '基础医学院教学组',
      stockItemId: st.find((x) => x.id === `st_${prefix}_sd`)!.id,
      projectId: pj[0].id,
      remark: '历史订单：出库流水「查看订单」关联用',
      createdAt: created(5),
      history: [
        ev(created(5), '冯老师', '使用端提交申请'),
        ev(created(4), actor, '中心确认通过'),
        ev(created(4), actor, '整单出库 8 只'),
      ],
    }),
    toOrder({
      labId,
      id: `or_${prefix}_h2`,
      code: code(22),
      kind: 'internal',
      serviceId: wt.id,
      serviceName: wt.name,
      itemName: wt.name,
      spec: wt.spec,
      unit: wt.unit,
      quantity: 20,
      unitPriceFen: wt.unitPriceFen,
      auditMode: 'system',
      auditStatus: 'approved',
      fulfillStatus: 'completed',
      source: 'user',
      applicantName: '学生·吴同学',
      applicantOrg: '药学院课题组',
      stockItemId: st.find((x) => x.id === `st_${prefix}_wt`)!.id,
      projectId: pj[0].id,
      remark: '历史订单：出库流水「查看订单」关联用',
      createdAt: created(3),
      history: [
        ev(created(3), '吴同学', '使用端提交申请'),
        ev(created(2), actor, '中心确认通过'),
        ev(created(2), actor, '整单出库 20 只'),
      ],
    }),
  ]
}

function orderSeedFor(labId: string, prefix: string, sv: Service[], pj: Project[], cu: Customer[], st: StockItem[]): Order[] {
  const service = (id: string) => sv.find((s) => s.id === id)!
  const item = (id: string) => st.find((s) => s.id === id)!
  const base: Omit<SeedOrder, 'id' | 'code' | 'kind' | 'serviceId' | 'serviceName' | 'itemName' | 'spec' | 'unit' | 'quantity' | 'unitPriceFen' | 'auditMode' | 'auditStatus' | 'fulfillStatus' | 'source' | 'applicantName' | 'applicantOrg' | 'createdAt' | 'history'> = {
    labId,
  }

  const km = service(`sv_${prefix}_km`)
  const sd = service(`sv_${prefix}_sd`)
  const kmExt = service(`sv_${prefix}_km_ext`)
  const sdExt = service(`sv_${prefix}_sd_ext`)
  const sdRegion = service(`sv_${prefix}_sd_region`)
  const wt = service(`sv_${prefix}_wt`)
  const c57 = service(`sv_${prefix}_c57`)
  const nude = service(`sv_${prefix}_nude`)
  const breed = service(`sv_${prefix}_breed`)
  const hall = service(`sv_${prefix}_breed_hall`)

  return [
    toOrder({
      ...base,
      id: `or_${prefix}_i1`,
      code: `${labId === 'animal' ? 'AD' : 'AN'}-ORD-0001`,
      kind: 'internal',
      serviceId: km.id,
      serviceName: km.name,
      itemName: km.name,
      spec: km.spec,
      unit: km.unit,
      quantity: 30,
      unitPriceFen: km.unitPriceFen,
      auditMode: 'system',
      auditStatus: 'pending',
      fulfillStatus: 'pending_out',
      source: 'user',
      applicantName: '学生·陈同学',
      applicantOrg: '基础医学院课题组',
      stockItemId: item(`st_${prefix}_km`).id,
      projectId: pj[0].id,
      expectDate: '2026-10-28',
      remark: '内部动物订购主线：确认 → 出库 → 完成 → 生成费用 → 学校扣费',
      createdAt: '2026-10-24',
      history: [ev('2026-10-24', '陈同学', '使用端提交申请', '使用端提交')],
    }),
    toOrder({
      ...base,
      id: `or_${prefix}_i2`,
      code: `${labId === 'animal' ? 'AD' : 'AN'}-ORD-0002`,
      kind: 'internal',
      serviceId: wt.id,
      serviceName: wt.name,
      itemName: wt.name,
      spec: wt.spec,
      unit: wt.unit,
      quantity: 10,
      unitPriceFen: wt.unitPriceFen,
      auditMode: 'none',
      auditStatus: 'none',
      fulfillStatus: 'pending_out',
      source: 'user',
      applicantName: '学生·林同学',
      applicantOrg: '公共卫生学院课题组',
      stockItemId: item(`st_${prefix}_wt`).id,
      projectId: pj[1].id,
      createdAt: '2026-10-20',
      history: [ev('2026-10-20', '林同学', '使用端提交申请', '无需审核：直接待出库')],
    }),
    toOrder({
      ...base,
      id: `or_${prefix}_i3`,
      code: `${labId === 'animal' ? 'AD' : 'AN'}-ORD-0003`,
      kind: 'internal',
      serviceId: sd.id,
      serviceName: sd.name,
      itemName: sd.name,
      spec: sd.spec,
      unit: sd.unit,
      quantity: 60,
      unitPriceFen: sd.unitPriceFen,
      auditMode: 'system',
      auditStatus: 'approved',
      fulfillStatus: 'pending_out',
      source: 'user',
      applicantName: '教师·吴老师',
      applicantOrg: '药学院课题组',
      stockItemId: item(`st_${prefix}_sd`).id,
      projectId: pj[0].id,
      createdAt: '2026-10-18',
      history: [
        ev('2026-10-18', '吴老师', '使用端提交申请'),
        ev('2026-10-19', '李动物', '中心确认通过', '库存仅 20 只，出库将被阻止'),
      ],
    }),
    toOrder({
      ...base,
      id: `or_${prefix}_i4`,
      code: `${labId === 'animal' ? 'AD' : 'AN'}-ORD-0004`,
      kind: 'internal',
      serviceId: km.id,
      serviceName: km.name,
      itemName: km.name,
      spec: km.spec,
      unit: km.unit,
      quantity: 5,
      unitPriceFen: km.unitPriceFen,
      auditMode: 'system',
      auditStatus: 'approved',
      fulfillStatus: 'completed',
      source: 'user',
      applicantName: '教师·郑老师',
      applicantOrg: '基础医学院课题组',
      stockItemId: item(`st_${prefix}_km`).id,
      projectId: pj[1].id,
      createdAt: '2026-10-15',
      history: [
        ev('2026-10-15', '郑老师', '使用端提交申请'),
        ev('2026-10-16', '李动物', '中心确认通过'),
        ev('2026-10-16', '李动物', '整单出库 5 只'),
        ev('2026-10-16', '系统', '订单完成并生成费用'),
      ],
    }),
    toOrder({
      ...base,
      id: `or_${prefix}_i5`,
      code: `${labId === 'animal' ? 'AD' : 'AN'}-ORD-0013`,
      kind: 'internal',
      serviceId: km.id,
      serviceName: km.name,
      itemName: km.name,
      spec: km.spec,
      unit: km.unit,
      quantity: 2,
      unitPriceFen: km.unitPriceFen,
      auditMode: 'system',
      auditStatus: 'approved',
      fulfillStatus: 'completed',
      source: 'user',
      applicantName: '学生·唐同学',
      applicantOrg: '基础医学院课题组',
      stockItemId: item(`st_${prefix}_km`).id,
      projectId: pj[0].id,
      createdAt: '2026-10-12',
      history: [
        ev('2026-10-12', '唐同学', '使用端提交申请'),
        ev('2026-10-12', '李动物', '中心确认通过'),
        ev('2026-10-13', '李动物', '整单出库 2 只'),
        ev('2026-10-13', '系统', '订单完成并生成费用'),
      ],
    }),
    toOrder({
      ...base,
      id: `or_${prefix}_e1`,
      code: `${labId === 'animal' ? 'AD' : 'AN'}-ORD-0005`,
      kind: 'external',
      serviceId: c57.id,
      serviceName: c57.name,
      itemName: 'C57BL/6J 小鼠',
      spec: c57.spec,
      unit: c57.unit,
      quantity: 20,
      unitPriceFen: c57.unitPriceFen,
      auditMode: 'system',
      auditStatus: 'pending',
      fulfillStatus: 'pending_collect',
      source: 'user',
      applicantName: '学生·黄同学',
      applicantOrg: '附属医院科室',
      externalCustomerId: cu[0].id,
      supplierId: `su_${prefix}_1`,
      expectDate: '2026-11-05',
      remark: '外购主线：确认 → 汇总发送 → 不入库、无交付完成',
      createdAt: '2026-10-23',
      history: [ev('2026-10-23', '黄同学', '使用端提交外购申请')],
    }),
    toOrder({
      ...base,
      id: `or_${prefix}_e2`,
      code: `${labId === 'animal' ? 'AD' : 'AN'}-ORD-0006`,
      kind: 'external',
      serviceId: c57.id,
      serviceName: c57.name,
      itemName: 'C57BL/6J 小鼠',
      spec: c57.spec,
      unit: c57.unit,
      quantity: 10,
      unitPriceFen: c57.unitPriceFen,
      auditMode: 'system',
      auditStatus: 'approved',
      fulfillStatus: 'pending_collect',
      source: 'user',
      applicantName: '教师·钱老师',
      applicantOrg: '口腔医学院课题组',
      externalCustomerId: cu[1].id,
      supplierId: `su_${prefix}_1`,
      createdAt: '2026-10-21',
      history: [ev('2026-10-21', '钱老师', '使用端提交外购申请'), ev('2026-10-22', '李动物', '中心确认通过')],
    }),
    toOrder({
      ...base,
      id: `or_${prefix}_e3`,
      code: `${labId === 'animal' ? 'AD' : 'AN'}-ORD-0007`,
      kind: 'external',
      serviceId: nude.id,
      serviceName: nude.name,
      itemName: 'BALB/c 裸鼠',
      spec: nude.spec,
      unit: nude.unit,
      quantity: 4,
      unitPriceFen: nude.unitPriceFen,
      auditMode: 'system',
      auditStatus: 'approved',
      fulfillStatus: 'sent',
      source: 'agent',
      applicantName: '外部联系人',
      applicantOrg: '外部单位',
      externalCustomerId: cu[0].id,
      supplierId: `su_${prefix}_2`,
      confirmedAmountFen: 4 * nude.unitPriceFen,
      createdAt: '2026-10-10',
      history: [
        ev('2026-10-10', '李动物', '管理员代录外部客户订单', '外部客户不登录系统'),
        ev('2026-10-11', '李动物', '中心确认通过'),
        ev('2026-10-12', '李动物', '加入外购批次并标记已发送供应商'),
      ],
    }),
    toOrder({
      ...base,
      id: `or_${prefix}_e4`,
      code: `${labId === 'animal' ? 'AD' : 'AN'}-ORD-0008`,
      kind: 'external',
      serviceId: c57.id,
      serviceName: c57.name,
      itemName: 'C57BL/6J 小鼠',
      spec: c57.spec,
      unit: c57.unit,
      quantity: 2,
      unitPriceFen: c57.unitPriceFen,
      auditMode: 'system',
      auditStatus: 'rejected',
      fulfillStatus: 'pending_collect',
      source: 'user',
      applicantName: '学生·冯同学',
      applicantOrg: '护理学院课题组',
      externalCustomerId: cu[1].id,
      supplierId: `su_${prefix}_1`,
      rejectReason: '申请的规格需另行确认后再提交',
      createdAt: '2026-10-17',
      history: [ev('2026-10-17', '冯同学', '使用端提交申请'), ev('2026-10-17', '李动物', '退回申请', '已填写退回原因')],
    }),
    toOrder({
      ...base,
      id: `or_${prefix}_e5`,
      code: `${labId === 'animal' ? 'AD' : 'AN'}-ORD-0014`,
      kind: 'external',
      serviceId: kmExt.id,
      serviceName: kmExt.name,
      itemName: 'KM小鼠',
      spec: kmExt.spec,
      unit: kmExt.unit,
      quantity: 30,
      unitPriceFen: kmExt.unitPriceFen,
      auditMode: 'system',
      auditStatus: 'approved',
      fulfillStatus: 'pending_collect',
      source: 'user',
      applicantName: '学生·许同学',
      applicantOrg: '基础医学院课题组',
      externalCustomerId: cu[0].id,
      supplierId: `su_${prefix}_1`,
      createdAt: '2026-10-23',
      history: [ev('2026-10-23', '许同学', '使用端提交外购申请'), ev('2026-10-23', '李动物', '中心确认通过')],
    }),
    toOrder({
      ...base,
      id: `or_${prefix}_e6`,
      code: `${labId === 'animal' ? 'AD' : 'AN'}-ORD-0015`,
      kind: 'external',
      serviceId: sdExt.id,
      serviceName: sdExt.name,
      itemName: 'SD大鼠',
      spec: sdExt.spec,
      unit: sdExt.unit,
      quantity: 15,
      unitPriceFen: sdExt.unitPriceFen,
      auditMode: 'system',
      auditStatus: 'approved',
      fulfillStatus: 'pending_collect',
      source: 'user',
      applicantName: '学生·何同学',
      applicantOrg: '药学院课题组',
      externalCustomerId: cu[1].id,
      supplierId: `su_${prefix}_1`,
      createdAt: '2026-10-23',
      history: [ev('2026-10-23', '何同学', '使用端提交外购申请'), ev('2026-10-23', '李动物', '中心确认通过')],
    }),
    toOrder({
      ...base,
      id: `or_${prefix}_e7`,
      code: `${labId === 'animal' ? 'AD' : 'AN'}-ORD-0016`,
      kind: 'external',
      serviceId: sdRegion.id,
      serviceName: sdRegion.name,
      itemName: 'SD大鼠（区域现货）',
      spec: sdRegion.spec,
      unit: sdRegion.unit,
      quantity: 6,
      unitPriceFen: sdRegion.unitPriceFen,
      auditMode: 'system',
      auditStatus: 'approved',
      fulfillStatus: 'pending_collect',
      source: 'user',
      applicantName: '学生·邓同学',
      applicantOrg: '公共卫生学院课题组',
      externalCustomerId: cu[0].id,
      supplierId: `su_${prefix}_3`,
      createdAt: '2026-10-24',
      history: [ev('2026-10-24', '邓同学', '使用端提交外购申请'), ev('2026-10-24', '李动物', '中心确认通过')],
    }),
    toOrder({
      ...base,
      id: `or_${prefix}_e8`,
      code: `${labId === 'animal' ? 'AD' : 'AN'}-ORD-0017`,
      kind: 'external',
      serviceId: c57.id,
      serviceName: c57.name,
      itemName: 'C57BL/6J 小鼠',
      spec: c57.spec,
      unit: c57.unit,
      quantity: 5,
      unitPriceFen: c57.unitPriceFen,
      auditMode: 'system',
      auditStatus: 'approved',
      fulfillStatus: 'pending_collect',
      source: 'user',
      applicantName: '教师·韩老师',
      applicantOrg: '口腔医学院课题组',
      externalCustomerId: cu[1].id,
      supplierId: `su_${prefix}_1`,
      createdAt: '2026-10-24',
      history: [ev('2026-10-24', '韩老师', '使用端提交外购申请'), ev('2026-10-24', '李动物', '中心确认通过')],
    }),
    toOrder({
      ...base,
      id: `or_${prefix}_e9`,
      code: `${labId === 'animal' ? 'AD' : 'AN'}-ORD-0018`,
      kind: 'external',
      serviceId: nude.id,
      serviceName: nude.name,
      itemName: 'BALB/c 裸鼠',
      spec: nude.spec,
      unit: nude.unit,
      quantity: 3,
      unitPriceFen: nude.unitPriceFen,
      auditMode: 'system',
      auditStatus: 'approved',
      fulfillStatus: 'pending_collect',
      source: 'user',
      applicantName: '学生·罗同学',
      applicantOrg: '基础医学院课题组',
      externalCustomerId: cu[0].id,
      supplierId: `su_${prefix}_2`,
      createdAt: '2026-10-24',
      history: [ev('2026-10-24', '罗同学', '使用端提交外购申请'), ev('2026-10-24', '李动物', '中心确认通过')],
    }),
    toOrder({
      ...base,
      id: `or_${prefix}_b1`,
      code: `${labId === 'animal' ? 'AD' : 'AN'}-ORD-0009`,
      kind: 'breeding',
      serviceId: breed.id,
      serviceName: breed.name,
      itemName: breed.name,
      spec: breed.spec,
      unit: '笼',
      quantity: 2,
      animalCount: 10,
      feedDays: 14,
      cageType: 'IVC小鼠笼',
      unitPriceFen: breed.unitPriceFen,
      auditMode: 'system',
      auditStatus: 'pending',
      fulfillStatus: 'incoming',
      reserveStatus: 'none',
      expectStartDate: addDays(todayStr(), 1),
      expectEndDate: addDays(todayStr(), 15),
      source: 'user',
      applicantName: '学生·孙同学',
      applicantOrg: '基础医学院课题组',
      projectId: pj[0].id,
      expectDate: addDays(todayStr(), 1),
      remark: '小鼠肿瘤靶向给药实验，拟申办 2 笼 IVC 小鼠位，拟饲养 14 天',
      createdAt: addDays(todayStr(), -1),
      history: [ev(addDays(todayStr(), -1), '孙同学', '提交饲养申办申请，拟入场日：' + addDays(todayStr(), 1))],
    }),
    toOrder({
      ...base,
      id: `or_${prefix}_b2`,
      code: `${labId === 'animal' ? 'AD' : 'AN'}-ORD-0010`,
      kind: 'breeding',
      serviceId: breed.id,
      serviceName: breed.name,
      itemName: breed.name,
      spec: breed.spec,
      unit: '笼',
      quantity: 2,
      animalCount: 20,
      feedDays: 30,
      recommendedCages: 4,
      iacucNo: 'GZMU-IACUC-2026-088',
      preFreezeAmountFen: 60000,
      feeStatus: 'charged',
      unitPriceFen: breed.unitPriceFen,
      auditMode: 'system',
      auditStatus: 'approved',
      fulfillStatus: 'breeding',
      source: 'user',
      applicantName: '教师·李老师',
      applicantOrg: '公共卫生学院课题组',
      projectId: pj[1].id,
      createdAt: '2026-10-19',
      history: [
        ev('2026-10-19', '李老师', '提交饲养申请'),
        ev('2026-10-20', '李动物', '中心排位审核通过'),
        ev('2026-10-20', '李动物', '现场核验入住，正式划扣预付基础饲养费 ¥600.00'),
        ev('2026-11-02', '李动物', '巡房合笼调整：当前在养 2 笼，线下补发饲料平衡'),
      ],
    }),
    toOrder({
      ...base,
      id: `or_${prefix}_b3`,
      code: `${labId === 'animal' ? 'AD' : 'AN'}-ORD-0011`,
      kind: 'breeding',
      serviceId: breed.id,
      serviceName: breed.name,
      itemName: breed.name,
      spec: breed.spec,
      unit: breed.unit,
      quantity: 12,
      unitPriceFen: breed.unitPriceFen,
      auditMode: 'system',
      auditStatus: 'approved',
      fulfillStatus: 'exited',
      source: 'user',
      applicantName: '教师·何老师',
      applicantOrg: '基础医学院课题组',
      projectId: pj[0].id,
      createdAt: '2026-09-28',
      history: [
        ev('2026-09-28', '何老师', '提交饲养申请'),
        ev('2026-09-30', '李动物', '中心确认通过'),
        ev('2026-10-01', '李动物', '实际入场，占用 2 个笼位'),
        ev('2026-10-03', '李动物', '新增 1 个笼位'),
        ev('2026-10-05', '李动物', '退出，释放全部笼位'),
      ],
    }),
    toOrder({
      ...base,
      id: `or_${prefix}_b4`,
      code: `${labId === 'animal' ? 'AD' : 'AN'}-ORD-0012`,
      kind: 'breeding',
      serviceId: hall.id,
      serviceName: hall.name,
      itemName: hall.name,
      spec: hall.spec,
      unit: hall.unit,
      quantity: 6,
      unitPriceFen: hall.unitPriceFen,
      auditMode: 'hall',
      auditStatus: 'pending',
      fulfillStatus: 'incoming',
      source: 'user',
      applicantName: '学生·许同学',
      applicantOrg: '继续教育学院班',
      createdAt: '2026-10-22',
      history: [ev('2026-10-22', '许同学', '提交寄养申请', '服务大厅审批：通过／退回')],
    }),
    toOrder({
      ...base,
      id: `or_${prefix}_b5`,
      code: `${labId === 'animal' ? 'AD' : 'AN'}-ORD-0015`,
      kind: 'breeding',
      serviceId: breed.id,
      serviceName: breed.name,
      itemName: breed.name,
      spec: breed.spec,
      unit: '笼',
      quantity: 2,
      animalCount: 8,
      feedDays: 20,
      cageType: 'IVC小鼠笼',
      allocatedCageIds: [`cg_${prefix}_a9`, `cg_${prefix}_a10`],
      expectStartDate: todayStr(),
      expectEndDate: addDays(todayStr(), 20),
      reserveExpireAt: addDays(todayStr(), 2),
      reserveStatus: 'reserved',
      feeStatus: 'frozen',
      preFreezeAmountFen: 40000,
      unitPriceFen: breed.unitPriceFen,
      auditMode: 'system',
      auditStatus: 'approved',
      fulfillStatus: 'incoming',
      source: 'user',
      applicantName: '学生·赵同学',
      applicantOrg: '药学院新药创制课题组',
      projectId: pj[0].id,
      expectDate: todayStr(),
      remark: '天然药物抗焦虑药效学筛选（已完成 IACUC 伦理审核，保留中待现场核验入住）',
      createdAt: addDays(todayStr(), -1),
      history: [
        ev(addDays(todayStr(), -1), '赵同学', '提交饲养申办申请，拟入场日：' + todayStr()),
        ev(addDays(todayStr(), 0), '李动物', '审核排位通过：锁定笼位 A-109、A-110；48小时保留期截止：' + addDays(todayStr(), 2)),
      ],
    }),
    toOrder({
      ...base,
      id: `or_${prefix}_b6`,
      code: `${labId === 'animal' ? 'AD' : 'AN'}-ORD-0016`,
      kind: 'breeding',
      serviceId: breed.id,
      serviceName: breed.name,
      itemName: breed.name,
      spec: breed.spec,
      unit: '笼',
      quantity: 1,
      animalCount: 5,
      feedDays: 10,
      cageType: 'IVC小鼠笼',
      allocatedCageIds: [],
      expectStartDate: addDays(todayStr(), -4),
      expectEndDate: addDays(todayStr(), 6),
      reserveExpireAt: addDays(todayStr(), -2),
      reserveStatus: 'expired_released',
      feeStatus: 'frozen',
      preFreezeAmountFen: 10000,
      unitPriceFen: breed.unitPriceFen,
      auditMode: 'system',
      auditStatus: 'pending',
      fulfillStatus: 'incoming',
      source: 'user',
      applicantName: '学生·钱同学',
      applicantOrg: '法医学系毒理教研室',
      projectId: pj[0].id,
      expectDate: addDays(todayStr(), -4),
      remark: '急性神经毒理学实验（原拟 4 天前到校，逾期 2 天未到，锁定笼位已自动释放）',
      createdAt: addDays(todayStr(), -6),
      history: [
        ev(addDays(todayStr(), -6), '钱同学', '提交饲养申办申请'),
        ev(addDays(todayStr(), -5), '李动物', '审核排位锁定笼位 A-111，保留至 ' + addDays(todayStr(), -2)),
        ev(addDays(todayStr(), -2), '系统', '逾期 2 天未到校办理入住，系统自动释放锁定笼位并打回待重新排位'),
      ],
    }),
  ]
}

/* ---------------- 饲养、笼位占用、费用 ---------------- */

function occupancy(o: Omit<CageOccupancy, 'id'> & { id?: string }): CageOccupancy {
  return { ...o, id: o.id ?? `oc_${Math.random().toString(36).slice(2, 8)}` } as CageOccupancy
}

function seedFeedings(labId: string, prefix: string, ords: Order[]): { feedings: Feeding[]; occupancies: CageOccupancy[] } {
  const b2 = ords.find((o) => o.id === `or_${prefix}_b2`)!
  const b3 = ords.find((o) => o.id === `or_${prefix}_b3`)!
  const feedings: Feeding[] = [
    {
      id: `fd_${prefix}_1`,
      labId,
      orderId: b2.id,
      animalName: b2.itemName,
      spec: '小鼠 20 只',
      quantity: 20,
      unitPriceFen: b2.unitPriceFen,
      status: 'breeding',
      entryAt: '2026-10-20',
      cageIds: [`cg_${prefix}_a1`, `cg_${prefix}_a2`],
      changeLogs: [
        {
          at: '2026-11-02',
          action: '合笼归并（释放 1 笼）',
          note: '巡房发现弱仔合并，释放 A-103 笼位；期初预付款不退，中心线下已补发全价膨化饲料 2 袋',
          operator: '李建国（实验师）',
          beforeCages: 3,
          afterCages: 2,
        },
      ],
    },
    {
      id: `fd_${prefix}_2`,
      labId,
      orderId: b3.id,
      animalName: b3.itemName,
      spec: '小鼠 12 只',
      quantity: 12,
      unitPriceFen: b3.unitPriceFen,
      status: 'exited',
      entryAt: '2026-10-01',
      exitAt: '2026-10-05',
      exitReason: '实验结束',
      cageIds: [],
    },
  ]
  const occupancies: CageOccupancy[] = [
    occupancy({ id: `oc_${prefix}_1`, labId, cageId: `cg_${prefix}_a1`, feedingId: `fd_${prefix}_1`, start: '2026-10-20', end: null, reason: '入场占用', operator: '李动物', createdAt: '2026-10-20' }),
    occupancy({ id: `oc_${prefix}_2`, labId, cageId: `cg_${prefix}_a2`, feedingId: `fd_${prefix}_1`, start: '2026-10-20', end: null, reason: '入场占用', operator: '李动物', createdAt: '2026-10-20' }),
    // [10-01,10-03) 2 笼，[10-03,10-05) 3 笼，单价 10 元/笼/天 → 合计 100 元
    occupancy({ id: `oc_${prefix}_3`, labId, cageId: `cg_${prefix}_a3`, feedingId: `fd_${prefix}_2`, start: '2026-10-01', end: '2026-10-05', reason: '入场占用', operator: '李动物', createdAt: '2026-10-01' }),
    occupancy({ id: `oc_${prefix}_4`, labId, cageId: `cg_${prefix}_a4`, feedingId: `fd_${prefix}_2`, start: '2026-10-01', end: '2026-10-05', reason: '入场占用', operator: '李动物', createdAt: '2026-10-01' }),
    occupancy({ id: `oc_${prefix}_5`, labId, cageId: `cg_${prefix}_a5`, feedingId: `fd_${prefix}_2`, start: '2026-10-03', end: '2026-10-05', reason: '笼位增加', operator: '李动物', createdAt: '2026-10-03' }),
    // 预分配占用锁定 (b5)
    occupancy({ id: `oc_${prefix}_res1`, labId, cageId: `cg_${prefix}_a9`, orderId: `or_${prefix}_b5`, type: 'reserve', start: todayStr(), end: addDays(todayStr(), 20), expireAt: addDays(todayStr(), 2), reason: '排位预分配锁定（保留至 ' + addDays(todayStr(), 2) + '）', operator: '李动物', createdAt: addDays(todayStr(), -1) }),
    occupancy({ id: `oc_${prefix}_res2`, labId, cageId: `cg_${prefix}_a10`, orderId: `or_${prefix}_b5`, type: 'reserve', start: todayStr(), end: addDays(todayStr(), 20), expireAt: addDays(todayStr(), 2), reason: '排位预分配锁定（保留至 ' + addDays(todayStr(), 2) + '）', operator: '李动物', createdAt: addDays(todayStr(), -1) }),
  ]
  return { feedings, occupancies }
}

function seedFees(labId: string, prefix: string, ords: Order[]): Fee[] {
  const i4 = ords.find((o) => o.id === `or_${prefix}_i4`)!
  const i5 = ords.find((o) => o.id === `or_${prefix}_i5`)!
  const e3 = ords.find((o) => o.id === `or_${prefix}_e3`)!
  return [
    {
      id: `fe_${prefix}_1`,
      labId,
      orderId: i4.id,
      kind: 'internal',
      channel: 'internal',
      title: `${i4.itemName} 订购费用`,
      basis: `整单出库 ${i4.quantity} ${i4.unit} × 确认单价 ${(i4.unitPriceFen / 100).toFixed(2)} 元`,
      amountFen: i4.quantity * i4.unitPriceFen,
      createdAt: '2026-10-16',
      operator: '李动物',
    },
    {
      id: `fe_${prefix}_2`,
      labId,
      orderId: i5.id,
      kind: 'internal',
      channel: 'internal',
      title: `${i5.itemName} 订购费用`,
      basis: `整单出库 ${i5.quantity} ${i5.unit} × 确认单价 ${(i5.unitPriceFen / 100).toFixed(2)} 元`,
      amountFen: i5.quantity * i5.unitPriceFen,
      createdAt: '2026-10-13',
      operator: '李动物',
    },
    {
      id: `fe_${prefix}_3`,
      labId,
      orderId: e3.id,
      kind: 'external',
      channel: 'external',
      title: `${e3.itemName} 外购费用（外部结算待确认）`,
      basis: `管理员确认金额 ${((e3.confirmedAmountFen ?? 0) / 100).toFixed(2)} 元`,
      amountFen: e3.confirmedAmountFen ?? 0,
      createdAt: '2026-10-13',
      operator: '李动物',
    },
  ]
}

function seedChargeRequests(labId: string, prefix: string, ords: Order[]): ChargeRequest[] {
  const i5 = ords.find((o) => o.id === `or_${prefix}_i5`)!
  return [
    {
      id: `cr_${prefix}_1`,
      labId,
      feeId: `fe_${prefix}_2`,
      orderId: i5.id,
      bizSeq: `BIZ-${prefix.toUpperCase()}-0001`,
      projectId: `pj_${prefix}_1`,
      applicantName: i5.applicantName,
      amountFen: i5.quantity * i5.unitPriceFen,
      status: 'failed',
      failReason: '学校接口返回：项目可用余额不足',
      queryCount: 1,
      createdAt: '2026-10-13',
      updatedAt: '2026-10-13',
      attempts: [
        { seq: 1, at: '2026-10-13', outcome: 'submit', message: '提交' },
        { seq: 2, at: '2026-10-13', outcome: 'failed', message: '项目可用余额不足' },
      ],
    },
  ]
}

/* ---------------- 组装 ---------------- */

export function createSeedData(): DemoData {
  const menus = buildMenus()
  const orders: Order[] = []
  const stockItems: StockItem[] = []
  const stockFlows: StockFlow[] = []
  const stockChecks: StockCheck[] = []
  const supplierItems: SupplierItem[] = []
  let supplierItemSeq = 0
  const cages: Cage[] = []
  const customers: Customer[] = []
  const suppliers: Supplier[] = []
  const projects: Project[] = []
  const services: Service[] = []
  const feedings: Feeding[] = []
  const occupancies: CageOccupancy[] = []
  const fees: Fee[] = []
  const chargeRequests: ChargeRequest[] = []
  const purchaseBatches: PurchaseBatch[] = []
  const anomalies: PurchaseAnomaly[] = []

  specs.forEach(({ labId, prefix, km, sd, cage }) => {
    const sv = servicesFor(labId, prefix, km, sd, cage)
    const st = stockFor(labId, prefix)
    const cg = cagesFor(labId, prefix)
    const cu = customersFor(labId, prefix)
    const su = suppliersFor(labId, prefix)
    const sui = supplierItemsFor(labId, prefix, supplierItemSeq)
    supplierItemSeq += sui.length
    const pj = projectsFor(labId, prefix)
    const ords = [...orderSeedFor(labId, prefix, sv, pj, cu, st), ...historyOrders(labId, prefix, sv, pj, st)]
    const fd = seedFeedings(labId, prefix, ords)

    services.push(...sv)
    stockItems.push(...st)
    const ss = stockSeed(labId, prefix, prefix === 'ani' ? '李动物' : '张分析', st)
    stockFlows.push(...ss.flows)
    stockChecks.push(...ss.checks)
    cages.push(...cg)
    customers.push(...cu)
    suppliers.push(...su)
    supplierItems.push(...sui)
    projects.push(...pj)
    orders.push(...ords)
    feedings.push(...fd.feedings)
    occupancies.push(...fd.occupancies)
    fees.push(...seedFees(labId, prefix, ords))
    chargeRequests.push(...seedChargeRequests(labId, prefix, ords))

    // 外部已发送订单对应批次
    purchaseBatches.push({
      id: `pb_${prefix}_1`,
      labId,
      supplierId: su[0].id,
      orderIds: [`or_${prefix}_e3`],
      status: 'sent',
      operator: '李动物',
      createdAt: '2026-10-12',
      sentAt: '2026-10-12',
    })

    // 少供异常：关联原外购订单，保留反馈与处理记录
    anomalies.push({
      id: `an_${prefix}_1`,
      labId,
      orderId: `or_${prefix}_e3`,
      supplierId: su[0].id,
      type: 'short',
      description: '学生反馈：实际到货少于申请数量（实际到货 3 只）',
      feedbackBy: '黄同学',
      status: 'following',
      createdAt: '2026-10-16',
      logs: [
        { at: '2026-10-16', text: '管理员代登记学生反馈', actor: '李动物' },
        { at: '2026-10-17', text: '处理状态改为跟进中', actor: '李动物' },
      ],
    })
  })

  // 占用中的笼位与预分配锁定状态同步
  const busy = new Set(occupancies.filter((o) => o.end === null && o.type !== 'reserve').map((o) => o.cageId))
  const reservedCageIds = new Set(occupancies.filter((o) => o.type === 'reserve').map((o) => o.cageId))
  cages.forEach((c) => {
    if (busy.has(c.id)) {
      c.status = 'occupied'
    } else if (reservedCageIds.has(c.id)) {
      c.status = 'reserved'
    }
  })

  return {
    menus,
    roles: ROLES.map((r) => ({ ...r })),
    users: USERS.map((u) => ({ ...u, grants: u.grants.map((g) => ({ ...g })) })),
    services,
    orders,
    customers,
    suppliers,
    supplierItems,
    stockCategories: STOCK_CATEGORIES.map((c) => ({ ...c, lossReasons: [...c.lossReasons] })),
    stockItems,
    stockFlows,
    stockChecks,
    supplyUsages: [],
    purchaseBatches,
    anomalies,
    cages,
    occupancies,
    feedings,
    projects,
    fees,
    chargeRequests,
    logs: [],
    sequences: Object.fromEntries(chargeRequests.map((c) => [`biz:${c.feeId}`, 1])),
    demo: { chargeOutcome: 'success' },
  }
}

const specs = [
  { labId: 'animal', prefix: 'ani', km: 4500, sd: 12000, cage: 1000 },
  { labId: 'analysis', prefix: 'ana', km: 4800, sd: 12600, cage: 1100 },
]

export function createSeedState(): AppState {
  return {
    version: SEED_VERSION,
    currentUserId: USERS[0].id,
    currentLabId: LABS[0].id,
    wholeSchool: false,
    data: createSeedData(),
  }
}
