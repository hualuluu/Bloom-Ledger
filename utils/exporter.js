// 数据导出：Excel 五页签分析包 + JSON 全量备份（需求 3.7）
const util = require('./util')
const xlsx = require('./xlsx')

const INCOME_LABELS = { salary1: '工资①（对象）', salary2: '工资②（我）', fund: '公积金', other: '其他收入' }
const FIXED_LABELS = { house: '房贷', car: '车贷', living: '生活费', fuel: '加油', toll: '过路费', electric: '电费', phone: '话费' }
const PARTNER_LABELS = { toll: '过路费', food: '吃饭', shopping: '京东淘宝', misc: '杂七杂八', insurance: '保险', smoke: '买烟', electric: '电费', fuel: '加油', charge: '充电', phone: '话费' }

// 读取指定月份全部数据
async function loadMonthData(month) {
  const app = getApp()
  const db = wx.cloud.database()
  const [entries, budgets] = await Promise.all([
    util.queryAll('entries', { month }),
    app.getBudgets()
  ])
  let m = null
  try {
    let res = await db.collection('months').where({ key: month }).limit(1).get()
    if (!res.data.length) res = await db.collection('months').where({ month }).limit(1).get()
    m = res.data.length ? res.data[0] : null
  } catch (e) { /* 未填报 */ }
  return { entries, budgets, m }
}

// 组装五页签
function buildSheets(month, data) {
  const { entries, budgets, m } = data
  const sums = util.sumBy(entries, 'category')
  const flexible = entries.reduce((s, e) => s + util.num(e.amount), 0)

  const income = m ? m.income : null
  const fixed = m ? m.fixed : null
  const partner = m ? m.partner : null
  const savings = m ? m.savings : null

  const sumObj = o => o ? Object.values(o).reduce((s, v) => s + util.num(v), 0) : 0
  const incomeTotal = sumObj(income)
  // v3.5 口径：剔除加油/电费/话费旧字段
  const fixedTotal = util.fixedTotal(fixed)
  const partnerTotal = sumObj(partner)
  const totalSpend = fixedTotal + flexible + partnerTotal
  const balance = incomeTotal - totalSpend
  const savingRate = incomeTotal > 0 ? +(balance / incomeTotal * 100).toFixed(1) : 0
  const milkTea = util.num(sums['奶茶咖啡'])
  const milkTeaLimit = util.num(budgets['奶茶咖啡'])
  let netSavings = ''
  if (savings && savings.current !== '' && savings.current != null) {
    netSavings = +(util.num(savings.current) + util.num(savings.deposit) - util.num(savings.huabeiDue)).toFixed(2)
  }

  // 1. 流水明细
  const detailRows = [['日期', '类别', '金额', '备注']]
  entries.slice().sort((a, b) => (a.date < b.date ? -1 : 1)).forEach(e => {
    detailRows.push([e.date, e.category, util.num(e.amount), e.note || ''])
  })
  if (detailRows.length === 1) detailRows.push(['（本月暂无流水）', '', '', ''])

  // 2. 月度总览
  const overRows = [['项目', '金额']]
  if (income) {
    Object.keys(INCOME_LABELS).forEach(k => overRows.push([INCOME_LABELS[k], util.num(income[k])]))
    overRows.push(['收入合计', +incomeTotal.toFixed(2)])
  } else {
    overRows.push(['（本月未填报，仅含流水口径）', ''])
  }
  if (fixed) {
    Object.keys(fixed).forEach(k => {
      if (['fuel', 'electric', 'phone'].indexOf(k) >= 0) return   // v3.5 已移除项不导出
      overRows.push([FIXED_LABELS[k] || k, util.num(fixed[k])])
    })
    overRows.push(['固定合计', +fixedTotal.toFixed(2)])
  }
  overRows.push(['我的灵活支出（流水汇总）', +flexible.toFixed(2)])
  overRows.push(['对象合计', +partnerTotal.toFixed(2)])
  overRows.push(['总支出', +totalSpend.toFixed(2)])
  overRows.push(['月结余', +balance.toFixed(2)])
  overRows.push(['储蓄率（%）', savingRate])
  if (netSavings !== '') overRows.push(['净存款（活期+定存−花呗待还）', netSavings])
  overRows.push(['奶茶咖啡监控', +milkTea.toFixed(2)])
  overRows.push(['奶茶咖啡上限', milkTeaLimit])

  // 3. 对象账单
  const partnerRows = [['项目', '金额']]
  if (partner) Object.keys(PARTNER_LABELS).forEach(k => partnerRows.push([PARTNER_LABELS[k], util.num(partner[k])]))
  partnerRows.push(['对象合计', +partnerTotal.toFixed(2)])

  // 4. 存款快照（v3.6 按账户拆分，旧数据兼容）
  const snapRows = [['项目', '数值']]
  if (savings) {
    snapRows.push(['快照日期', savings.date || ''])
    const ACC = [['wechat', '微信'], ['alipay', '支付宝'], ['wage', '工资卡'], ['daily', '日常卡']]
    const hasNew = ACC.some(([k]) => savings[k] !== '' && savings[k] != null)
    if (hasNew) ACC.forEach(([k, label]) => snapRows.push([label, util.num(savings[k])]))
    else if (savings.current !== '' && savings.current != null) snapRows.push(['活期合计（旧口径）', util.num(savings.current)])
    snapRows.push(['定存', util.num(savings.deposit)])
    snapRows.push(['花呗待还', util.num(savings.huabeiDue)])
    snapRows.push(['花呗月消费', util.num(savings.huabeiSpend)])
    const liquid = hasNew
      ? ACC.reduce((s, [k]) => s + util.num(savings[k]), 0)
      : util.num(savings.current)
    snapRows.push(['净存款（活期类+定存−花呗待还）', +(liquid + util.num(savings.deposit) - util.num(savings.huabeiDue)).toFixed(2)])
  } else {
    snapRows.push(['（本月未填报）', ''])
  }

  // 5. 预算执行
  const budgetRows = [['类别', '上限', '实际', '差异', '状态']]
  const MOUTH = ['餐饮', '零食水果', '奶茶咖啡']
  Object.keys(budgets).forEach(cat => {
    if (cat === '嘴上合计') return
    const limit = util.num(budgets[cat])
    if (!limit) return
    const actual = +util.num(sums[cat]).toFixed(2)
    budgetRows.push([cat, limit, actual, +(actual - limit).toFixed(2), actual > limit ? '超了' : 'OK'])
  })
  const mouthLimit = util.num(budgets['嘴上合计'])
  if (mouthLimit) {
    const mouthActual = +MOUTH.reduce((s, c) => s + util.num(sums[c]), 0).toFixed(2)
    budgetRows.push(['嘴上合计（餐饮+零食+奶茶）', mouthLimit, mouthActual, +(mouthActual - mouthLimit).toFixed(2), mouthActual > mouthLimit ? '超了' : 'OK'])
  }

  return [
    { name: '流水明细', rows: detailRows },
    { name: '月度总览', rows: overRows },
    { name: '对象账单', rows: partnerRows },
    { name: '存款快照', rows: snapRows },
    { name: '预算执行', rows: budgetRows }
  ]
}

