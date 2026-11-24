// 通用工具
function pad(n) { return n < 10 ? '0' + n : '' + n }

function fmtDate(d) {
  d = d || new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function today() { return fmtDate(new Date()) }

// 'YYYY-MM-DD' -> 'YYYY-MM'
function monthOf(dateStr) { return (dateStr || today()).slice(0, 7) }

// 'YYYY-MM' -> 上一个月 'YYYY-MM'
function prevMonth(m) {
  const [y, mm] = m.split('-').map(Number)
  const d = new Date(y, mm - 2, 1)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}

// 20 号填报用的默认快照日期：所选月 + 20 号
function snapshotDate(month) { return `${month}-20` }

function num(v) { const n = parseFloat(v); return isNaN(n) ? 0 : n }
function money(n) { return num(n).toFixed(2) }

// 云数据库分页全量查询（limit 上限 20）
async function queryAll(collName, where) {
  const db = wx.cloud.database()
  const MAX = 20
  let all = [], skip = 0
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const res = await db.collection(collName).where(where || {}).skip(skip).limit(MAX).get()
    all = all.concat(res.data)
    if (res.data.length < MAX) break
    skip += MAX
  }
  return all
}

// 按类别汇总金额
function sumBy(list, key) {
  const map = {}
  list.forEach(item => {
    const k = item[key]
    map[k] = (map[k] || 0) + num(item.amount)
  })
  return map
}

module.exports = { fmtDate, today, monthOf, prevMonth, snapshotDate, num, money, queryAll, sumBy }
