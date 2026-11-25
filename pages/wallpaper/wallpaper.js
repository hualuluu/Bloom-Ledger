// 壁纸设置页（需求 3.9）
const wp = require('../../utils/wallpaper')

Page({
  data: {
    presets: [],      // [{name, thumb}]
    current: '',      // 当前模式名
    busy: false
  },

  onShow() {
    wp.applyWallpaper(this)
    this.refresh()
  },

  async refresh() {
    const doc = await getApp().fetchConfig('wallpaper').catch(() => null)
    const current = doc && doc.mode && doc.mode !== 'none' ? doc.mode : ''
    // 预设缩略图直接用 CSS 渐变，不再生成图片
    const presets = wp.PRESETS.map((p, i) => ({
      idx: i,
      name: p.name,
      style: `background-image:linear-gradient(135deg,${p.c1},${p.c2})`
    }))
    this.setData({ presets, current })
  },

  async usePreset(e) {
    if (this.data.busy) return
    const idx = e.currentTarget.dataset.idx
    this.setData({ busy: true })
    wx.showLoading({ title: '应用中…', mask: true })
    try {
      await wp.saveAndApply(`preset-${idx}`, null)
      wp.applyWallpaper(this)
      wx.hideLoading()
      this.setData({ busy: false, current: `preset-${idx}` })
      wx.showToast({ title: '已应用' })
    } catch (err) {
      wx.hideLoading()
      this.setData({ busy: false })
      wx.showModal({ title: '应用失败', content: (err && err.message) || '未知错误，请重试', showCancel: false })
    }
  },

  async pickFromAlbum() {
    if (this.data.busy) return
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album'],
      success: async (res) => {
        this.setData({ busy: true })
        wx.showLoading({ title: '处理中…', mask: true })
        try {
          const jpeg = await wp.toJpeg(res.tempFiles[0].tempFilePath)
          await wp.saveAndApply('custom', jpeg)
          wp.applyWallpaper(this)
          wx.hideLoading()
          this.setData({ busy: false, current: 'custom' })
          wx.showToast({ title: '已应用' })
        } catch (err) {
          wx.hideLoading()
          this.setData({ busy: false })
          wx.showModal({ title: '壁纸设置失败', content: (err && err.message) || '未知错误，请重试', showCancel: false })
        }
      }
    })
  },

  async clear() {
    if (this.data.busy) return
    await wp.clearWallpaper().catch(() => {})
    this.setData({ current: '' })
    wp.applyWallpaper(this)
    wx.showToast({ title: '已恢复默认' })
  }
})
