// 云函数：获取用户 openid（备用，权限以数据库"仅创建者可读写"为主）
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async () => {
  const wxContext = cloud.getWXContext()
  return { openid: wxContext.OPENID }
}
