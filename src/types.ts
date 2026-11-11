/** 领域模型：所有金额以「分」存储，所有日期以 YYYY-MM-DD 字符串存储 */

/** 内置角色代码，对应种子角色；菜单与操作授权以角色数据为准 */
export type RoleCode = 'super' | 'lab_admin' | 'finance' | 'teacher'

/* ---------------- 平台基础对象 ---------------- */

export type MenuType = 'dir' | 'menu' | 'action'

export interface MenuNode {
  id: string
  parentId: string | null
  title: string
  type: MenuType
  /** type = menu 时的已实现路由；页面入口只能从已实现路由中选择 */
  path?: string
  /** type = action 时的操作权限标识 */
  key?: string
  sort: number
  enabled: boolean
}

export interface Role {
  id: string
  code: RoleCode
  name: string
  enabled: boolean
  /** 系统保护角色：不允许删除或停用，避免演示中权限无法恢复 */
  protected: boolean
  /** 可选的实验室范围（不创建实验室档案页，仅从内置实验室中选择） */
  labIds: string[]
  /** 已授权的菜单与操作（树形授权的扁平结果） */
  menuIds: string[]
  actionKeys: string[]
}

export interface UserRole {
  userId: string
  labId: string
  roleId: string
}

export interface User {
  id: string
  name: string
  /** 工号 / 学号（演示用虚构编号） */
  no: string
  org: string
  enabled: boolean
  grants: UserRole[]
  note?: string
}

export interface Lab {
  id: string
  name: string
  shortName: string
  note?: string
}

/* ---------------- 服务与订单 ---------------- */

export type ServiceType = 'animal' | 'breeding'
export type AuditMode = 'none' | 'system' | 'hall'
export type OrderKind = 'internal' | 'external' | 'breeding'
export type OrderSource = 'user' | 'agent'

export interface Service {
  id: string
  labId: string
  type: ServiceType
  name: string
  spec: string
  unit: string
  /** 单价快照来源：订单确认（订购）或入场（饲养）时取值 */
  unitPriceFen: number
  auditMode: AuditMode
  onSale: boolean
  applyNote: string
  updatedAt: string
  /** 内部动物订购对应的库存品目（按稳定 ID 关联，不依赖名称） */
  stockItemId?: string
  /** 外购动物订购对应的入围供货商（按稳定 ID 关联） */
  supplierId?: string
  /** 供应商的供应条目（品系） */
  supplierItemId?: string
}

export interface OrderEvent {
  at: string
  actor: string
  action: string
  note?: string
}

/** 履约状态按订单类型分别取值，见 FULFILL_TEXT */
export type FulfillStatus =
  | 'pending_out'
  | 'completed'
  | 'pending_collect'
  | 'pending_send'
  | 'sent'
  | 'incoming'
  | 'breeding'
  | 'exited'

export type AuditStatus = 'none' | 'pending' | 'approved' | 'rejected'

export interface Order {
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
  /** 确认时价格快照，服务改价不影响已有订单 */
  unitPriceFen: number
  auditMode: AuditMode
  auditStatus: AuditStatus
  fulfillStatus: FulfillStatus
  source: OrderSource
  /** 内部动物订购关联的库存品目 ID（出库时按 ID 扣减） */
  stockItemId?: string
  /** 外购动物订购关联的入围供货商 ID（创建订单时从服务自动继承或指定） */
  supplierId?: string
  /** 校内申请人（使用端），与使用端操作员、外部客户分别记录 */
  applicantName: string
  applicantOrg: string
  /** 外购订单：外部个人或单位，不登录系统 */
  externalCustomerId?: string
  /** 外购订单：管理员已确认的发生金额（分） */
  confirmedAmountFen?: number
  projectId?: string
  invoiceRequired?: boolean
  rejectReason?: string
  expectDate?: string
  remark?: string
  /** 饲养预定业务扩展字段 */
  expectStartDate?: string
  expectEndDate?: string
  feedDays?: number
  animalCount?: number
  recommendedCages?: number
  allocatedCageIds?: string[]
  reserveExpireAt?: string
  reserveStatus?: 'none' | 'reserved' | 'expired_released' | 'checked_in'
  cageType?: string
  iacucNo?: string
  preFreezeAmountFen?: number
  feeStatus?: 'frozen' | 'charged' | 'unpaid'
  createdAt: string
  updatedAt: string
  history: OrderEvent[]
}

