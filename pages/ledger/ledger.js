const util = require('../../utils/util')
const app = getApp()

Page({
  data: {
    date: util.today(),
    month: util.monthOf(),
    amount: '',
    category: '',
    categories: [],   // 仅启用的
    note: '',
    groups: [],       // [{date, total, items:[]}]
    totalCount: 0,
    totalSum: '0.00'
  },

  onShow() {
    this.initCategories()
    this.loadList()
  },

  onPullDownRefresh() {
    this.loadList().finally(() => wx.stopPullDownRefresh())
  },

  async initCategories() {
    try {
      const list = await app.getCategories()
      const enabled = list.filter(c => c.enabled)
      this.setData({
        categories: enabled,
        category: enabled.some(c => c.name === this.data.category) ? this.data.category : (enabled[0] ? enabled[0].name : '')
      })
    } catch (e) {
      wx.showToast({ title: '类别加载失败', icon: 'none' })
    }
  },

  async loadList() {
    try {
      const list = await util.queryAll('entries', { month: this.data.month })
      const groups = []
      const index = {}
      list.forEach(e => {
        if (!index[e.date]) {
          index[e.date] = { date: e.date, total: 0, items: [] }
          groups.push(index[e.date])
        }
        index[e.date].items.push(e)
        index[e.date].total += util.num(e.amount)
      })
      groups.forEach(g => { g.total = util.money(g.total) })
      const sum = list.reduce((s, e) => s + util.num(e.amount), 0)
      this.setData({ groups, totalCount: list.length, totalSum: util.money(sum) })
    } catch (e) {
      wx.showToast({ title: '明细加载失败', icon: 'none' })
    }
  },

  onDateChange(e) {
    this.setData({ date: e.detail.value, month: util.monthOf(e.detail.value) })
    this.loadList()
  },

  onAmountInput(e) { this.setData({ amount: e.detail.value }) },
  onNoteInput(e) { this.setData({ note: e.detail.value }) },

  pick(e) { this.setData({ category: e.currentTarget.dataset.name }) },

  async submit() {
    const amount = util.num(this.data.amount)
    if (!amount || amount <= 0) {
      wx.showToast({ title: '请输入金额', icon: 'none' })
      return
    }
    if (!this.data.category) {
      wx.showToast({ title: '请选择类别', icon: 'none' })
      return
    }
    const db = wx.cloud.database()
    try {
      await db.collection('entries').add({
        data: {
          date: this.data.date,
          month: util.monthOf(this.data.date),
          amount,
          category: this.data.category,
          note: this.data.note.trim(),
          ts: db.serverDate()
        }
      })
      this.setData({ amount: '', note: '' })
      wx.vibrateShort && wx.vibrateShort({ type: 'light' })
      this.loadList()
    } catch (e) {
      wx.showToast({ title: '保存失败，请重试', icon: 'none' })
    }
  },

  // 长按删除（二次确认）
  onLongPress(e) {
    const { id, amount, category } = e.currentTarget.dataset
    wx.showModal({
      title: '删除这笔？',
      content: `${category} ¥${amount}`,
      confirmText: '删除',
      confirmColor: '#c0392b',
      success: async (res) => {
        if (!res.confirm) return
        try {
          await wx.cloud.database().collection('entries').doc(id).remove()
          this.loadList()
        } catch (e) {
          wx.showToast({ title: '删除失败', icon: 'none' })
        }
      }
    })
  }
})
