// 壁纸（需求 3.9）：内置浅色预设（CSS 渐变）+ 相册上传（CSS 背景 + 遮罩叠加），无需 canvas
// v1.6.3 起弃用离屏画布方案：iOS 微信的 OffscreenCanvas 未实现 createImage()，
// 相册图无法解码进画布（安卓正常、iOS 必现 TypeError）。遮罩改为 CSS 双层背景：
// 上层 linear-gradient(遮罩色) 叠在图片/渐变层之上，视觉效果与烘焙等价。
const MASK = 'rgba(247,245,251,0.80)'

const PRESETS = [
  { name: '薄荷清晨', c1: '#e8f3ec', c2: '#cfe6d4', accent: '#2e6e5e' },
  { name: '暖米阳光', c1: '#fbf2e2', c2: '#f2e0c0', accent: '#b9770e' },
  { name: '雾蓝静物', c1: '#edf2f7', c2: '#d5e3ec', accent: '#4a7a94' },
  { name: '樱粉白茶', c1: '#fdf0ed', c2: '#f5d9d2', accent: '#bf7466' }
]

// iPhone 相册原图多为 HEIC/实况格式且体积大；先经微信原生压缩转成 JPEG 临时文件，失败退回原图
async function toJpeg(localPath) {
  try {
    const res = await wx.compressImage({ src: localPath, quality: 80 })
    return res.tempFilePath
  } catch (e) {
    return localPath
  }
}

// 构建 .page-bg 的 style 字符串：遮罩层在上，壁纸层在下
function buildStyle(url, presetIdx) {
  const mask = `linear-gradient(${MASK},${MASK})`
  if (presetIdx != null && presetIdx >= 0 && PRESETS[presetIdx]) {
    const p = PRESETS[presetIdx]
    return `background-image:${mask},linear-gradient(135deg,${p.c1},${p.c2})`
  }
  if (url) return `background-image:${mask},url(${url})`
  return ''
}

// 供各页面 onShow 调用
function applyWallpaper(page) {
  const app = getApp()
  page.setData({ wallpaperStyle: buildStyle(app.globalData.wallpaperUrl, app.globalData.wallpaperPreset) })
}

// mode: 'preset-N'（纯 CSS 渐变，不上传）或 'custom'（tempPath 为压缩后的本地图，需上传云存储）
async function saveAndApply(mode, tempPath) {
  const app = getApp()
  if (tempPath) {
    const up = await wx.cloud.uploadFile({
      cloudPath: `wallpapers/${mode}-${Date.now()}.jpg`,
      filePath: tempPath
    })
    await app.saveConfig('wallpaper', { mode, fileID: up.fileID })
    app.globalData.wallpaperUrl = tempPath
    app.globalData.wallpaperPreset = -1
  } else {
    await app.saveConfig('wallpaper', { mode, fileID: '' })
    app.globalData.wallpaperUrl = ''
    app.globalData.wallpaperPreset = Number(String(mode).replace('preset-', ''))
  }
}

// 启动时恢复壁纸：预设直接记 CSS 下标；自定义图下载到本地临时路径
async function loadWallpaper() {
  const app = getApp()
  app.globalData.wallpaperUrl = ''
  app.globalData.wallpaperPreset = -1
  try {
    const doc = await app.fetchConfig('wallpaper')
    if (!doc || !doc.mode || doc.mode === 'none') return
    if (String(doc.mode).indexOf('preset-') === 0) {
      app.globalData.wallpaperPreset = Number(doc.mode.slice(7))
    } else if (doc.fileID) {
      const dl = await wx.cloud.downloadFile({ fileID: doc.fileID })
      app.globalData.wallpaperUrl = dl.tempFilePath
    }
  } catch (e) {
    // 读取失败保持默认底色，不影响使用
  }
}

async function clearWallpaper() {
  const app = getApp()
  await app.saveConfig('wallpaper', { mode: 'none', fileID: '' })
  app.globalData.wallpaperUrl = ''
  app.globalData.wallpaperPreset = -1
}

module.exports = { PRESETS, MASK, toJpeg, buildStyle, saveAndApply, applyWallpaper, loadWallpaper, clearWallpaper }
