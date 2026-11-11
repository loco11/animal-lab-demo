/** 演示主线功能走查：内部订单确认→出库→费用→扣费成功；饲养区间计费 100 元；恢复数据 */
import playwrightPkg from '/Users/wuli/.npm/_npx/bbb8a2c4738e2b0c/node_modules/playwright/index.js'
const { chromium } = playwrightPkg

const base = process.argv[2] ?? 'http://localhost:4173/'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []
page.on('pageerror', (err) => errors.push(err.message))

const wait = (ms) => page.waitForTimeout(ms)
const click = async (locator) => locator.first().click()

// 1. 登录为动物中心管理员
await page.goto(base + '#/login', { waitUntil: 'load' })
await wait(300)
await page.locator('.login-box select').first().selectOption('u_animal')
await wait(200)
await click(page.getByRole('button', { name: '进入 PC 管理端' }))
await wait(400)
const navText = await page.locator('.app-nav').innerText()
if (!navText.includes('供应商管理')) throw new Error('导航缺少供应商管理菜单')

// 2. 内部订单：确认 → 出库
await page.goto(base + '#/order', { waitUntil: 'load' })
await wait(300)
await click(page.locator('button.btn-text', { hasText: '确认通过' }))
await wait(400)
await click(page.locator('button.btn-text', { hasText: '出库' }))
await wait(400)
const stockText = await page.goto(base + '#/stock', { waitUntil: 'load' }).then(() => wait(300)).then(() => page.locator('table').first().innerText())
if (!stockText.includes('90')) throw new Error('出库后 KM 小鼠库存应为 90，实际：' + stockText.slice(0, 200))

// 库存流水 → 查看订单来源
await click(page.locator('button.tab', { hasText: '库存流水' }))
await wait(400)
await click(page.locator('button.btn-text', { hasText: '查看订单' }))
await wait(400)
const orderTitle = await page.locator('dialog.dlg .dlg__title').first().innerText()
if (!orderTitle.includes('AD-ORD-0001')) throw new Error('查看订单未打开订单详情：' + orderTitle)
await click(page.locator('dialog.dlg button', { hasText: '关闭' }))
await wait(300)

// 3. 费用：提交扣费 → 查询结果（模拟成功）
await page.goto(base + '#/fee', { waitUntil: 'load' })
await wait(300)
await click(page.locator('button.btn-text', { hasText: '提交扣费' }))
await wait(300)
await page.locator('dialog select').first().selectOption({ index: 1 })
await wait(200)
await click(page.locator('dialog button', { hasText: '确认提交' }))
await wait(400)
await click(page.locator('button.btn-text', { hasText: '查询结果' }))
await wait(400)
const feeTable = await page.locator('table').first().innerText()
if (!feeTable.includes('扣费成功')) throw new Error('扣费后应显示“扣费成功”')

// 4. 饲养区间计费（100 元演示场景）
await page.goto(base + '#/feeding', { waitUntil: 'load' })
await wait(300)
await click(page.locator('button.tab', { hasText: '已退出' }))
await wait(300)
await click(page.locator('button.btn-text', { hasText: '区间计费' }))
await wait(300)
const preview = await page.locator('dialog .hint').first().innerText()
if (!preview.includes('100.00')) throw new Error('区间计费试算应为 ¥100.00，实际：' + preview)
await click(page.locator('dialog button', { hasText: '生成费用' }))
await wait(400)

// 5. 外购订单页签：发送状态筛选与导出；供应商按品类
await page.goto(base + '#/order', { waitUntil: 'load' })
await wait(300)
await click(page.locator('button.tab', { hasText: '外购动物' }))
await wait(400)
const extHeader = await page.locator('table thead').first().innerText()
if (!extHeader.includes('发送状态')) throw new Error('外购订单页签缺少发送状态列')
if (!extHeader.includes('单价（元）') || !extHeader.includes('金额（元）')) throw new Error('外购订单列表缺少单价/金额列')
if ((await page.locator('[data-query-key="sent"]').count()) === 0) throw new Error('外购订单页签缺少发送状态筛选')
const [extDownload] = await Promise.all([page.waitForEvent('download'), click(page.locator('button[data-act="export"]'))])
if (!extDownload.suggestedFilename().includes('外购订单清单')) throw new Error('外购导出文件名异常：' + extDownload.suggestedFilename())
await extDownload.delete().catch(() => {})

