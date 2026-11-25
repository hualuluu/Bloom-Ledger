// 统计图表页（需求 3.4）：canvas 手绘，无第三方图表库，离线可用
const util = require('../../utils/util')
const app = getApp()

const C = { green: '#2e6e5e', red: '#c0392b', amber: '#b9770e', gray: '#9a958c', light: '#e8e4da', ink: '#33302a' }
const MOUTH_CATS = ['餐饮', '零食水果', '奶茶咖啡']

function lastNMonths(n, from) {
  const out = [from]
  let m = from
  while (out.length < n) { m = util.prevMonth(m); out.unshift(m) }
  return out
}

Page({
  data: {
    month: util.monthOf(),
    ready: false,
    winW: 375,
    h1: 200, h2: 220, h3: 240, h4: 200
  },

  onLoad(options) {
    if (options && options.month) this.setData({ month: options.month })
    const winW = (wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()).windowWidth
    this.setData({ winW })
    this._ready = false
    this._pending = null
  },

  onReady() {
    this._ready = true
    if (this._pending) this.renderAll(this._pending)
  },

  onShow() { this.load() },
  onPullDownRefresh() { this.load().finally(() => wx.stopPullDownRefresh()) },

  onMonthChange(e) {
    this.setData({ month: e.detail.value.slice(0, 7) })
    this.load()
  },

  async load() {
    const month = this.data.month
    const db = wx.cloud.database()
    const prev = util.prevMonth(month)
    const six = lastNMonths(6, month)

    const [curEntries, prevEntries, monthsAll, budgets] = await Promise.all([
      util.queryAll('entries', { month }),
      util.queryAll('entries', { month: prev }),
      util.queryAll('months', {}),
      app.getBudgets()
    ])
    const monthsMap = {}
    monthsAll.forEach(d => { monthsMap[d.key || d.month] = d })

    // ---- 图1 数据：当月分类占比 + 环比 ----
    const curSums = util.sumBy(curEntries, 'category')
    const prevSums = util.sumBy(prevEntries, 'category')
    const curTotal = Object.values(curSums).reduce((s, v) => s + v, 0)
    let cats = Object.keys(curSums).map(name => ({
      name, val: curSums[name],
      pct: curTotal > 0 ? curSums[name] / curTotal * 100 : 0,
      delta: util.num(curSums[name]) - util.num(prevSums[name])
    })).sort((a, b) => b.val - a.val)
    let top = cats.slice(0, 8)
    if (cats.length > 8) {
      const rest = cats.slice(8).reduce((s, c) => ({ val: s.val + c.val }), { val: 0 })
      top.push({ name: '其他类别', val: rest.val, pct: curTotal > 0 ? rest.val / curTotal * 100 : 0, delta: 0 })
    }

    // ---- 图2/图4 数据：一次查全量流水再按月分组 ----
    const allEntries = await util.queryAll('entries', {})
    const byMonth = {}
    allEntries.forEach(e => {
      if (!byMonth[e.month]) byMonth[e.month] = []
      byMonth[e.month].push(e)
    })
    const trendData = six.map(m => {
      const list = byMonth[m] || []
      const flexible = list.reduce((s, e) => s + util.num(e.amount), 0)
      const md = monthsMap[m]
      let balance = null, rate = null
      if (md) {
        const inc = Object.values(md.income || {}).reduce((s, v) => s + util.num(v), 0)
        const fix = util.fixedTotal(md.fixed)   // v3.5 口径：剔除加油/电费/话费旧字段
        const par = Object.values(md.partner || {}).reduce((s, v) => s + util.num(v), 0)
        balance = inc - fix - flexible - par
        rate = inc > 0 ? +(balance / inc * 100).toFixed(1) : null
      }
      return { m, flexible, balance, rate }
    })

    // ---- 图3 数据：预算执行 ----
    const budgetRows = []
    Object.keys(budgets).forEach(cat => {
      if (cat === '嘴上合计') return
      const limit = util.num(budgets[cat])
      if (!limit) return
      budgetRows.push({ cat, limit, actual: util.num(curSums[cat]) })
    })
    budgetRows.sort((a, b) => b.actual - a.actual)

    // ---- 图4 数据：嘴上合计月度 ----
    const mouth = six.map(m => {
      const list = byMonth[m] || []
      const v = MOUTH_CATS.reduce((s, c) => s + list.filter(e => e.category === c).reduce((x, e) => x + util.num(e.amount), 0), 0)
      return { m, val: +v.toFixed(2) }
    })
    const mouthLimit = util.num(budgets['嘴上合计'])

    // 画布高度（px）随数据量自适应
    const barH = 34
    this.setData({
      ready: true,
      h1: Math.max(120, top.length * barH + 40),
      h2: 240,
      h3: Math.max(120, budgetRows.length * barH * 1.6 + 40),
      h4: 220
    })

    this._pending = { top, curTotal, trendData, budgetRows, mouth, mouthLimit }
    if (this._ready) this.renderAll(this._pending)
  },

  // 取 canvas 节点并绘制
  renderAll(d) {
    const q = wx.createSelectorQuery().in(this)
    ;['#c1', '#c2', '#c3', '#c4'].forEach(sel => q.select(sel).fields({ node: true, size: true }))
    q.exec(res => {
      if (!res || !res[0]) return
      const dpr = (wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()).pixelRatio
      const ctxOf = i => {
        const node = res[i].node
        node.width = res[i].width * dpr
        node.height = res[i].height * dpr
        const ctx = node.getContext('2d')
        ctx.scale(dpr, dpr)
        return { ctx, w: res[i].width, h: res[i].height }
      }
      this.drawShare(ctxOf(0), d.top, d.curTotal)
      this.drawTrend(ctxOf(1), d.trendData)
      this.drawBudget(ctxOf(2), d.budgetRows)
      this.drawMouth(ctxOf(3), d.mouth, d.mouthLimit)
    })
  },

  // 图1：当月分类占比（横向条形 + 占比 + 环比箭头）
  drawShare({ ctx, w, h }, top, total) {
    ctx.clearRect(0, 0, w, h)
    if (!top.length) { this.emptyText(ctx, w, h, '本月暂无流水'); return }
    const labelW = 76, valW = 92, barMax = w - labelW - valW - 20
    const max = Math.max(...top.map(t => t.val), 1)
    ctx.font = '12px sans-serif'
    top.forEach((t, i) => {
      const y = 14 + i * 34
      // 标签
      ctx.fillStyle = C.ink
      ctx.textAlign = 'left'
      ctx.fillText(t.name.slice(0, 5), 4, y + 13)
      // 条
      ctx.fillStyle = C.light
      this.rr(ctx, labelW, y, barMax, 18, 9); ctx.fill()
      const bw = Math.max(6, t.val / max * barMax)
      ctx.fillStyle = C.green
      this.rr(ctx, labelW, y, bw, 18, 9); ctx.fill()
      // 数值 + 占比 + 环比箭头
      ctx.textAlign = 'right'
      ctx.fillStyle = C.ink
      const arrow = t.delta > 0 ? ' ↑' : t.delta < 0 ? ' ↓' : ''
      ctx.fillText(`¥${util.money(t.val)} ${t.pct.toFixed(0)}%`, w - 2, y + 8)
      ctx.fillStyle = t.delta > 0 ? C.red : C.green
      if (arrow) ctx.fillText(arrow.replace(' ', '') + Math.abs(util.money(t.delta)), w - 2, y + 22)
    })
  },

  // 图2：近 6 月趋势（灵活支出/月结余 左轴 ¥，储蓄率 右轴 %）
  drawTrend({ ctx, w, h }, data) {
    ctx.clearRect(0, 0, w, h)
    const padL = 46, padR = 40, padT = 30, padB = 26
    const iw = w - padL - padR, ih = h - padT - padB
    const flex = data.map(d => d.flexible)
    const bals = data.map(d => d.balance)
    const rates = data.map(d => d.rate)
    const minV = Math.min(0, ...bals, ...flex), maxV = Math.max(100, ...bals, ...flex)
    const minR = Math.min(0, ...rates), maxR = Math.max(20, ...rates)
    const X = i => padL + iw * (i + 0.5) / data.length
    const Yv = v => padT + ih * (1 - (v - minV) / (maxV - minV || 1))
    const Yr = v => padT + ih * (1 - (v - minR) / (maxR - minR || 1))

    ctx.font = '10px sans-serif'
    // 网格 + 左轴
    ctx.strokeStyle = '#efece5'; ctx.fillStyle = C.gray; ctx.textAlign = 'right'
    for (let i = 0; i <= 4; i++) {
      const v = minV + (maxV - minV) * i / 4
      const y = Yv(v)
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + iw, y); ctx.stroke()
      ctx.fillText(this.kfmt(v), padL - 6, y + 3)
    }
    // 右轴
    ctx.textAlign = 'left'
    for (let i = 0; i <= 4; i++) {
      const v = minR + (maxR - minR) * i / 4
      ctx.fillText(v.toFixed(0) + '%', padL + iw + 6, Yr(v) + 3)
    }
    // x 轴月份
    ctx.textAlign = 'center'; ctx.fillStyle = C.gray
    data.forEach((d, i) => ctx.fillText(d.m.slice(5) + '月', X(i), h - 8))
    // 零线
    if (minV < 0) {
      ctx.strokeStyle = '#d8d3c8'
      ctx.beginPath(); ctx.moveTo(padL, Yv(0)); ctx.lineTo(padL + iw, Yv(0)); ctx.stroke()
    }
    // 三线
    const line = (vals, yFn, color, dash) => {
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.setLineDash(dash || [])
      ctx.beginPath()
      vals.forEach((v, i) => {
        if (v == null) return
        const x = X(i), y = yFn(v)
        i === 0 || vals[i - 1] == null ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
      })
      ctx.stroke(); ctx.setLineDash([])
      ctx.fillStyle = color
      vals.forEach((v, i) => { if (v != null) { ctx.beginPath(); ctx.arc(X(i), yFn(v), 2.5, 0, 7); ctx.fill() } })
    }
    line(flex, Yv, C.green)
    line(bals, Yv, C.amber)
    line(rates, Yr, C.red, [4, 3])
    // 图例
    ctx.font = '11px sans-serif'; ctx.textAlign = 'left'
    const leg = [['灵活支出(¥)', C.green], ['月结余(¥)', C.amber], ['储蓄率(%)', C.red]]
    leg.forEach(([t, c], i) => {
      ctx.fillStyle = c; ctx.fillRect(padL + i * 92, 8, 10, 10)
      ctx.fillStyle = C.ink; ctx.fillText(t, padL + i * 92 + 14, 17)
    })
  },

  // 图3：预算执行（实际 vs 上限）
  drawBudget({ ctx, w, h }, rows) {
    ctx.clearRect(0, 0, w, h)
    if (!rows.length) { this.emptyText(ctx, w, h, '暂无预算红线'); return }
    const labelW = 76, valW = 96, barMax = w - labelW - valW - 20
    const max = Math.max(...rows.map(r => Math.max(r.limit, r.actual)), 1)
    ctx.font = '12px sans-serif'
    rows.forEach((r, i) => {
      const y = 12 + i * 54
      ctx.fillStyle = C.ink; ctx.textAlign = 'left'
      ctx.fillText(r.cat.slice(0, 5), 4, y + 20)
      // 上限（浅灰整条）
      ctx.fillStyle = C.light
      this.rr(ctx, labelW, y, barMax, 14, 7); ctx.fill()
      // 实际
      const over = r.actual > r.limit
      ctx.fillStyle = over ? C.red : C.green
      this.rr(ctx, labelW, y, Math.max(4, r.actual / max * barMax), 14, 7); ctx.fill()
      // 上限刻度线
      ctx.strokeStyle = C.gray; ctx.lineWidth = 1
      const lx = labelW + r.limit / max * barMax
      ctx.beginPath(); ctx.moveTo(lx, y - 2); ctx.lineTo(lx, y + 18); ctx.stroke()
      ctx.fillStyle = over ? C.red : C.ink; ctx.textAlign = 'right'
      ctx.fillText(`${util.money(r.actual)}/${r.limit}`, w - 2, y + 12)
    })
  },

  // 图4：嘴上合计（餐饮+零食+奶茶）近 6 月
  drawMouth({ ctx, w, h }, mouth, limit) {
    ctx.clearRect(0, 0, w, h)
    const padL = 40, padT = 24, padB = 26
    const iw = w - padL - 16, ih = h - padT - padB
    const max = Math.max(...mouth.map(m => m.val), limit, 1) * 1.15
    const bw = iw / mouth.length * 0.5
    ctx.font = '10px sans-serif'
    // 网格
    ctx.strokeStyle = '#efece5'; ctx.fillStyle = C.gray; ctx.textAlign = 'right'
    for (let i = 0; i <= 3; i++) {
      const v = max * i / 3, y = padT + ih * (1 - i / 3)
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + iw, y); ctx.stroke()
      ctx.fillText(this.kfmt(v), padL - 5, y + 3)
    }
    mouth.forEach((m, i) => {
      const x = padL + iw * (i + 0.5) / mouth.length - bw / 2
      const bh = m.val / max * ih
      ctx.fillStyle = C.amber
      this.rr(ctx, x, padT + ih - bh, bw, Math.max(2, bh), 4); ctx.fill()
      ctx.fillStyle = C.ink; ctx.textAlign = 'center'
      ctx.fillText(m.val > 0 ? this.kfmt(m.val) : '', x + bw / 2, padT + ih - bh - 5)
      ctx.fillStyle = C.gray
      ctx.fillText(m.m.slice(5) + '月', x + bw / 2, h - 8)
    })
    // 红线上限
    if (limit > 0) {
      const y = padT + ih * (1 - limit / max)
      ctx.strokeStyle = C.red; ctx.setLineDash([5, 4]); ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + iw, y); ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = C.red; ctx.textAlign = 'left'
      ctx.fillText(`红线 ${this.kfmt(limit)}`, padL + 4, y - 5)
    }
  },

  // 小工具
  rr(ctx, x, y, w, h, r) {
    r = Math.min(r, h / 2, w / 2)
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    ctx.arcTo(x + w, y, x + w, y + h, r)
    ctx.arcTo(x + w, y + h, x, y + h, r)
    ctx.arcTo(x, y + h, x, y, r)
    ctx.arcTo(x, y, x + w, y, r)
    ctx.closePath()
  },
  kfmt(v) {
    v = util.num(v)
    return Math.abs(v) >= 10000 ? (v / 1000).toFixed(1) + 'k' : String(Math.round(v))
  },
  emptyText(ctx, w, h, t) {
    ctx.font = '13px sans-serif'
    ctx.fillStyle = C.gray
    ctx.textAlign = 'center'
    ctx.fillText(t, w / 2, h / 2)
  }
})
