/**
 * 库存改造专项走查：类别筛选、损耗登记（原因随类别切换）、流水渲染、盘点提示。
 * 用法：preview 服务运行中执行 `node tests/stock-loss.mjs [baseUrl]`
 */
import playwrightPkg from '/Users/wuli/.npm/_npx/bbb8a2c4738e2b0c/node_modules/playwright/index.js'
const { chromium } = playwrightPkg
import { mkdirSync, writeFileSync, unlinkSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve, dirname } from 'node:path'

const base = process.argv[2] ?? 'http://localhost:4173/'
const outDir = resolve(dirname(fileURLToPath(import.meta.url)), '../docs/screenshots') + '/'
mkdirSync(outDir, { recursive: true })

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(`[console] ${msg.text()}`) })
page.on('pageerror', (err) => errors.push(`[pageerror] ${err.message}`))
page.on('requestfailed', (req) => errors.push(`[requestfailed] ${req.url()}`))
const wait = (ms) => page.waitForTimeout(ms)
const click = async (locator) => locator.first().click()
const fail = (msg) => { throw new Error(msg) }

// 1. 登录动物中心管理员
await page.goto(base + '#/login', { waitUntil: 'load' })
await wait(300)
const loginOpts = await page.locator('.login-box select').first().locator('option').allInnerTexts()
if (!loginOpts.some((o) => o.includes('李动物'))) fail(`登录账号下拉选项文本异常：${loginOpts.join('|')}`)
await page.locator('.login-box select').first().selectOption('u_animal')
await wait(200)
await click(page.getByRole('button', { name: '进入 PC 管理端' }))
await wait(400)

// 2. 库存页：页签与筛选
await page.goto(base + '#/stock', { waitUntil: 'load' })
await wait(400)
const tabsText = await page.locator('.tabs').first().innerText()
for (const t of ['品目台账', '库存流水', '盘点记录']) {
  if (!tabsText.includes(t)) fail(`缺少页签：${t}（实际 ${tabsText}）`)
}
const catSel = page.locator('[data-query-key="category"]')
if ((await catSel.count()) === 0) fail('缺少类别筛选下拉')
const catOptions = await catSel.locator('option').allInnerTexts()
for (const c of ['类别', '实验动物', '饲料垫料', '试剂耗材', '维修配件', '其他物资']) {
  if (!catOptions.some((o) => o.includes(c))) fail(`类别筛选缺少选项：${c}（实际 ${catOptions.join('|')}）`)
}

// 表格类别列显示名称
const tableText = await page.locator('table').first().innerText()
if (!tableText.includes('实验动物')) fail('品目表格未显示类别名称')

// 3. 损耗登记（品目行内入口）：KM 小鼠 120 → 117，原因随类别提供
const kmRow = page.locator('tr', { hasText: 'KM小鼠' }).first()
await click(kmRow.locator('button', { hasText: '损耗' }))
await wait(300)
const dlg = page.locator('.dlg')
if ((await dlg.count()) === 0) fail('损耗登记弹窗未打开')
const itemSel = dlg.locator('[data-key="itemId"]')
if ((await itemSel.inputValue()) !== 'st_ani_km') fail('行内损耗未预选 KM 小鼠')
if (!(await itemSel.isDisabled())) fail('行内损耗应锁定品目')
const itemLabels = await itemSel.locator('option').allInnerTexts()
if (!itemLabels.some((o) => o.includes('KM小鼠')) || !itemLabels.some((o) => o.includes('现存'))) {
  fail(`损耗登记品目下拉选项文本异常：${itemLabels.join('|')}`)
}
await wait(200)
const reasonOptions = await dlg.locator('[data-key="reason"]').locator('option').allInnerTexts()
if (!reasonOptions.includes('死亡') || !reasonOptions.includes('淘汰')) {
  fail(`动物类别损耗原因不正确：${reasonOptions.join('|')}`)
}
await dlg.locator('[data-key="quantity"]').fill('3')
await click(page.getByRole('button', { name: '确认登记' }))
await wait(400)
if ((await page.locator('.dlg').count()) > 0) fail('损耗登记弹窗未关闭')
const stockAfter = await page.locator('table').first().innerText()
if (!stockAfter.includes('117只')) fail(`损耗后 KM 库存应为 117，实际表格：${stockAfter.slice(0, 300)}`)
await page.screenshot({ path: outDir + 'stock-loss-registered.png' })

