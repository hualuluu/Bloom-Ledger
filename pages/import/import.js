// Excel 导入页（需求 3.8）：从微信聊天选 xlsx → 云函数解析 → 预览 → 确认写入
const util = require('../../utils/util')

Page({
  onShow() {},
  data: {
    step: 'pick',        // pick | preview | done
    busy: false,
    fileName: '',
    parsed: null,        // 云函数返回 { entries, months }
    newEntries: [],      // 去重后待写入
    dupCount: 0,
    monthsLabel: ''
  },

  // 1. 选择微信聊天里的 Excel 文件
  async pickFile() {
    if (this.data.busy) return
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['xlsx'],
      success: async (res) => {
        const file = res.tempFiles[0]
        this.setData({ busy: true, fileName: file.name })
        wx.showLoading({ title: '解析中…', mask: true })
        try {
          const up = await wx.cloud.uploadFile({
            cloudPath: `imports/${Date.now()}-${file.name}`,
            filePath: file.path
          })
          const fn = await wx.cloud.callFunction({
            name: 'importxlsx',
            data: { fileID: up.fileID }
          })
          const parsed = fn.result
          if (!parsed.ok || (!parsed.entries.length && !parsed.months.length)) {
            wx.hideLoading()
            wx.showModal({ title: '没解析到数据', content: '确认选择的是「家庭记账模板」且「我的日常流水」里有数据。', showCancel: false })
            this.setData({ busy: false })
            return
          }
          await this.dedup(parsed)
        } catch (e) {
          wx.hideLoading()
          console.error('导入解析失败', e)
          wx.showModal({ title: '解析失败', content: '请确认已按部署清单上传 importxlsx 云函数，且网络正常。', showCancel: false })
          this.setData({ busy: false })
        }
      }
    })
  },

  // 2. 与云端已有流水去重（日期+类别+金额+备注 完全相同视为已存在）
  async dedup(parsed) {
    const existing = await util.queryAll('entries', {})
    const keys = new Set(existing.map(e => `${e.date}|${e.category}|${e.amount}|${e.note || ''}`))
    const newEntries = parsed.entries.filter(e => !keys.has(`${e.date}|${e.category}|${e.amount}|${e.note || ''}`))
    this.setData({
      busy: false,
      step: 'preview',
      parsed,
      newEntries,
      dupCount: parsed.entries.length - newEntries.length,
      monthsLabel: parsed.months.map(m => m.key).join('、') || '无'
    })
    wx.hideLoading()
  },

  // 3. 确认写入
  async confirm() {
    if (this.data.busy) return
    this.setData({ busy: true })
    wx.showLoading({ title: '导入中…', mask: true })
    const db = wx.cloud.database()
    let ok = 0, fail = 0
    try {
      // 写流水
      for (const e of this.data.newEntries) {
        try {
          await db.collection('entries').add({ data: { ...e, ts: db.serverDate() } })
          ok++
        } catch (err) { fail++ }
      }
      // 写月度填报（key 结构，已存在则跳过，避免覆盖小程序里改过的值）
      let monthSkipped = 0
      for (const m of this.data.parsed.months) {
        const found = await db.collection('months').where({ key: m.key }).limit(1).get()
        if (found.data.length) { monthSkipped++; continue }
        const data = {
          key: m.key,
          month: m.key,
          income: m.income, fixed: m.fixed, partner: m.partner,
          savings: m.savings || { date: util.snapshotDate(m.key), current: 0, deposit: 0, huabeiDue: 0, huabeiSpend: 0 },
          updatedAt: db.serverDate()
        }
        try { await db.collection('months').add({ data }) } catch (err) { monthSkipped++ }
      }
      wx.hideLoading()
      this.setData({ step: 'done', busy: false, doneInfo: { ok, fail, monthCount: this.data.parsed.months.length, monthSkipped } })
    } catch (e) {
      wx.hideLoading()
      this.setData({ busy: false })
      wx.showToast({ title: '导入中断，请重试', icon: 'none' })
    }
  },

  reset() { this.setData({ step: 'pick', parsed: null, newEntries: [], dupCount: 0, fileName: '' }) }
})
