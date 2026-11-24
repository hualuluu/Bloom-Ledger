const util = require('../../utils/util')

const DEFAULTS = {
  income: { salary1: '15000', salary2: '4800', fund: '4580', other: '0' },
  fixed: { house: '3728', car: '3333', living: '2500', fuel: '1200', toll: '460', electric: '406', phone: '400' },
  partner: { toll: '', food: '', shopping: '', misc: '', insurance: '', smoke: '', electric: '', fuel: '', charge: '', phone: '' }
}

Page({
  data: {
    month: util.monthOf(),
    income: { ...DEFAULTS.income },
    fixed: { ...DEFAULTS.fixed },
    partner: { ...DEFAULTS.partner },
    savings: { date: util.snapshotDate(util.monthOf()), current: '', deposit: '', huabeiDue: '', huabeiSpend: '' },
    carNotice: '',

    incomeItems: [{"key": "salary1", "label": "工资①（对象）"}, {"key": "salary2", "label": "工资②（我）"}, {"key": "fund", "label": "公积金"}, {"key": "other", "label": "其他收入"}],
    fixedItems: [{"key": "house", "label": "房贷"}, {"key": "car", "label": "车贷"}, {"key": "living", "label": "生活费"}, {"key": "fuel", "label": "加油"}, {"key": "toll", "label": "过路费"}, {"key": "electric", "label": "电费"}, {"key": "phone", "label": "话费"}],
    partnerItems: [{"key": "toll", "label": "过路费"}, {"key": "food", "label": "吃饭"}, {"key": "shopping", "label": "京东淘宝"}, {"key": "misc", "label": "杂七杂八"}, {"key": "insurance", "label": "保险"}, {"key": "smoke", "label": "买烟"}, {"key": "electric", "label": "电费"}, {"key": "fuel", "label": "加油"}, {"key": "charge", "label": "充电"}, {"key": "phone", "label": "话费"}],
  },

  onLoad(options) {
    const month = (options && options.month) || util.monthOf()
    const savings = { ...this.data.savings, date: util.snapshotDate(month) }
    this.setData({ month, savings })
    this.prefill(month)
  },

  // 已有本月数据 → 回填；否则继承上月；车贷 2027-02 之后自动为 0
  async prefill(month) {
    const db = wx.cloud.database()
    try {
      const res = await db.collection('months').doc(month).get()
      const d = res.data
      this.setData({
        income: this.toStr(d.income), fixed: this.toStr(d.fixed),
        partner: this.toStr(d.partner), savings: this.toStr(d.savings)
      })
      return
    } catch (e) { /* 本月还没填报 */ }

    try {
      const res = await db.collection('months').doc(util.prevMonth(month)).get()
      const d = res.data
      this.setData({
        income: this.toStr(d.income), fixed: this.toStr(d.fixed),
        partner: this.toStr(d.partner),
        savings: this.toStr(d.savings)
      })
      this.setData({ 'savings.date': util.snapshotDate(month) })
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

  onField(e) {
    const { sec, field } = e.currentTarget.dataset
    this.setData({ [`${sec}.${field}`]: e.detail.value })
  },

  onSave() {
    const toNums = (obj) => {
      const out = {}
      Object.keys(obj).forEach(k => { out[k] = util.num(obj[k]) })
      return out
    }
    const data = {
      month: this.data.month,
      income: toNums(this.data.income),
      fixed: toNums(this.data.fixed),
      partner: toNums(this.data.partner),
      savings: { date: this.data.savings.date, ...toNums({ current: this.data.savings.current, deposit: this.data.savings.deposit, huabeiDue: this.data.savings.huabeiDue, huabeiSpend: this.data.savings.huabeiSpend }) },
      updatedAt: wx.cloud.database().serverDate()
    }
    const db = wx.cloud.database()
    wx.showLoading({ title: '保存中' })
    db.collection('months').doc(this.data.month).get()
      .then(() => db.collection('months').doc(this.data.month).update({ data }))
      .catch(() => db.collection('months').add({ data: { ...data, _id: this.data.month } }))
      .then(() => {
        wx.hideLoading()
        wx.showToast({ title: '已保存' })
        setTimeout(() => wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/report/report' }) }), 500)
      })
      .catch(() => { wx.hideLoading(); wx.showToast({ title: '保存失败', icon: 'none' }) })
  }
})
