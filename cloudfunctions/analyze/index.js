// AI 月度分析云函数（需求 3.5）
// API key 仅存环境变量 MOONSHOT_API_KEY，绝不出现在前端；本函数做代理转发
// 数据最小化：只接收小程序传来的聚合数据（分类汇总/预算执行/近三月关键数字），不接触逐笔流水
const cloud = require('wx-server-sdk')
const https = require('https')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const SYSTEM_PROMPT = `你是家庭记账复盘助手。用户会给你某个月的聚合记账数据（JSON）。请严格按以下框架输出 markdown（标题用 ##，要点用 - 列表，控制在 400 字内）：
## 趋势判断
## 异常项
## 对象账单对账
## 下月一条建议
要求：数字要具体（带金额）；异常项没有就写"无异常"；对象账单对账关注对象账单各类与固定支出的重叠口径；建议只给一条最关键的。`

function postJson(urlStr, body, headers) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr)
    const req = https.request({
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, headers)
    }, res => {
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }))
    })
    req.on('error', reject)
    req.setTimeout(60000, () => { req.destroy(new Error('timeout')) })
    req.write(JSON.stringify(body))
    req.end()
  })
}

exports.main = async (event) => {
  const key = process.env.MOONSHOT_API_KEY
  if (!key) return { ok: false, code: 'NO_KEY', msg: '云函数未配置 MOONSHOT_API_KEY 环境变量' }

  const { aggregate } = event || {}
  if (!aggregate || !aggregate.month) return { ok: false, msg: '缺少 aggregate 参数' }

  // 模型默认值 kimi-k3：moonshot-v1 全系列已于 2026-08-31 下线（调用返回 404），
  // K2 系列 2026-10 起对新注册用户关闭、年底下线；kimi-k3 为当前通用旗舰，新账号可用。
  // 注意：kimi-k3 不允许自定义 temperature（传了会 400），故整个请求不带 temperature。
  // 如账号有其他可用模型，可在环境变量 MOONSHOT_MODEL 覆盖。
  const payload = {
    model: process.env.MOONSHOT_MODEL || 'kimi-k3',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `请复盘以下聚合数据（单位：元）：\n${JSON.stringify(aggregate)}` }
    ]
  }

  try {
    const r = await postJson('https://api.moonshot.cn/v1/chat/completions', payload, {
      Authorization: `Bearer ${key}`
    })
    if (r.status !== 200) {
      return { ok: false, code: 'API_' + r.status, msg: `Moonshot API 返回 ${r.status}：${r.body.slice(0, 200)}` }
    }
    const data = JSON.parse(r.body)
    const markdown = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content
    if (!markdown) return { ok: false, msg: 'API 返回为空' }
    return { ok: true, markdown }
  } catch (e) {
    return { ok: false, msg: '调用失败：' + e.message }
  }
}
