// Bloom Ledger（阿花记账）v1.5.0
// 修复：云数据库 add() 不支持自定义 _id，config 集合改用「key 字段 + 自动 _id」结构
const ENV_ID = 'ledger-d9ga4jr0t2d1c4de3'

const BASE_CATEGORIES = ['餐饮', '零食水果', '奶茶咖啡', '宝宝', '家人', '医疗', '娱乐充值', '购物日用', '交通', '居家', '社交人情', '其他']
const BASE_BUDGETS = {
  '奶茶咖啡': 300, '零食水果': 400, '餐饮': 700, '娱乐充值': 100,
  '宝宝': 800, '家人': 1000, '社交人情': 200, '购物日用': 200,
  '居家': 300, '交通': 300, '嘴上合计': 1400
}

App({
  globalData: {
    envId: ENV_ID,
    openid: '',
    categories: [],   // [{name, enabled}]
    budgets: {},      // {类别: 月上限, ..., 嘴上合计: 1400}
    aiEnabled: false // AI 点评入口开关（需配置 MOONSHOT_API_KEY 后手动开启）
  },

  onLaunch() {
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力')
      return
    }
    wx.cloud.init({ env: ENV_ID, traceUser: true })

    this.ensurePrivacy()
    this.ensureConfig()
    this.loadAiEnabled()
    this.login()
  },

  // AI 分析开关（需求 3.5：未配置时入口隐藏）
  async loadAiEnabled() {
    try {
      const doc = await this.fetchConfig('ai')
      this.globalData.aiEnabled = !!(doc && doc.enabled)
    } catch (e) { this.globalData.aiEnabled = false }
  },

  // 首次启动隐私协议弹窗
  ensurePrivacy() {
    if (wx.getStorageSync('privacy_agreed')) return
    wx.showModal({
      title: '隐私说明',
      content: '本小程序使用微信云开发存储你的记账数据，数据仅你的微信账号可见。不接入任何第三方数据服务。可随时在「我的」页查看完整隐私说明，也可通过导出功能自行备份数据。',
      confirmText: '同意并使用',
      cancelText: '暂不使用',
      success: (res) => {
        if (res.confirm) wx.setStorageSync('privacy_agreed', true)
      }
    })
  },

  // 读配置文档（按 key 字段查询，不存在则返回 null）
  async fetchConfig(key) {
    const db = wx.cloud.database()
    const res = await db.collection('config').where({ key }).limit(1).get()
    return res.data.length ? res.data[0] : null
  },

  // 写配置文档：有则更新，无则新建（add 自动生成 _id，禁止传自定义 _id）
  async saveConfig(key, patch) {
    const db = wx.cloud.database()
    const doc = await this.fetchConfig(key)
    if (doc) {
      await db.collection('config').doc(doc._id).update({ data: patch })
    } else {
      await db.collection('config').add({ data: { key, ...patch } })
    }
  },

  // 初始化默认配置（类别 12 基类 + 预算红线），只执行一次
  async ensureConfig() {
    try {
      let doc = await this.fetchConfig('categories')
      if (!doc) {
        const list = BASE_CATEGORIES.map(name => ({ name, enabled: true }))
        await this.saveConfig('categories', { list })
        doc = { list }
      }
      this.globalData.categories = doc.list
    } catch (e) {
      console.error('类别配置初始化失败', e)
      this.globalData.categories = BASE_CATEGORIES.map(name => ({ name, enabled: true }))
    }

    try {
      let doc = await this.fetchConfig('budgets')
      if (!doc) {
        await this.saveConfig('budgets', { lines: BASE_BUDGETS })
        doc = { lines: BASE_BUDGETS }
      }
      this.globalData.budgets = doc.lines
    } catch (e) {
      console.error('预算配置初始化失败', e)
      this.globalData.budgets = BASE_BUDGETS
    }
  },

  // 获取 openid（备用，权限控制以"仅创建者可读写"为准）
  login() {
    wx.cloud.callFunction({ name: 'login' })
      .then(res => { this.globalData.openid = res.result.openid })
      .catch(err => console.error('login 云函数调用失败', err))
  },

  // 读类别（带缓存兜底）
  async getCategories(force) {
    if (this.globalData.categories.length && !force) return this.globalData.categories
    const doc = await this.fetchConfig('categories')
    this.globalData.categories = doc ? doc.list : []
    return this.globalData.categories
  },

  async getBudgets(force) {
    if (Object.keys(this.globalData.budgets).length && !force) return this.globalData.budgets
    const doc = await this.fetchConfig('budgets')
    this.globalData.budgets = doc ? doc.lines : {}
    return this.globalData.budgets
  }
})
