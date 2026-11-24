const util = require('../../utils/util')
const app = getApp()

Page({
  data: {
    month: util.monthOf(),
    filled: false,
    stats: null,
    budgetRows: [],
    mouthRow: null,   // 嘴上合计
    carNotice: ''
  },

  onShow() { this.load() },
  onPullDownRefresh() { this.load().finally(() => wx.stopPullDownRefresh()) },

  onMonthChange(e) {
    this.setData({ month: e.detail.value })
    this.load()
  },

  async load() {
    const month = this.data.month
    const db = wx.cloud.database()

    const [entries, budgets] = await Promise.all([
      util.queryAll('entries', { month }),
      app.getBudgets()
    ])

    let m = null
    try {
      const res = await db.collection('months').doc(month).get()
      m = res.data
    } catch (e) { /* 未填报 */ }

    // ---- 汇总 ----
    const sums = util.sumBy(entries, 'category')
    const flexible = entries.reduce((s, e) => s + util.num(e.amount), 0)
    const income = m ? m.income : null
    const fixed = m ? m.fixed : null
    const partner = m ? m.partner : null
    const savings = m ? m.savings : null

    const incomeTotal = income ? Object.values(income).reduce((s, v) => s + util.num(v), 0) : 0
    const fixedTotal = fixed ? Object.values(fixed).reduce((s, v) => s + util.num(v), 0) : 0
    const partnerTotal = partner ? Object.values(partner).reduce((s, v) => s + util.num(v), 0) : 0
    const totalSpend = fixedTotal + flexible + partnerTotal
    const balance = incomeTotal - totalSpend
    const savingRate = incomeTotal > 0 ? (balance / incomeTotal * 100) : 0

    let netSavings = null
    if (savings && (savings.current !== '' || savings.current === 0) && savings.current != null) {
      netSavings = util.num(savings.current) + util.num(savings.deposit) - util.num(savings.huabeiDue)
    }

    let carNotice = ''
    if (fixed && util.num(fixed.car) > 0 && month >= '2027-02') {
      carNotice = month === '2027-02' ? '⚠️ 车贷最后一期，下期自动置 0' : '车贷已到期，记得在填报中保持为 0'
    }

    // ---- 预算执行 ----
    const budgetRows = []
    Object.keys(budgets).forEach(cat => {
      if (cat === '嘴上合计') return
      const limit = util.num(budgets[cat])
      if (!limit) return
      const actual = util.num(sums[cat])
      budgetRows.push({
        cat, limit, actual,
        pct: Math.min(100, actual / limit * 100),
        over: actual > limit
      })
    })
    budgetRows.sort((a, b) => (b.actual / b.limit) - (a.actual / a.limit))

    const mouthLimit = util.num(budgets['嘴上合计'])
    const mouthActual = util.num(sums['餐饮']) + util.num(sums['零食水果']) + util.num(sums['奶茶咖啡'])
    const mouthRow = mouthLimit ? {
      actual: mouthActual, limit: mouthLimit,
      pct: Math.min(100, mouthActual / mouthLimit * 100),
      over: mouthActual > mouthLimit
    } : null

    this.setData({
      filled: !!m,
      stats: {
        incomeTotal: util.money(incomeTotal),
        fixedTotal: util.money(fixedTotal),
        flexible: util.money(flexible),
        partnerTotal: util.money(partnerTotal),
        totalSpend: util.money(totalSpend),
        balance: util.money(balance),
        savingRate: savingRate.toFixed(1),
        netSavings: netSavings == null ? null : util.money(netSavings),
        milkTea: util.money(util.num(sums['奶茶咖啡'])),
        milkTeaBudget: util.num(budgets['奶茶咖啡'])
      },
      budgetRows, mouthRow, carNotice
    })
  },

  goFill() {
    wx.navigateTo({ url: `/pages/month/month?month=${this.data.month}` })
  }
})