// 生成 xlsx 文件并上传云存储，返回 { tempFilePath, fileName }
async function exportExcel(month) {
  const data = await loadMonthData(month)
  const sheets = buildSheets(month, data)
  const buf = xlsx.buildXlsx(sheets)

  const fs = wx.getFileSystemManager()
  const fileName = `阿花记账-${month}.xlsx`
  const localPath = `${wx.env.USER_DATA_PATH}/${fileName}`
  await new Promise((resolve, reject) => {
    fs.writeFile({
      filePath: localPath, data: buf.buffer,
      success: resolve, fail: reject
    })
  })

  const up = await wx.cloud.uploadFile({
    cloudPath: `exports/${Date.now()}-${fileName}`,
    filePath: localPath
  })
  const dl = await wx.cloud.downloadFile({ fileID: up.fileID })
  return { tempFilePath: dl.tempFilePath, fileName }
}

// 生成 JSON 全量备份并上传云存储
async function exportJson() {
  const app = getApp()
  const [entries, months] = await Promise.all([
    util.queryAll('entries', {}),
    util.queryAll('months', {})
  ])
  const payload = {
    app: '阿花记账 Bloom Ledger',
    exportedAt: new Date().toISOString(),
    categories: app.globalData.categories,
    budgets: app.globalData.budgets,
    entries, months
  }
  const fileName = `阿花记账-全量备份-${util.today()}.json`
  const localPath = `${wx.env.USER_DATA_PATH}/${fileName}`
  const fs = wx.getFileSystemManager()
  await new Promise((resolve, reject) => {
    fs.writeFile({
      filePath: localPath, data: JSON.stringify(payload, null, 2),
      success: resolve, fail: reject
    })
  })
  const up = await wx.cloud.uploadFile({
    cloudPath: `backups/${Date.now()}-${fileName}`,
    filePath: localPath
  })
  const dl = await wx.cloud.downloadFile({ fileID: up.fileID })
  return { tempFilePath: dl.tempFilePath, fileName }
}

module.exports = { exportExcel, exportJson, buildSheets }
