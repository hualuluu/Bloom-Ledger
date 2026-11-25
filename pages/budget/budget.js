const app = getApp()

const HARD_LINES = ['奶茶咖啡', '零食水果', '餐饮', '娱乐充值']   // 硬红线：超了警告
const ORDER = ['奶茶咖啡', '零食水果', '餐饮', '娱乐充值', '宝宝', '家人', '社交人情', '购物日用', '居家', '交通']
const MOUTH_CATS = ['奶茶咖啡', '零食水果', '餐饮']                 // 嘴上合计联动项

Page({
  data: { rows: [], mouthSum: '0' },

  onShow() {
    this.load() },

  async load() {
    const budgets = await app.getBudgets(true)
    const rows = ORDER
      .filter(cat => budgets[cat] !== undefined)
      .map(cat => ({ cat, value: String(budgets[cat]), hard: HARD_LINES.includes(cat) }))
    this.setData({ rows, mouthSum: this.calcMouth(rows) })
  },

  // 嘴上合计 = 餐饮+零食水果+奶茶咖啡 三项红线之和（自动联动）
  calcMouth(rows) {
    rows = rows || this.data.rows
    const sum = MOUTH_CATS.reduce((s, cat) => {
      const r = rows.find(x => x.cat === cat)
      return s + (r ? Number(r.value) || 0 : 0)
    }, 0)
    return String(sum)
  },

  onRowInput(e) {
    const i = e.currentTarget.dataset.index
    const rows = this.data.rows.slice()
    rows[i] = { ...rows[i], value: e.detail.value }
    this.setData({ [`rows[${i}].value`]: e.detail.value, mouthSum: this.calcMouth(rows) })
  },

  async onSave() {
    const util = require('../../utils/util')
    const lines = {}
    for (const r of this.data.rows) {
      lines[r.cat] = util.num(r.value)
    }
    lines['嘴上合计'] = util.num(this.data.mouthSum)   // 联动值，保存时取当前三项之和
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