export interface Customer {
  id: string
  labId: string
  name: string
  type: 'person' | 'org'
  contact: string
  phone: string
  note?: string
}

/* ---------------- 库存 ---------------- */

/** 库存类别档案：校级预置数据。新增类别只需增加一条配置，不改业务代码 */
export interface StockCategoryDef {
  id: string
  name: string
  /** 活体动物标记：订购出库只选动物类，饲养领用只选非动物类 */
  isAnimal: boolean
  /** 损耗登记的原因选项，随类别提供 */
  lossReasons: string[]
  sort: number
  enabled: boolean
}

export interface StockItem {
  id: string
  labId: string
  /** 类别档案 ID，见 stockCategories */
  category: string
  name: string
  spec: string
  unit: string
  quantity: number
  /** 周龄等登记规格，不随日期自动变化 */
  safeStock: number
  location: string
  refPriceFen: number
}

/** 入库来源类型：内部自产 / 外部供应商 / 调拨 / 其他 */
export type StockSourceType = 'internal' | 'supplier' | 'transfer' | 'other'

export interface StockFlow {
  id: string
  labId: string
  itemId: string
  /** in 入库；out 业务出库；loss 损耗；check 盘点调整 */
  type: 'in' | 'out' | 'loss' | 'check'
  /** 入库来源类型（仅入库流水使用）：中心自产 / 供应商到货 / 调拨 / 其他 */
  sourceType?: StockSourceType
  /** 入库来源为外部供应商时的供应商 ID */
  supplierId?: string
  /** 入库来源对应的供应商条目 */
  supplierItemId?: string
  quantity: number
  before: number
  after: number
  reason: string
  refType: 'manual' | 'order' | 'feeding' | 'loss' | 'check'
  refId: string
  operator: string
  createdAt: string
}

export interface StockCheck {
  id: string
  labId: string
  /** 一次盘点提交共享的盘点单号，如 PD-20261110-214005 */
  batchNo: string
  flowId: string
  itemId: string
  before: number
  counted: number
  diff: number
  reason: string
  operator: string
  createdAt: string
}

export interface SupplyUsage {
  id: string
  labId: string
  itemId: string
  feedingId: string
  orderId: string
  quantity: number
  operator: string
  createdAt: string
}

/* ---------------- 外购与供应商 ---------------- */

export interface Supplier {
  id: string
  labId: string
  name: string
  contact: string
  phone: string
  /** 启用状态：停用后不再出现在服务/汇总选择中 */
  enabled: boolean
  note?: string
}

/** 供应条目：某家供应商可供的动物品系或物资品种（固定编码，名称可重复） */
export interface SupplierItem {
  id: string
  /** 系统固定编码，如 SI-0001 */
  code: string
  labId: string
  supplierId: string
  /** 条目类型：动物品系 / 物资品种 */
  kind: 'animal' | 'supply'
  name: string
  spec: string
  unit: string
  /** 单价（分）；订单金额=单价×数量 */
  priceFen: number
  enabled: boolean
  note?: string
}

export interface PurchaseBatch {
  id: string
  labId: string
  supplierId: string
  orderIds: string[]
  status: 'draft' | 'sent'
  operator: string
  createdAt: string
  sentAt?: string
}

export type AnomalyType = 'short' | 'dead' | 'other'
export type AnomalyStatus = 'pending' | 'following' | 'resolved'

export interface PurchaseAnomaly {
  id: string
  labId: string
  orderId: string
  supplierId: string
  type: AnomalyType
  description: string
  feedbackBy: string
  status: AnomalyStatus
  createdAt: string
  logs: { at: string; text: string; actor: string }[]
}

/* ---------------- 笼位与饲养 ---------------- */

export type CageStatus = 'free' | 'occupied' | 'disabled' | 'reserved' | 'cleaning'

