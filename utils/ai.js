// AI 分析：聚合数据组装（数据最小化，需求 3.5）+ 极简 markdown→html（rich-text 用）
const util = require('./util')

const PARTNER_LABELS = { toll: '过路费', food: '吃饭', shopping: '京东淘宝', misc: '杂七杂八', insurance: '保险', smoke: '买烟', electric: '电费', fuel: '加油', charge: '充电', phone: '话费' }
const INCOME_LABELS = { salary1: '工资①(对象)', salary2: '工资②(我)', fund: '公积金', other: '其他收入' }

// 组装发送给 AI 的聚合数据（不含逐笔流水）
async function buildAggregate(month) {
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

  const sums = util.sumBy(entries, 'category')
  const flexible = +Object.values(sums).reduce((s, v) => s + v, 0).toFixed(2)
  const income = m ? m.income : {}
  const fixed = m ? m.fixed : {}
  const partner = m ? m.partner : {}
  const incomeTotal = +Object.values(income).reduce((s, v) => s + util.num(v), 0).toFixed(2)
  // v3.5 口径：剔除加油/电费/话费旧字段
  const fixedTotal = +util.fixedTotal(fixed).toFixed(2)
  const partnerPairs = Object.keys(PARTNER_LABELS).map(k => [PARTNER_LABELS[k], util.num(partner[k])])
  const partnerTotal = +partnerPairs.reduce((s, p) => s + p[1], 0).toFixed(2)
  const balance = +(incomeTotal - fixedTotal - flexible - partnerTotal).toFixed(2)
  const savingRate = incomeTotal > 0 ? +(balance / incomeTotal * 100).toFixed(1) : 0

  // 预算执行（只给有红线的类）
  const budgetExec = Object.keys(budgets).filter(c => c !== '嘴上合计' && util.num(budgets[c]) > 0)
    .map(c => ({ 类别: c, 上限: budgets[c], 实际: +util.num(sums[c]).toFixed(2) }))
  const mouthActual = +(['餐饮', '零食水果', '奶茶咖啡'].reduce((s, c) => s + util.num(sums[c]), 0)).toFixed(2)

  // 近三月关键数字
  const trend = []
  let mm = month
  for (let i = 0; i < 3; i++) {
    const list = await util.queryAll('entries', { month: mm })
    const f = +list.reduce((s, e) => s + util.num(e.amount), 0).toFixed(2)
    trend.unshift({ 月份: mm, 我的灵活支出: f })
    mm = util.prevMonth(mm)
  }

  return {
    month,            // 云函数校验用（英文键）
    月份: month,      // AI 提示词里用（中文键）
    收入明细: Object.keys(INCOME_LABELS).map(k => [INCOME_LABELS[k], util.num(income[k])]),
    收入合计: incomeTotal,
    固定支出: Object.keys(fixed).filter(k => ['fuel', 'electric', 'phone'].indexOf(k) < 0).map(k => [k, util.num(fixed[k])]),
    固定合计: fixedTotal,
    我的灵活支出: flexible,
    灵活支出分类汇总: Object.keys(sums).map(c => [c, +sums[c].toFixed(2)]).sort((a, b) => b[1] - a[1]).slice(0, 8),
    对象账单各类: partnerPairs,
    对象合计: partnerTotal,
    月结余: balance,
    储蓄率百分比: savingRate,
    预算执行: budgetExec,
    嘴上合计红线: budgets['嘴上合计'],
    嘴上合计实际: mouthActual,
    奶茶咖啡实际: +util.num(sums['奶茶咖啡']).toFixed(2),
    近三月灵活支出: trend,
    是否已填报: !!m
  }
}

// 极简 markdown → html（支持 #/##/### 标题、- 列表、**粗体**、段落；rich-text 渲染用）
function mdToHtml(md) {
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const inline = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
  const lines = String(md || '').split(/\r?\n/)
  const out = []
  let inList = false
  lines.forEach(line => {
    const t = line.trim()
    if (!t) { if (inList) { out.push('</ul>'); inList = false } return }
    const h = t.match(/^(#{1,3})\s+(.*)/)
    if (h) {
      if (inList) { out.push('</ul>'); inList = false }
      const lv = h[1].length
      out.push(`<h${lv}>${inline(h[2])}</h${lv}>`)
      return
    }
    const li = t.match(/^[-*]\s+(.*)/)
    if (li) {
      if (!inList) { out.push('<ul>'); inList = true }
      out.push(`<li>${inline(li[1])}</li>`)
      return
    }
    if (inList) { out.push('</ul>'); inList = false }
    out.push(`<p>${inline(t)}</p>`)
  })
  if (inList) out.push('</ul>')
  return out.join('')
}

module.exports = { buildAggregate, mdToHtml }
