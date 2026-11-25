const util = require('../../utils/util')
const exporter = require('../../utils/exporter')

Page({
  data: {
    month: util.monthOf(),
    busy: false
  },

  onLoad(options) {
    if (options && options.month) this.setData({ month: options.month })
  },

  onMonthChange(e) { this.setData({ month: e.detail.value }) },

  // 导出本月 Excel 分析包 → 预览（预览页右上角可转发到文件传输助手）
  async onExportExcel() {
    if (this.data.busy) return
    this.setData({ busy: true })
    wx.showLoading({ title: '生成中…', mask: true })
    try {
      const { tempFilePath } = await exporter.exportExcel(this.data.month)
      wx.hideLoading()
      await new Promise(resolve => {
        wx.openDocument({
          filePath: tempFilePath,
          fileType: 'xlsx',
          showMenu: true,   // 允许右上角「转发」发给文件传输助手
          success: resolve,
          fail: () => { wx.showToast({ title: '打开失败，可重试', icon: 'none' }); resolve() }
        })
      })
    } catch (e) {
      wx.hideLoading()
      console.error('导出 Excel 失败', e)
      wx.showToast({ title: '导出失败，请重试', icon: 'none' })
    } finally {
      this.setData({ busy: false })
    }
  },

  // 导出 JSON 全量备份 → 直接发送给微信联系人（如文件传输助手）
  async onExportJson() {
    if (this.data.busy) return
    this.setData({ busy: true })
    wx.showLoading({ title: '生成中…', mask: true })
    try {
      const { tempFilePath } = await exporter.exportJson()
      wx.hideLoading()
      await new Promise(resolve => {
        wx.shareFileMessage({
          filePath: tempFilePath,
          fileName: `阿花记账-全量备份-${util.today()}.json`,
          fail: () => { wx.showToast({ title: '已取消或未发送', icon: 'none' }) },
          complete: resolve
        })
      })
    } catch (e) {
      wx.hideLoading()
      console.error('导出 JSON 失败', e)
      wx.showToast({ title: '导出失败，请重试', icon: 'none' })
    } finally {
      this.setData({ busy: false })
    }
  }
})
