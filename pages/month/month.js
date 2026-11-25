const util = require('../../utils/util')

// v3.5 起固定支出去重：加油/电费/话费移至对象账单，不再计入固定支出
const DEFAULTS = {
  income: { salary1: '15000', salary2: '4800', fund: '4580', other: '0' },
  fixed: { house: '3728', car: '3333', living: '2500', toll: '460' },
  partner: { toll: '', food: '', shopping: '', misc: '', insurance: '', smoke: '', electric: '', fuel: '', charge: '', phone: '' }
}
const REMOVED_FIXED = ['fuel', 'electric', 'phone']   // 旧文档可能带这些字段，加载时剔除

Page({
  data: {
    month: util.monthOf(),
    income: { ...DEFAULTS.income },
    fixed: { ...DEFAULTS.fixed },
    partner: { ...DEFAULTS.partner },
    savings: { date: util.snapshotDate(util.monthOf()), wechat: '', alipay: '', wage: '', daily: '', deposit: '', huabeiDue: '', huabeiSpend: '' },
    carNotice: '',

    incomeItems: [{"key": "salary1", "label": "工资①（对象）"}, {"key": "salary2", "label": "工资②（我）"}, {"key": "fund", "label": "公积金"}, {"key": "other", "label": "其他收入"}],
    fixedItems: [{"key": "house", "label": "房贷"}, {"key": "car", "label": "车贷"}, {"key": "living", "label": "生活费"}, {"key": "toll", "label": "过路费"}],
    partnerItems: [{"key": "toll", "label": "过路费"}, {"key": "food", "label": "吃饭"}, {"key": "shopping", "label": "京东淘宝"}, {"key": "misc", "label": "杂七杂八"}, {"key": "insurance", "label": "保险"}, {"key": "smoke", "label": "买烟"}, {"key": "electric", "label": "电费"}, {"key": "fuel", "label": "加油"}, {"key": "charge", "label": "充电"}, {"key": "phone", "label": "话费"}],
  },

  onLoad(options) {
    const month = (options && options.month) || util.monthOf()
    const savings = { ...this.data.savings, date: util.snapshotDate(month) }
    this.setData({ month, savings })
    this.prefill(month)
  },

  // 读填报（months 集合按 key=月份 存，_id 自动生成）
  // 兼容旧版：早期版本可能留下只有 month 字段、随机 _id 的文档
  async fetchMonth(m) {
    const db = wx.cloud.database()
    let res = await db.collection('months').where({ key: m }).limit(1).get()
    if (res.data.length) return res.data[0]
    res = await db.collection('months').where({ month: m }).limit(1).get()
    return res.data.length ? res.data[0] : null
  },

  // 已有本月数据 → 回填；否则继承上月；车贷 2027-02 之后自动为 0
  async prefill(month) {
    try {
      const d = await this.fetchMonth(month)
      if (d) {
        this.setData({
          income: this.toStr(d.income), fixed: this.stripFixed(d.fixed),
          partner: this.toStr(d.partner), savings: this.toStr(d.savings)
        })
        return
      }
    } catch (e) { /* 本月还没填报 */ }

    try {
      const d = await this.fetchMonth(util.prevMonth(month))
      if (d) {
        this.setData({
          income: this.toStr(d.income), fixed: this.stripFixed(d.fixed),
          partner: this.toStr(d.partner),
          savings: this.toStr(d.savings)
        })
        this.setData({ 'savings.date': util.snapshotDate(month) })
      }
    } catch (e) { /* 上月也没有，用代码默认值 */ }

    if (month > '2027-02') {
      this.setData({ 'fixed.car': '0', carNotice: '车贷已于 2027-02 还清，已自动置 0' })
    } else if (month === '2027-02') {
      this.setData({ carNotice: '⚠️ 2027-02 是车贷最后一期，下期自动置 0' })
    }
  },

  toStr(obj) {
    const out = {}
    Object.keys(obj || {}).forEach(k => { out[k] = obj[k] === 0 || obj[k] ? String(obj[k]) : '' })
    return out
  },

  // 固定支出 v3.5 去重：剔除加油/电费/话费（仅用于 fixed 段）
  stripFixed(obj) {
    const out = this.toStr(obj)
    REMOVED_FIXED.forEach(k => { delete out[k] })
    return out
  },

  onField(e) {
    const { sec, field } = e.currentTarget.dataset
    this.setData({ [`${sec}.${field}`]: e.detail.value })
  },

  // v3.6：任一账户字段填写后，旧口径 current 不再保存（完成迁移）
  hasNewAccounts() {
    const s = this.data.savings
    return !!(s.wechat || s.alipay || s.wage || s.daily)
  },

  onSave() {
    const toNums = (obj) => {
      const out = {}
      Object.keys(obj).forEach(k => { out[k] = util.num(obj[k]) })
      return out
    }
    const savingsNums = toNums({
      wechat: this.data.savings.wechat, alipay: this.data.savings.alipay,
      wage: this.data.savings.wage, daily: this.data.savings.daily,
      deposit: this.data.savings.deposit,
      huabeiDue: this.data.savings.huabeiDue, huabeiSpend: this.data.savings.huabeiSpend
    })
    if (!this.hasNewAccounts() && this.data.savings.current) {
      savingsNums.current = util.num(this.data.savings.current)   // 保留旧口径，迁移后可弃
    }
    const data = {
      month: this.data.month,
      income: toNums(this.data.income),
      fixed: toNums(this.data.fixed),
      partner: toNums(this.data.partner),
      savings: { date: this.data.savings.date, ...savingsNums },
      updatedAt: wx.cloud.database().serverDate()
    }
    const db = wx.cloud.database()
    wx.showLoading({ title: '保存中' })
    this.fetchMonth(this.data.month)
      .then(doc => doc
        ? db.collection('months').doc(doc._id).update({ data })
        : db.collection('months').add({ data: { key: this.data.month, ...data } }))
      .then(() => {
        wx.hideLoading()
        wx.showToast({ title: '已保存' })
        setTimeout(() => wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/report/report' }) }), 500)
      })
      .catch(() => { wx.hideLoading(); wx.showToast({ title: '保存失败', icon: 'none' }) })
  }
})
