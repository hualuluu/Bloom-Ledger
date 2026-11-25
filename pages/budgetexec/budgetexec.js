// 预算执行明细页（需求 3.3/3.6，v3.4 从月报页拆出）
const util = require('../../utils/util')
const app = getApp()

Page({
  data: {
    month: util.monthOf(),
    budgetRows: [],
    mouthRow: null,
    overCount: 0
  },

  onLoad(options) {
    if (options && options.month) this.setData({ month: options.month })
  },

  onShow() { this.load() },
  onPullDownRefresh() { this.load().finally(() => wx.stopPullDownRefresh()) },

  onMonthChange(e) {
    this.setData({ month: e.detail.value.slice(0, 7) })
    this.load()
  },

  async load() {
    const month = this.data.month
    const [entries, budgets] = await Promise.all([
      util.queryAll('entries', { month }),
      app.getBudgets()
    ])
    const sums = util.sumBy(entries, 'category')

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

    this.setData({ budgetRows, mouthRow, overCount: budgetRows.filter(r => r.over).length + (mouthRow && mouthRow.over ? 1 : 0) })
  },

  goBudget() { wx.navigateTo({ url: '/pages/budget/budget' }) }
})
