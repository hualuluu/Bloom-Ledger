const app = getApp()
const MAX = 16

Page({
  data: { list: [], newName: '' },

  onShow() {
    this.load() },

  async load() {
    const list = await app.getCategories(true)
    this.setData({ list })
  },

  onNewInput(e) { this.setData({ newName: e.detail.value }) },

  async add() {
    const name = this.data.newName.trim()
    if (!name) return
    if (name.length > 6) { wx.showToast({ title: '类别名最多6个字', icon: 'none' }); return }
    if (this.data.list.length >= MAX) { wx.showToast({ title: `最多 ${MAX} 个类别`, icon: 'none' }); return }
    if (this.data.list.some(c => c.name === name)) { wx.showToast({ title: '已存在同名类别', icon: 'none' }); return }
    const list = this.data.list.concat([{ name, enabled: true }])
    await this.saveList(list)
    this.setData({ newName: '' })
    wx.showToast({ title: '已添加' })
  },

  rename(e) {
    const i = e.currentTarget.dataset.index
    const old = this.data.list[i]
    if (old.name === '其他') { wx.showToast({ title: '「其他」不能改名', icon: 'none' }); return }
    wx.showModal({
      title: '改名',
      editable: true,
      placeholderText: old.name,
      success: async (res) => {
        const name = (res.content || '').trim()
        if (!res.confirm || !name || name === old.name) return
        if (name.length > 6) { wx.showToast({ title: '最多6个字', icon: 'none' }); return }
        if (this.data.list.some((c, idx) => idx !== i && c.name === name)) {
          wx.showToast({ title: '已存在同名类别', icon: 'none' }); return
        }
        const list = this.data.list.slice()
        list[i] = { ...old, name }
        await this.saveList(list)
        wx.showToast({ title: '已改名' })
      }
    })
  },

  toggle(e) {
    const i = e.currentTarget.dataset.index
    const item = this.data.list[i]
    if (item.name === '其他') { wx.showToast({ title: '「其他」不能停用', icon: 'none' }); return }
    const list = this.data.list.slice()
    list[i] = { ...item, enabled: !item.enabled }
    this.saveList(list)
  },

  // 删除（二次确认；「其他」不可删；历史流水以文本存储类别名，不受影响）
  remove(e) {
    const i = e.currentTarget.dataset.index
    const item = this.data.list[i]
    if (item.name === '其他') { wx.showToast({ title: '「其他」不能删除', icon: 'none' }); return }
    wx.showModal({
      title: `删除「${item.name}」？`,
      content: '已记的流水不受影响，仅以后记账不再出现该类。',
      confirmText: '删除',
      confirmColor: '#c0392b',
      success: async (res) => {
        if (!res.confirm) return
        const list = this.data.list.slice()
        list.splice(i, 1)
        await this.saveList(list)
        wx.showToast({ title: '已删除' })
      }
    })
  },

  async saveList(list) {
    try {
      await app.saveConfig('categories', { list })
      app.globalData.categories = list
      this.setData({ list })
    } catch (e) {
      wx.showToast({ title: '保存失败', icon: 'none' })
    }
  }
})
