const util = require('../../utils/util')
const app = getApp()

Page({
  data: {
    month: util.monthOf(),
    filled: false,
    stats: null,
    overCount: 0,     // 超标类别数（明细在「预算执行」页）
    hasBudget: false,
    aiEnabled: false, // AI 点评入口（配置 key 并开启后显示）
    mouthRow: null,   // 嘴上合计
    carNotice: ''
  },

  onShow() {
    this.setData({ aiEnabled: getApp().globalData.aiEnabled })
    this.load()
  },
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
      let res = await db.collection('months').where({ key: month }).limit(1).get()
      if (!res.data.length) res = await db.collection('months').where({ month }).limit(1).get()
      m = res.data.length ? res.data[0] : null
    } catch (e) { /* 未填报 */ }

    // ---- 汇总 ----
    const sums = util.sumBy(entries, 'category')
    const flexible = entries.reduce((s, e) => s + util.num(e.amount), 0)
    const income = m ? m.income : null
    const fixed = m ? m.fixed : null
    const partner = m ? m.partner : null
    const savings = m ? m.savings : null

    const incomeTotal = income ? Object.values(income).reduce((s, v) => s + util.num(v), 0) : 0
    // v3.5 口径：剔除加油/电费/话费旧字段（util.fixedTotal 统一处理）
    const fixedTotal = util.fixedTotal(fixed)
    const partnerTotal = partner ? Object.values(partner).reduce((s, v) => s + util.num(v), 0) : 0
    const totalSpend = fixedTotal + flexible + partnerTotal
    const balance = incomeTotal - totalSpend
    const savingRate = incomeTotal > 0 ? (balance / incomeTotal * 100) : 0

    // 净存款（v3.6）：微信+支付宝+工资卡+日常卡+定存−花呗待还；旧数据按 legacy 活期合计兼容
    let netSavings = null
    if (savings) {
      const ACC = ['wechat', 'alipay', 'wage', 'daily']
      const hasNew = ACC.some(k => savings[k] !== '' && savings[k] != null)
      const hasLegacy = savings.current !== '' && savings.current != null
      if (hasNew || hasLegacy) {
        const liquid = hasNew
          ? ACC.reduce((s, k) => s + util.num(savings[k]), 0)
          : util.num(savings.current)
        netSavings = liquid + util.num(savings.deposit) - util.num(savings.huabeiDue)
      }
    }

    let carNotice = ''
    if (fixed && util.num(fixed.car) > 0 && month >= '2027-02') {
      carNotice = month === '2027-02' ? '⚠️ 车贷最后一期，下期自动置 0' : '车贷已到期，记得在填报中保持为 0'
    }

    // ---- 预算执行（v3.4 起明细拆至独立页，月报只留超标数角标） ----
    let overCount = 0
    let hasBudget = false
    Object.keys(budgets).forEach(cat => {
      const limit = util.num(budgets[cat])
      if (!limit) return
      hasBudget = true
      if (cat === '嘴上合计') return
      if (util.num(sums[cat]) > limit) overCount += 1
    })

    const mouthLimit = util.num(budgets['嘴上合计'])
    const mouthActual = util.num(sums['餐饮']) + util.num(sums['零食水果']) + util.num(sums['奶茶咖啡'])
    const mouthRow = mouthLimit ? {
      actual: mouthActual, limit: mouthLimit,
      pct: Math.min(100, mouthActual / mouthLimit * 100),
      over: mouthActual > mouthLimit
    } : null
    if (mouthRow && mouthRow.over) overCount += 1

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
      overCount,
      hasBudget,
      mouthRow, carNotice
    })
  },

  goFill() {
    wx.navigateTo({ url: `/pages/month/month?month=${this.data.month}` })
  },

  goStats() {
    wx.navigateTo({ url: `/pages/stats/stats?month=${this.data.month}` })
  },

  goBudgetExec() {
    wx.navigateTo({ url: `/pages/budgetexec/budgetexec?month=${this.data.month}` })
  },

  goExport() {
    wx.navigateTo({ url: `/pages/export/export?month=${this.data.month}` })
  },

  goAi() {
    wx.navigateTo({ url: `/pages/ai/ai?month=${this.data.month}` })
  },

  // 分享月报卡片（需求 3.10）：canvas 生成 → 保存/转发
  async onShareCard() {
    if (this._sharing) return
    this._sharing = true
    wx.showLoading({ title: '生成卡片…', mask: true })
    try {
      const sharecard = require('../../utils/sharecard')
      const tempPath = await sharecard.buildShareCard(this.data.month)
      wx.hideLoading()
      sharecard.showShareActions(tempPath)
    } catch (e) {
      wx.hideLoading()
      console.error('生成分享卡片失败', e)
      wx.showToast({ title: '生成失败，请重试', icon: 'none' })
    } finally {
      this._sharing = false
    }
  }
})