// 4. 库存流水页签出现损耗行
await click(page.locator('button.tab', { hasText: '库存流水' }))
await wait(400)
const flowText = await page.locator('table').first().innerText()
if (!flowText.includes('损耗')) fail('流水表未显示损耗类型')
if (!flowText.includes('-3')) fail('流水表未显示 -3 数量变化')
if (!flowText.includes('死亡')) fail('流水表未显示损耗原因')
if ((await page.locator('button[data-act="in"]').count()) > 0) fail('库存流水页签不应显示入库登记等台账按钮')

// 种子流水覆盖多类：出库/损耗/盘点调整（入库在更早日期，通过下方的类型筛选验证）
for (const t of ['出库', '损耗', '盘点调整']) {
  if (!flowText.includes(t)) fail(`流水表缺少类型：${t}`)
}
// 汇总（默认近一周，种子流水均在近一周内）
const summaryText = await page.locator('.toolbar .hint').innerText()
if (!/共 \d+ 条/.test(summaryText) || !summaryText.includes('入库合计') || !summaryText.includes('出库合计')) {
  fail(`流水汇总异常：${summaryText}`)
}

// 日期范围默认近一周：开始 = 今天-6，结束 = 今天
const dd = new Date()
const pad = (n) => String(n).padStart(2, '0')
const todayStr0 = `${dd.getFullYear()}-${pad(dd.getMonth() + 1)}-${pad(dd.getDate())}`
const startExpected = (() => { const x = new Date(dd); x.setDate(x.getDate() - 6); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}` })()
const startVal = await page.locator('.query__range input').nth(0).inputValue()
const endVal = await page.locator('.query__range input').nth(1).inputValue()
if (startVal !== startExpected || endVal !== todayStr0) fail(`日期范围默认近一周异常：${startVal} ~ ${endVal}`)

// 类型筛选：入库 → 空；损耗 → 有数据；重置恢复
const typeSel = page.locator('[data-query-key="type"]')
await typeSel.selectOption('in')
await click(page.locator('.query__actions button', { hasText: '查询' }))
await wait(400)
const inFlowText = await page.locator('table').first().innerText()
if (!inFlowText.includes('入库') || inFlowText.includes('损耗') || inFlowText.includes('出库')) {
  fail(`入库筛选结果异常：${inFlowText.slice(0, 200)}`)
}
await typeSel.selectOption('loss')
await click(page.locator('.query__actions button', { hasText: '查询' }))
await wait(400)
const lossFlowText = await page.locator('table').first().innerText()
if (!lossFlowText.includes('损耗')) fail('损耗筛选后无数据')
await click(page.locator('.query__actions button', { hasText: '重置' }))
await wait(400)

// 种子出库行直接显示订单号
if ((await page.locator('button.btn-text', { hasText: '查看订单 AD-ORD-' }).count()) === 0) {
  fail('种子出库流水未显示订单号')
}

// 日期范围合并为一个字段；流水日期精确到秒
if ((await page.locator('.query__range').count()) !== 1) fail('日期范围应合并为一个字段')
if ((await page.locator('.query__range input').count()) !== 2) fail('日期范围应包含开始/结束两个输入')
const firstDate = await page.locator('table tbody tr').first().locator('td').first().innerText()
if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(firstDate.trim())) fail(`流水日期应精确到秒：${firstDate}`)

// 按今天筛选：只保留刚登记的损耗，不含历史种子流水
const d = new Date()
const todayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
await page.locator('.query__range input').nth(0).fill(todayStr)
await page.locator('.query__range input').nth(1).fill(todayStr)
await click(page.locator('.query__actions button', { hasText: '查询' }))
await wait(400)
const todayFlow = await page.locator('table').first().innerText()
if (!todayFlow.includes('-3')) fail('按今天筛选应包含刚登记的损耗')
if (todayFlow.includes('过期')) fail('按今天筛选不应包含历史种子流水')
await click(page.locator('.query__actions button', { hasText: '重置' }))
await wait(400)

// 导出 CSV
const [download] = await Promise.all([page.waitForEvent('download'), click(page.locator('button[data-act="export"]'))])
if (!download.suggestedFilename().includes('库存流水')) fail(`导出文件名异常：${download.suggestedFilename()}`)
await download.delete().catch(() => {})

await page.screenshot({ path: outDir + 'stock-loss-flow.png' })

// 5. 类别筛选：只看维修配件（种子无该类别品目 → 空表提示）
await click(page.locator('button.tab', { hasText: '品目台账' }))
await wait(300)
await catSel.selectOption('cat_part')
await click(page.getByRole('button', { name: '查询' }))
await wait(400)
const emptyText = await page.locator('table').first().innerText()
if (!(emptyText.includes('未找到符合条件的数据') || emptyText.includes('暂无库存品目'))) {
  fail(`维修配件筛选后应显示空表提示，实际：${emptyText.slice(0, 200)}`)
}
await page.screenshot({ path: outDir + 'stock-category-filter.png' })

// 6. 新建档弹窗：批量导入说明 + 安全库存字段
await click(page.getByRole('button', { name: '新增品目' }))
await wait(300)
const createDlg = page.locator('.dlg')
if ((await createDlg.count()) === 0) fail('新增建档弹窗未打开')
const createText = await createDlg.innerText()
if (!createText.includes('首次使用可批量导入现有台账')) fail('建档弹窗缺少批量导入说明')
if ((await createDlg.locator('[data-key="safeStock"]').count()) === 0) fail('建档弹窗缺少安全库存字段')
await click(createDlg.getByRole('button', { name: '取消' }))
await wait(200)

// 7. 重置筛选（导入验证需要看到全部品目）
await click(page.locator('.query__actions button', { hasText: '重置' }))
await wait(300)

// 8. 入库登记字段与提交：入库日期默认今天
await click(page.locator('button[data-act="in"]'))
await wait(300)
const inDlg = page.locator('.dlg')
const inDate = await inDlg.locator('[data-key="at"]').inputValue()
if (!/^\d{4}-\d{2}-\d{2}$/.test(inDate)) fail(`入库日期默认值异常：${inDate}`)
const supplierSel = inDlg.locator('[data-key="supplierId"]')
if (!(await supplierSel.isDisabled())) fail('中心自产时供应商应禁用')
await inDlg.locator('[data-key="sourceType"]').selectOption('supplier')
await wait(200)
if (await supplierSel.isDisabled()) fail('供应商到货时供应商应可选')
await inDlg.locator('[data-key="itemId"]').selectOption('st_ani_km')
await inDlg.locator('[data-key="quantity"]').fill('10')
await inDlg.locator('[data-key="reason"]').fill('供应商送货')
await click(inDlg.getByRole('button', { name: '确认入库' }))
await wait(400)
if ((await page.locator('.dlg').count()) === 0) fail('供应商到货未选供应商时不应提交成功')
await inDlg.locator('[data-key="supplierId"]').selectOption('su_ani_1')
await click(inDlg.getByRole('button', { name: '确认入库' }))
await wait(400)
if ((await page.locator('.dlg').count()) === 0) fail('供应商到货未选供应条目时不应提交成功')
const itemOptions = await inDlg.locator('[data-key="supplierItemId"] option').allInnerTexts()
if (!itemOptions.some((o) => o.includes('SI-'))) fail(`供应条目下拉未加载：${itemOptions.join('|')}`)
await inDlg.locator('[data-key="supplierItemId"]').selectOption('si_ani_km')
await click(inDlg.getByRole('button', { name: '确认入库' }))
await wait(400)
if ((await page.locator('.dlg').count()) > 0) fail('入库登记弹窗未关闭')
const afterIn = await page.locator('table').first().innerText()
if (!afterIn.includes('127只')) fail(`入库后 KM 库存应为 127，实际：${afterIn.slice(0, 300)}`)

// 9. 批量导入：模板下载按钮 + 按模板 CSV 导入（期初数量生成流水）
if ((await page.locator('button[data-act="import"]').count()) === 0) fail('缺少批量导入入口')
await click(page.locator('button[data-act="import"]'))
await wait(300)
const impDlg = page.locator('.dlg')
if ((await impDlg.getByRole('button', { name: '下载导入模板' }).count()) === 0) fail('批量导入缺少模板下载按钮')
const csvPath = fileURLToPath(new URL('./tmp-import.csv', import.meta.url))
writeFileSync(
  csvPath,
  '\ufeff类别,品目名称,规格型号,计量单位,存放位置,安全库存,期初数量\n实验动物,BALB/c小鼠,SPF级 6周龄,只,屏障环境 A 区,10,100\n维修配件,六角螺栓,M6×30,盒,维修间,5,30\n',
  'utf8',
)
await impDlg.locator('input[type="file"]').setInputFiles(csvPath)
await click(impDlg.getByRole('button', { name: '开始导入' }))
await wait(600)
const impResult = await impDlg.locator('[data-act="result"]').innerText()
if (!impResult.includes('成功 2 条')) fail(`批量导入结果异常：${impResult}`)
await click(impDlg.getByRole('button', { name: '取消' }))
await wait(400)
const afterImport = await page.locator('table').first().innerText()
if (!afterImport.includes('BALB/c小鼠') || !afterImport.includes('100只')) fail('导入后台账缺少 BALB/c小鼠 或数量不对')
if (!afterImport.includes('六角螺栓') || !afterImport.includes('30盒')) fail('导入后台账缺少 六角螺栓 或数量不对')
await page.screenshot({ path: outDir + 'stock-import.png' })
unlinkSync(csvPath)

// 10. 库存流水出现期初入库记录
await click(page.locator('button.tab', { hasText: '库存流水' }))
await wait(400)
const flowAfterImport = await page.locator('table').first().innerText()
if (!flowAfterImport.includes('期初库存导入')) fail('库存流水缺少「期初库存导入」记录')
if (!flowAfterImport.includes('供应商送货')) fail('库存流水缺少入库来源')
if (!flowAfterImport.includes('维通利华')) fail('库存流水缺少入库供应商')
if (!flowAfterImport.includes('KM小鼠')) fail('库存流水缺少供应条目')

// 10.5 盘点记录页签：批量盘点、筛选、汇总、查看流水、导出
await click(page.locator('button.tab', { hasText: '盘点记录' }))
await wait(400)
if ((await page.locator('button[data-act="in"]').count()) > 0) fail('盘点记录页签不应显示台账按钮')
if ((await page.locator('button[data-act="batch-check"]').count()) === 0) fail('盘点记录页签缺少发起盘点')
if ((await page.locator('button[data-act="export-check"]').count()) === 0) fail('盘点记录页签缺少导出')
const checkHeader = await page.locator('table thead').first().innerText()
if (!checkHeader.includes('盘点单号') || !checkHeader.includes('实盘数')) fail('盘点记录表头异常')
const summaryBefore = await page.locator('.toolbar .hint').innerText()
if (!/共 \d+ 条/.test(summaryBefore)) fail(`盘点汇总异常：${summaryBefore}`)

// 发起盘点：KM 实盘数 -2，其余按账面数提交（零差异留痕）
await click(page.locator('button[data-act="batch-check"]'))
await wait(400)
const batchDlg = page.locator('.dlg')
if ((await batchDlg.count()) === 0) fail('发起盘点弹窗未打开')
const kmInput = batchDlg.locator('input[data-item="st_ani_km"]')
const kmBefore = Number(await kmInput.inputValue())
await kmInput.fill(String(kmBefore - 2))
await wait(200)
const diffCell = await batchDlg.locator('[data-diff="st_ani_km"]').innerText()
if (!diffCell.includes('-2')) fail(`盘点差异未实时计算：${diffCell}`)
const batchRows = await batchDlg.locator('tbody tr').count()
await click(batchDlg.getByRole('button', { name: '提交盘点' }))
await wait(500)
if ((await page.locator('.dlg').count()) > 0) fail('提交盘点后弹窗未关闭')
const summaryAfter = await page.locator('.toolbar .hint').innerText()
if (!summaryAfter.includes('盘亏合计 -') || !summaryAfter.includes('有差异')) fail(`盘点汇总未更新：${summaryAfter}`)
const checkCountAfter = await page.locator('table tbody tr').count()
if (checkCountAfter < batchRows) fail(`盘点记录数量未增加：批 ${batchRows} 行，现存 ${checkCountAfter} 行`)

// 筛选：有差异 / 无差异
await page.locator('[data-query-key="diff"]').selectOption('yes')
await click(page.locator('.query__actions button', { hasText: '查询' }))
await wait(400)
const diffYesCells = (await page.locator('table tbody tr td:nth-child(6)').allInnerTexts()).map((t) => t.trim())
if (!diffYesCells.some((t) => t.includes('盘亏 -2'))) fail(`有差异筛选结果异常：${diffYesCells.join('|')}`)
await page.locator('[data-query-key="diff"]').selectOption('no')
await click(page.locator('.query__actions button', { hasText: '查询' }))
await wait(400)
const diffNoCells = (await page.locator('table tbody tr td:nth-child(6)').allInnerTexts()).map((t) => t.trim())
if (diffNoCells.some((t) => t !== '0')) fail(`无差异筛选不应包含差异记录：${diffNoCells.join('|')}`)
await click(page.locator('.query__actions button', { hasText: '重置' }))
await wait(400)

// 查看盘点对应流水
await click(page.locator('table tbody tr').first().locator('button', { hasText: '流水' }))
await wait(400)
const checkFlowTitle = await page.locator('dialog.dlg .dlg__title').first().innerText()
if (!checkFlowTitle.includes('盘点流水')) fail(`查看流水未打开：${checkFlowTitle}`)
await click(page.locator('dialog.dlg button', { hasText: '关闭' }))
await wait(200)

// 导出盘点记录
const [checkDownload] = await Promise.all([
  page.waitForEvent('download'),
  click(page.locator('button[data-act="export-check"]')),
])
if (!checkDownload.suggestedFilename().includes('盘点记录')) fail(`盘点导出文件名异常：${checkDownload.suggestedFilename()}`)
await checkDownload.delete().catch(() => {})
await page.screenshot({ path: outDir + 'stock-check-tab.png' })

// 11. 预警品目：种子数据中的裸鼠、高脂造模饲料低于安全库存
await click(page.locator('button.tab', { hasText: '品目台账' }))
await wait(300)
await click(page.locator('button[data-act="low"]'))
await wait(400)
const lowText = await page.locator('table').first().innerText()
if (!lowText.includes('裸鼠') || !lowText.includes('高脂造模饲料')) fail(`预警品目缺少裸鼠或高脂饲料：${lowText.slice(0, 300)}`)
if (!lowText.includes('低于安全库存')) fail('预警状态未显示')
await page.screenshot({ path: outDir + 'stock-low-stock.png' })
await click(page.locator('button[data-act="low"]'))
await wait(300)

await browser.close()
if (errors.length) {
  console.error('控制台异常：\n' + errors.join('\n'))
  process.exit(1)
}
console.log('库存改造走查通过：页签 / 类别筛选 / 损耗登记（原因随类别）/ 流水 / 空表提示 / 建档弹窗 / 入库登记字段 / 批量导入（模板+期初流水）')
