// Excel 导入解析云函数（需求 3.8）
// 流程：小程序上传 xlsx 到云存储 → 本函数下载并用 SheetJS 解析 → 返回结构化数据
const cloud = require('wx-server-sdk')
const XLSX = require('xlsx')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const PARTNER_KEYS = ['toll', 'food', 'shopping', 'misc', 'insurance', 'smoke', 'electric', 'fuel', 'charge', 'phone']
const PARTNER_LABELS = ['过路费', '吃饭', '京东淘宝', '杂七杂八', '保险', '买烟', '电费', '加油', '充电', '话费']
const INCOME_MAP = { '工资①(对象)': 'salary1', '工资①（对象）': 'salary1', '工资②(我)': 'salary2', '工资②（我）': 'salary2', '公积金': 'fund', '其他收入': 'other' }
const FIXED_MAP = { '房贷': 'house', '车贷': 'car', '生活费': 'living', '加油': 'fuel', '过路费': 'toll', '电费': 'electric', '话费': 'phone' }

function fmtDate(v) {
  if (typeof v === 'number' && isFinite(v)) { // Excel 日期序列号（无时区歧义，主路径）
    const d = XLSX.SSF.parse_date_code(v)
    if (d) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
  }
  if (v instanceof Date && !isNaN(v)) {
    const p = n => (n < 10 ? '0' + n : '' + n)
    return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`
  }
  if (typeof v === 'string') {
    const m = v.trim().match(/^(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})/)
    if (m) return `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`
  }
  return ''
}

function monthOf(dateStr) { return dateStr ? dateStr.slice(0, 7) : '' }

// 解析「我的日常流水」
function parseEntries(rows) {
  const entries = []
  let headIdx = rows.findIndex(r => r && r[0] === '日期' && r[1] === '类别')
  if (headIdx < 0) return entries
  for (let i = headIdx + 1; i < rows.length; i++) {
    const r = rows[i] || []
    const date = fmtDate(r[0])
    const category = (r[1] || '').toString().trim()
    const amount = Number(r[2])
    if (!date || !category || !isFinite(amount) || amount <= 0) continue   // 跳过空行/合计行
    entries.push({ date, month: monthOf(date), category, amount: +amount.toFixed(2), note: (r[3] || '').toString().trim() })
  }
  return entries
}

// 解析「对象月度汇总」→ 每月 partner 10 类合计
function parsePartner(rows) {
  const out = {}
  let cur = null
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i] || []
    const c0 = (r[0] || '').toString()
    const m = c0.match(/(\d{4}-\d{2})/)
    if (c0.startsWith('■') && m) {
      cur = m[1]
      out[cur] = { toll: 0, food: 0, shopping: 0, misc: 0, insurance: 0, smoke: 0, electric: 0, fuel: 0, charge: 0, phone: 0 }
      continue
    }
    if (!cur) continue
    // 小计行：跳过并结束本月
    if ((r[10] || '').toString().includes('小计') || (r[11] || '').toString().includes('小计')) { cur = null; continue }
    if (c0.startsWith('■')) continue
    PARTNER_KEYS.forEach((k, idx) => {
      const v = Number(r[idx])
      if (isFinite(v)) out[cur][k] = +(out[cur][k] + v).toFixed(2)
    })
  }
  return out
}

// 解析「月度总览」→ 每月 income / fixed
function parseOverview(rows) {
  const out = {}
  const headIdx = rows.findIndex(r => r && r[0] === '项目')
  if (headIdx < 0) return out
  const months = []
  ;(rows[headIdx] || []).forEach((c, idx) => {
    if (idx < 2 || c == null) return
    const m = c.toString().match(/(\d{4}-\d{2})/)
    if (m) { months.push({ idx, month: m[1] }); out[m[1]] = out[m[1]] || { income: {}, fixed: {} } }
  })
  for (let i = headIdx + 1; i < rows.length; i++) {
    const r = rows[i] || []
    const label = (r[0] || '').toString().trim()
    const ik = INCOME_MAP[label], fk = FIXED_MAP[label]
    if (!ik && !fk) continue
    months.forEach(({ idx, month }) => {
      const raw = r[idx]
      if (raw == null || raw === '') return   // 空单元格不写入
      const v = Number(raw)
      if (!isFinite(v)) return
      if (ik) out[month].income[ik] = v
      else out[month].fixed[fk] = v
    })
  }
  return out
}

// 解析「存款余额」→ 第一条已填快照
function parseSavings(rows) {
  const headIdx = rows.findIndex(r => r && (r[0] || '').toString().includes('日期'))
  if (headIdx < 0) return null
  for (let i = headIdx + 1; i < rows.length; i++) {
    const r = rows[i] || []
    const date = fmtDate(r[0])
    if (!date) continue
    return {
      month: monthOf(date),
      savings: {
        date,
        current: Number(r[1]) || 0,
        deposit: Number(r[2]) || 0,
        huabeiDue: Number(r[5]) || 0,
        huabeiSpend: Number(r[6]) || 0
      }
    }
  }
  return null
}

exports.main = async (event) => {
  const { fileID } = event
  if (!fileID) return { ok: false, msg: '缺少 fileID' }

  const res = await cloud.downloadFile({ fileID })
  // 不开启 cellDates：日期按序列号读取，避免时区导致日期偏移一天
  const wb = XLSX.read(res.fileContent, { type: 'buffer' })

  const sheetRows = name => {
    const ws = wb.Sheets[name]
    return ws ? XLSX.utils.sheet_to_json(ws, { header: 1, defval: null }) : []
  }

  const entries = parseEntries(sheetRows('我的日常流水'))
  const partnerMap = parsePartner(sheetRows('对象月度汇总'))
  const overviewMap = parseOverview(sheetRows('月度总览'))
  const savings = parseSavings(sheetRows('存款余额'))

  // 合并成 months 填报数据
  const monthsMap = {}
  Object.keys(overviewMap).forEach(m => { monthsMap[m] = { key: m, income: overviewMap[m].income, fixed: overviewMap[m].fixed, partner: {}, savings: null } })
  Object.keys(partnerMap).forEach(m => {
    monthsMap[m] = monthsMap[m] || { key: m, income: {}, fixed: {}, partner: {}, savings: null }
    monthsMap[m].partner = partnerMap[m]
  })
  if (savings) {
    monthsMap[savings.month] = monthsMap[savings.month] || { key: savings.month, income: {}, fixed: {}, partner: {}, savings: null }
    monthsMap[savings.month].savings = savings.savings
  }

  // 只保留有实际数据的月份（空表头/练手列不生成填报）
  const months = Object.keys(monthsMap).sort().map(m => monthsMap[m]).filter(md => {
    const hasIncome = Object.keys(md.income).length > 0
    const hasFixed = Object.keys(md.fixed).length > 0
    const hasPartner = Object.values(md.partner).some(v => v > 0)
    return hasIncome || hasFixed || hasPartner || md.savings
  }).filter(md => md.key <= new Date().toISOString().slice(0, 7))   // 不导入未来月份的预填计划
  return { ok: true, entries, months }
}
