// AI 月度分析页（需求 3.5）
const util = require('../../utils/util')
const ai = require('../../utils/ai')

Page({
  data: {
    month: util.monthOf(),
    state: 'idle',     // idle | loading | done | error
    html: '',
    errMsg: ''
  },

  onLoad(options) {
    if (options && options.month) this.setData({ month: options.month })
    this.run()
  },

  async run() {
    if (this.data.state === 'loading') return
    this.setData({ state: 'loading', errMsg: '' })
    try {
      const aggregate = await ai.buildAggregate(this.data.month)
      // kimi-k3 为思考型模型，响应可能超过默认 20s 超时，客户端超时放宽到 60s
      const fn = await wx.cloud.callFunction({ name: 'analyze', data: { aggregate }, config: { timeout: 60 } })
      const res = fn.result || {}
      if (!res.ok) {
        this.setData({ state: 'error', errMsg: res.code === 'NO_KEY'
          ? '云函数还没配 API key：云开发控制台 → 云函数 analyze → 配置 → 环境变量，添加 MOONSHOT_API_KEY（platform.moonshot.cn 获取），配好再试。'
          : this.humanize(res.msg || '分析失败，请重试') })
        return
      }
      this.setData({ state: 'done', html: ai.mdToHtml(res.markdown) })
      wx.pageScrollTo({ scrollTop: 0 })
    } catch (e) {
      console.error('AI 分析失败', e)
      // 透出真实错误，便于定位（函数不存在 / 超时 / 云函数内抛错各不相同）
      const detail = (e && (e.errMsg || e.message)) || '未知错误'
      this.setData({ state: 'error', errMsg: this.humanize(detail, true) })
    }
  },

  // v1.8.1：把常见报错翻译成人话；无法识别的保留原文（附排查路径）
  humanize(msg, isCallFail) {
    const s = String(msg || '')
    const map = [
      ['insufficient balance', 'Moonshot 账号余额不足，已被暂停使用。请打开 platform.moonshot.cn 充值，回来点重试即可。'],
      ['suspended', 'Moonshot 账号已被暂停（多为欠费）。请打开 platform.moonshot.cn 检查余额/套餐，恢复后点重试。'],
      ['401', 'API key 无效或未授权。请检查云函数 analyze 的环境变量 MOONSHOT_API_KEY 是否复制完整。'],
      ['404', '模型不存在（可能已下线/改名）。可在云函数环境变量用 MOONSHOT_MODEL 换一个可用模型。'],
      ['429', '请求太频繁，稍等几秒再点重试。'],
      ['timed out', '响应超时。kimi-k3 是思考型模型，可能需要 1 分钟；若反复超时，到云开发控制台 → 云函数 analyze → 配置 → 执行超时时间改为 60 秒。']
    ]
    const lower = s.toLowerCase()
    for (let i = 0; i < map.length; i++) {
      if (lower.indexOf(map[i][0]) >= 0) return map[i][1]
    }
    return isCallFail
      ? '云函数调用失败：' + s + '。可点开 vConsole 看详情，或到云开发控制台 → 云函数 analyze → 日志查看。'
      : s
  }
})
