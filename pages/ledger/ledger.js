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
    editingId: '',    // v3.9：非空表示正在修改这笔
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
      // v3.8：按时间倒序——最新日期在最上，同一天内最新一笔在最上
      list.sort((a, b) => {
        if (a.date !== b.date) return a.date < b.date ? 1 : -1
        // serverDate 读回可能是 Date 或 {$date: ms}，统一取毫秒
        const ms = t => {
          if (!t) return 0
          if (t.$date) return typeof t.$date === 'number' ? t.$date : new Date(t.$date).getTime()
          const n = new Date(t).getTime()
          return isNaN(n) ? 0 : n
        }
        return ms(b.ts) - ms(a.ts)
      })
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
    const data = {
      date: this.data.date,
      month: util.monthOf(this.data.date),
      amount,
      category: this.data.category,
      note: this.data.note.trim()
    }
    try {
      if (this.data.editingId) {
        // v3.9：修改已有流水
        await db.collection('entries').doc(this.data.editingId).update({ data })
        this.setData({ editingId: '', amount: '', note: '' })
        wx.showToast({ title: '已修改' })
      } else {
        await db.collection('entries').add({ data: { ...data, ts: db.serverDate() } })
        this.setData({ amount: '', note: '' })
        wx.vibrateShort && wx.vibrateShort({ type: 'light' })
      }
      this.loadList()
    } catch (e) {
      wx.showToast({ title: '保存失败，请重试', icon: 'none' })
    }
  },

  // v3.9：长按 → 编辑/删除 菜单
  onLongPress(e) {
    const { id, amount, category } = e.currentTarget.dataset
    wx.showActionSheet({
      itemList: ['编辑这笔', '删除这笔'],
      success: (res) => {
        if (res.tapIndex === 0) this.startEdit(id)
        else this.confirmDelete(id, amount, category)
      }
    })
  },

  // 回填到记账区进入编辑态
  startEdit(id) {
    const entry = this.data.groups.reduce((found, g) => found || g.items.find(i => i._id === id), null)
    if (!entry) return
    this.setData({
      editingId: id,
      date: entry.date,
      month: util.monthOf(entry.date),
      amount: String(entry.amount),
      category: entry.category,
      note: entry.note || ''
    })
    wx.pageScrollTo({ scrollTop: 0, duration: 200 })
  },

  // 取消编辑
  cancelEdit() {
    this.setData({ editingId: '', amount: '', note: '', date: util.today(), month: util.monthOf() })
  },

  confirmDelete(id, amount, category) {
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