export interface Cage {
  id: string
  labId: string
  code: string
  room: string
  env: 'SPF' | '普通'
  capacity: number
  status: CageStatus
  note?: string
  /** 物理楼栋，如：贵安校区实验动物主楼、北京路校区医学科研楼 */
  building?: string
  /** 物理楼层，如：1F、2F */
  floor?: string
  /** 所在机架编号，如：01号IVC小鼠笼架、02号大鼠笼架 */
  rack?: string
  /** 物理笼型规格，如 SPF-IVC-MOUSE、SPF-IVC-RAT、COMMON-MOUSE 等 */
  cageType?: string
}

export interface CageOccupancy {
  id: string
  labId: string
  cageId: string
  feedingId?: string
  orderId?: string
  /** 占用性质：审批时的预分配锁定，或现场入住后的真实在养 */
  type?: 'reserve' | 'actual'
  /** 开始日含 */
  start: string
  /** 结束日不含；null 表示仍占用 */
  end: string | null
  /** 预分配保留截止时间 (拟入场日 + 2天) */
  expireAt?: string
  reason: string
  operator: string
  createdAt: string
}

export type FeedingStatus = 'incoming' | 'breeding' | 'exited'

export interface FeedingChangeLog {
  at: string
  action: string
  note: string
  operator?: string
  beforeCages: number
  afterCages: number
}

export interface Feeding {
  id: string
  labId: string
  orderId: string
  animalName: string
  spec: string
  quantity: number
  /** 入场价格快照：每笼每天（分） */
  unitPriceFen: number
  status: FeedingStatus
  entryAt?: string
  exitAt?: string
  exitReason?: string
  cageIds: string[]
  changeLogs?: FeedingChangeLog[]
}

/* ---------------- 费用与学校扣费模拟 ---------------- */

export type SettleChannel = 'internal' | 'external'

export interface Project {
  id: string
  labId: string
  code: string
  name: string
  owner: string
  enabled: boolean
}

export interface Fee {
  id: string
  labId: string
  orderId: string
  kind: OrderKind
  channel: SettleChannel
  title: string
  basis: string
  amountFen: number
  periodStart?: string
  periodEnd?: string
  createdAt: string
  operator: string
}

export type ChargeStatus = 'processing' | 'success' | 'failed'

export interface ChargeAttempt {
  seq: number
  at: string
  outcome: 'submit' | 'query' | 'processing' | 'success' | 'failed' | 'unknown'
  message: string
}

export interface ChargeRequest {
  id: string
  labId: string
  feeId: string
  orderId: string
  /** 业务标识：同一笔费用只对应一个请求，用于防重 */
  bizSeq: string
  projectId: string
  applicantName: string
  amountFen: number
  status: ChargeStatus
  schoolSeq?: string
  failReason?: string
  queryCount: number
  createdAt: string
  updatedAt: string
  attempts: ChargeAttempt[]
}

export interface AuditLog {
  id: string
  labId: string
  at: string
  actor: string
  action: string
  refType: string
  refId: string
}

export interface DemoSettings {
  /** 接口调试选项：仅用于演示三种模拟结果，标明为模拟 */
  chargeOutcome: 'success' | 'failed' | 'unknown'
}

/* ---------------- 状态容器 ---------------- */

export interface DemoData {
  menus: MenuNode[]
  roles: Role[]
  users: User[]
  services: Service[]
  orders: Order[]
  customers: Customer[]
  suppliers: Supplier[]
  supplierItems: SupplierItem[]
  stockCategories: StockCategoryDef[]
  stockItems: StockItem[]
  stockFlows: StockFlow[]
  stockChecks: StockCheck[]
  supplyUsages: SupplyUsage[]
  purchaseBatches: PurchaseBatch[]
  anomalies: PurchaseAnomaly[]
  cages: Cage[]
  occupancies: CageOccupancy[]
  feedings: Feeding[]
  projects: Project[]
  fees: Fee[]
  chargeRequests: ChargeRequest[]
  logs: AuditLog[]
  sequences: Record<string, number>
  demo: DemoSettings
}

export interface AppState {
  /** 种子数据版本：变更时自动重置，保证演示可复现 */
  version: number
  currentUserId: string
  currentLabId: string
  /** 超级管理员的全校视图开关：只读汇总，不可新增或处理业务 */
  wholeSchool: boolean
  data: DemoData
}
