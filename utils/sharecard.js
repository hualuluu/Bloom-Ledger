// 分享月报卡片（需求 3.10）：canvas 生成四行汇总卡片，不含分类明细
// 内容：当月收入合计 / 固定支出 / 结余 / 储蓄率+预算执行率；带月份水印与"个人记账工具"标识
const util = require('./util')

const C = { green: '#2e6e5e', deep: '#24594c', ink: '#33302a', gray: '#9a958c', paper: '#f7f5f1', white: '#ffffff', red: '#c0392b' }

async function buildShareCard(month) {
  const app = getApp()
  const db = wx.cloud.database()
  const [entries, budgets] = await Promise.all([
    util.queryAll('entries', { month }),
    app.getBudgets()
  ])
  let m = null
  try {
    let res = await db.collection('months').where({ key: month }).limit(1).get()
    if (!res.data.length) res = await db.collection('months').where({ month }).limit(1).get()
    m = res.data.length ? res.data[0] : null
  } catch (e) { /* 未填报 */ }

  const sums = util.sumBy(entries, 'category')
  const flexible = Object.values(sums).reduce((s, v) => s + v, 0)
  const incomeTotal = m ? Object.values(m.income || {}).reduce((s, v) => s + util.num(v), 0) : 0
  const fixedTotal = util.fixedTotal(m ? m.fixed : null)
  const partnerTotal = m ? Object.values(m.partner || {}).reduce((s, v) => s + util.num(v), 0) : 0
  const totalSpend = fixedTotal + flexible + partnerTotal
  const balance = incomeTotal - totalSpend
  const savingRate = incomeTotal > 0 ? (balance / incomeTotal * 100).toFixed(1) : '0.0'

  // 预算执行率：各类红线内实际花费合计 / 红线合计
  let limitSum = 0, actualIn = 0
  Object.keys(budgets).forEach(cat => {
    if (cat === '嘴上合计') return
    const limit = util.num(budgets[cat])
    if (!limit) return
    limitSum += limit
    actualIn += Math.min(util.num(sums[cat]), limit)
  })
  const budgetRate = limitSum > 0 ? (actualIn / limitSum * 100).toFixed(0) : null

  // ---- 绘制 ----
  const W = 630, H = 860
  const canvas = wx.createOffscreenCanvas({ type: '2d', width: W, height: H })
  const ctx = canvas.getContext('2d')

  // 纸底 + 白色卡片
  ctx.fillStyle = C.paper
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = C.white
  roundRect(ctx, 30, 30, W - 60, H - 60, 24); ctx.fill()
  ctx.strokeStyle = '#e8e4da'; ctx.lineWidth = 2
  roundRect(ctx, 30, 30, W - 60, H - 60, 24); ctx.stroke()

  // 顶部绿带
  ctx.fillStyle = C.green
  roundRect(ctx, 30, 30, W - 60, 150, 24); ctx.fill()
  ctx.fillStyle = C.green
  ctx.fillRect(30, 120, W - 60, 60)
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 30px sans-serif'
  ctx.fillText('阿花记账', 62, 92)
  ctx.font = '20px sans-serif'
  ctx.globalAlpha = 0.85
  ctx.fillText(`${month} 月报`, 62, 128)
  ctx.globalAlpha = 1
  ctx.textAlign = 'right'
  ctx.font = '18px sans-serif'
  ctx.fillText('个人记账工具', W - 62, 92)
  ctx.textAlign = 'left'

  // 四行汇总
  const rows = [
    ['当月收入合计', `¥${util.money(incomeTotal)}`],
    ['固定支出', `¥${util.money(fixedTotal)}`],
    ['月结余', `¥${util.money(balance)}`, balance < 0],
    ['储蓄率', `${savingRate}%`],
  ]
  if (budgetRate !== null) rows.push(['预算执行率', `${budgetRate}%`])

  let y = 250
  rows.forEach(([label, value, neg]) => {
    ctx.fillStyle = C.gray
    ctx.font = '22px sans-serif'
    ctx.fillText(label, 70, y)
    ctx.fillStyle = neg ? C.red : C.deep
    ctx.font = 'bold 34px Menlo, monospace'
    ctx.textAlign = 'right'
    ctx.fillText(value, W - 70, y + 6)
    ctx.textAlign = 'left'
    y += 92
    if (y < 250 + 92 * rows.length) {
      ctx.strokeStyle = '#f0ede6'; ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(70, y - 46); ctx.lineTo(W - 70, y - 46); ctx.stroke()
    }
  })

  // 月份水印 + 标识
  ctx.fillStyle = C.gray
  ctx.globalAlpha = 0.35
  ctx.font = '16px sans-serif'
  ctx.fillText(`${month} · 由阿花记账生成`, 70, H - 62)
  ctx.globalAlpha = 1

  // 导出
  const res = await wx.canvasToTempFilePath({ canvas, destWidth: W * 2, destHeight: H * 2 })
  return res.tempFilePath
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

// 生成后动作：保存相册 / 发送朋友
function showShareActions(tempPath) {
  wx.showActionSheet({
    itemList: ['保存到相册', '发送给朋友'],
    success: (res) => {
      if (res.tapIndex === 0) {
        wx.saveImageToPhotosAlbum({
          filePath: tempPath,
          success: () => wx.showToast({ title: '已保存' }),
          fail: (err) => {
            if (err.errMsg && err.errMsg.includes('auth')) {
              wx.showModal({ title: '需要相册权限', content: '请在设置中允许保存图片到相册', confirmText: '去设置', success: r => { if (r.confirm) wx.openSetting() } })
            } else {
              wx.showToast({ title: '已取消', icon: 'none' })
            }
          }
        })
      } else if (res.tapIndex === 1) {
        wx.showShareImageMenu({ path: tempPath })
      }
    }
  })
}

module.exports = { buildShareCard, showShareActions }
