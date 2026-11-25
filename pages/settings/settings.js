Page({
  data: { version: 'v1.7.1', aiEnabled: false },

  onShow() {
    this.setData({ aiEnabled: getApp().globalData.aiEnabled })
  },

  showPrivacy() {
    wx.showModal({
      title: '隐私说明',
      showCancel: false,
      confirmText: '知道了',
      content: '1. 本小程序使用微信云开发存储记账数据，数据仅与你的微信账号绑定，他人无法查看。\n2. 不接入任何第三方统计、广告或数据服务。\n3. AI 月度分析（可选）：仅发送聚合数据（分类汇总、预算执行），不发送逐笔流水；API key 存储在云函数环境变量中，不出现在前端。\n4. 不收集通讯录、位置等与记账无关的信息（相册仅在你主动设置壁纸时读取所选图片）。\n5. 你可以随时通过「导出与备份」自行备份数据。'
    })
  },

  // AI 开关：仅标记入口显隐；真正可用还需云函数环境变量配好 key
  async onAiToggle(e) {
    const enabled = e.detail.value
    try {
      await getApp().saveConfig('ai', { enabled })
      getApp().globalData.aiEnabled = enabled
      this.setData({ aiEnabled: enabled })
      wx.showToast({ title: enabled ? '已开启' : '已关闭', icon: 'none' })
      if (enabled) this.showAiGuide()
    } catch (err) {
      wx.showToast({ title: '保存失败', icon: 'none' })
    }
  },

  showAiGuide() {
    wx.showModal({
      title: '配置 Moonshot API key（一次性）',
      showCancel: false,
      confirmText: '知道了',
      content: '1. 浏览器打开 platform.moonshot.cn，注册并充值少量金额（每月一次分析约几分钱）；\n2. 创建 API key 并复制；\n3. 微信开发者工具点「云开发」→「云函数」→ 点 analyze →「配置」→「环境变量」，添加：MOONSHOT_API_KEY = 你的 key；\n4. 回这里打开开关，月报页即出现「AI 点评」。\n\n未配置 key 时点评会提示配置方法，其余功能不受影响。'
    })
  }
})
