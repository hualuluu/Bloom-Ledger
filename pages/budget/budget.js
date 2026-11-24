const app = getApp()

const HARD_LINES = ['奶茶咖啡', '零食水果', '餐饮', '娱乐充值']   // 硬红线：超了警告
const ORDER = ['奶茶咖啡', '零食水果', '餐饮', '娱乐充值', '宝宝', '家人', '社交人情', '购物日用', '居家', '交通']

Page({
  data: { rows: [], mouth: '' },

  onShow() { this.load() },

  async load() {
    const budgets = await app.getBudgets(true)
    const rows = ORDER
      .filter(cat => budgets[cat] !== undefined)
      .map(cat => ({ cat, value: String(budgets[cat]), hard: HARD_LINES.includes(cat) }))
    this.setData({ rows, mouth: budgets['嘴上合计'] !== undefined ? String(budgets['嘴上合计']) : '' })
  },

  onRowInput(e) {
    const i = e.currentTarget.dataset.index
    this.setData({ [`rows[${i}].value`]: e.detail.value })
  },
  onMouthInput(e) { this.setData({ mouth: e.detail.value }) },

  async onSave() {
    const util = require('../../utils/util')
    const lines = {}
    for (const r of this.data.rows) {
      const v = util.num(r.value)
      if (!v && v !== 0) { /* 允许 0 */ }
      lines[r.cat] = v
    }
    lines['嘴上合计'] = util.num(this.data.mouth) || 0
    try {
      await app.saveConfig('budgets', { lines })
      app.globalData.budgets = lines
      wx.showToast({ title: '已保存' })
      setTimeout(() => wx.navigateBack({ fail: () => {} }), 400)
    } catch (e) {
      wx.showToast({ title: '保存失败', icon: 'none' })
    }
  }
})