// 确认一笔外购订单，供外购汇总使用
await click(page.locator('button.btn-text', { hasText: '确认通过' }).first())
await wait(400)

await page.goto(base + '#/supplier', { waitUntil: 'load' })
await wait(300)
const supHeader = await page.locator('table thead').first().innerText()
if (!supHeader.includes('供应条目') || !supHeader.includes('状态')) throw new Error('供应商页缺少供应条目/状态列')
if ((await page.locator('button.btn-text', { hasText: '编辑' }).count()) === 0) throw new Error('供应商页缺少编辑操作')
if ((await page.locator('button.btn-text', { hasText: '供应条目' }).count()) === 0) throw new Error('供应商页缺少供应条目操作')
await click(page.locator('button.btn-text', { hasText: '供应条目' }))
await wait(300)
const svcTitle = await page.locator('dialog.dlg .dlg__title').first().innerText()
if (!svcTitle.includes('供应条目')) throw new Error('供应条目弹窗未打开：' + svcTitle)
const itemRows = await page.locator('dialog.dlg tbody tr').allInnerTexts()
if (!itemRows.some((t) => t.includes('SI-'))) throw new Error('供应条目弹窗缺少编码')
await click(page.locator('dialog.dlg button', { hasText: '关闭' }))
await wait(200)

// 5.5 外购汇总：未处理/已处理、按供应商导出、标记已处理
await page.goto(base + '#/purchase', { waitUntil: 'load' })
await wait(400)
const purTabs = await page.locator('.tabs').innerText()
if (!purTabs.includes('未处理') || !purTabs.includes('已处理')) throw new Error('外购汇总缺少未处理/已处理页签')
const purPanel = await page.locator('.panel-table').first().innerText()
if (!purPanel.includes('未处理')) throw new Error('外购汇总未处理页缺少状态')
if (!purPanel.includes('品系') || !purPanel.includes('数量合计')) throw new Error('外购汇总缺少品系聚合表头')
await click(page.locator('button[data-orders]').first())
await wait(400)
const itemOrderDlg = page.locator('dialog.dlg').last()
const itemOrderText = await itemOrderDlg.innerText()
if (!itemOrderText.includes('AD-ORD-')) throw new Error('订单数弹窗缺少订单编号')
await click(itemOrderDlg.locator('button', { hasText: '关闭' }))
await wait(200)

await click(page.locator('button[data-act="detail"]').first())
await wait(400)
const detailDlg = page.locator('dialog.dlg').last()
const dlgWidth = await detailDlg.evaluate((el) => el.getBoundingClientRect().width)
if (dlgWidth < 900) throw new Error('外购明细弹窗过窄：' + dlgWidth)
const detailText = await detailDlg.innerText()
if (!detailText.includes('AD-ORD-')) throw new Error('外购汇总明细缺少订单编号')
await click(detailDlg.locator('button.btn-text', { hasText: '详情' }).first())
await wait(400)
const orderDlg = page.locator('dialog.dlg').last()
const purchaseOrderTitle = await orderDlg.locator('.dlg__title').innerText()
if (!purchaseOrderTitle.includes('AD-ORD-')) throw new Error('订单详情未打开：' + purchaseOrderTitle)
await click(orderDlg.locator('button', { hasText: '关闭' }))
await wait(200)
await click(detailDlg.locator('button', { hasText: '关闭' }))
await wait(200)

const [purDownload] = await Promise.all([page.waitForEvent('download'), click(page.locator('button[data-act="export-all"]'))])
if (!purDownload.suggestedFilename().includes('外购未处理清单')) throw new Error('外购汇总导出文件名异常：' + purDownload.suggestedFilename())
await purDownload.delete().catch(() => {})
await click(page.locator('button[data-act="send"]').first())
await wait(500)
await click(page.locator('button.tab', { hasText: '已处理' }))
await wait(400)
const donePanel = await page.locator('.panel-table').first().innerText()
if (!donePanel.includes('已处理')) throw new Error('已处理页签缺少已处理记录')

// 6. 恢复演示数据（顶栏右侧「重置数据」→ 确定重置）
await click(page.locator('button.btn-text', { hasText: '重置数据' }))
await wait(300)
await click(page.locator('dialog button', { hasText: '确定重置' }))
await wait(400)

await browser.close()
if (errors.length) {
  console.log('页面异常：', errors)
  process.exit(1)
}
console.log('演示主线走查通过：出库扣库存、扣费成功、饲养区间计费 100 元、数据恢复')
