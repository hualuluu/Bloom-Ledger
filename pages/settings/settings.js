Page({
  data: { version: 'v1.0.0' },

  showPrivacy() {
    wx.showModal({
      title: '隐私说明',
      showCancel: false,
      confirmText: '知道了',
      content: '1. 本小程序使用微信云开发存储记账数据，数据仅与你的微信账号绑定，他人无法查看。\n2. 不接入任何第三方统计、广告或数据服务。\n3. 不收集通讯录、相册、位置等与记账无关的信息。\n4. 你可以随时通过后续版本的导出功能备份数据，或删除云端数据。'
    })
  }
})
