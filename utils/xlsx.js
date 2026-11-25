// 极简 xlsx 写入器（零依赖，store 模式无压缩）
// 用法：const buf = buildXlsx([{ name: 'Sheet1', rows: [['文本', 123], ...] }])
// 返回 Uint8Array（有效 .xlsx，Excel/WPS/AI 工具均可打开）

// ---------- CRC32 ----------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(bytes) {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

// ---------- 字节工具 ----------
const te = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null

function strBytes(s) {
  if (te) return te.encode(s)
  // 兜底（极老基础库）：自行 UTF-8 编码
  const out = []
  for (let i = 0; i < s.length; i++) {
    let c = s.charCodeAt(i)
    if (c < 0x80) out.push(c)
    else if (c < 0x800) { out.push(0xc0 | c >> 6, 0x80 | c & 0x3f) }
    else if (c < 0xd800 || c >= 0xe000) { out.push(0xe0 | c >> 12, 0x80 | c >> 6 & 0x3f, 0x80 | c & 0x3f) }
    else { // 代理对
      i++
      c = 0x10000 + ((c & 0x3ff) << 10 | s.charCodeAt(i) & 0x3ff)
      out.push(0xf0 | c >> 18, 0x80 | c >> 12 & 0x3f, 0x80 | c >> 6 & 0x3f, 0x80 | c & 0x3f)
    }
  }
  return Uint8Array.from(out)
}

class ByteWriter {
  constructor() { this.chunks = [] }
  bytes(b) { this.chunks.push(b); return this }
  u16(v) { this.chunks.push(Uint8Array.of(v & 0xff, v >> 8 & 0xff)); return this }
  u32(v) { this.chunks.push(Uint8Array.of(v & 0xff, v >> 8 & 0xff, v >> 16 & 0xff, v >>> 24 & 0xff)); return this }
  str(s) { this.chunks.push(strBytes(s)); return this }
  get length() { return this.chunks.reduce((n, c) => n + c.length, 0) }
  toUint8Array() {
    const out = new Uint8Array(this.length)
    let off = 0
    this.chunks.forEach(c => { out.set(c, off); off += c.length })
    return out
  }
}

// ---------- ZIP（store 模式） ----------
function dosDateTime(d) {
  d = d || new Date()
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)
  const date = (((d.getFullYear() - 1980) & 0x7f) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
  return { time, date }
}

// files: [{ name, data: Uint8Array }]
function buildZip(files) {
  const { time, date } = dosDateTime()
  const zip = new ByteWriter()
  const central = new ByteWriter()
  const offsets = []

  files.forEach(f => {
    const nameB = strBytes(f.name)
    const crc = crc32(f.data)
    offsets.push(zip.length)

    // 本地文件头
    zip.u32(0x04034b50).u16(20).u16(0x0800).u16(0).u16(time).u16(date)
      .u32(crc).u32(f.data.length).u32(f.data.length)
      .u16(nameB.length).u16(0).bytes(nameB).bytes(f.data)

    // 中央目录项
    central.u32(0x02014b50).u16(20).u16(20).u16(0x0800).u16(0).u16(time).u16(date)
      .u32(crc).u32(f.data.length).u32(f.data.length)
      .u16(nameB.length).u16(0).u16(0).u16(0).u16(0).u32(0)
      .u32(offsets[offsets.length - 1]).bytes(nameB)
  })

  const centralOffset = zip.length
  const centralBytes = central.toUint8Array()
  zip.bytes(centralBytes)
  zip.u32(0x06054b50).u16(0).u16(0)
    .u16(files.length).u16(files.length)
    .u32(centralBytes.length).u32(centralOffset).u16(0)
  return zip.toUint8Array()
}

// ---------- XML ----------
function xmlEsc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

function colLetter(i) {
  let s = ''
  i += 1
  while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = (i - 1 - m) / 26 }
  return s
}

function sheetXml(rows) {
  const body = []
  rows.forEach((row, r) => {
    const cells = []
    ;(row || []).forEach((cell, c) => {
      if (cell === null || cell === undefined || cell === '') return
      const ref = colLetter(c) + (r + 1)
      if (typeof cell === 'number' && isFinite(cell)) {
        cells.push(`<c r="${ref}"><v>${cell}</v></c>`)
      } else {
        cells.push(`<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEsc(cell)}</t></is></c>`)
      }
    })
    body.push(`<row r="${r + 1}">${cells.join('')}</row>`)
  })
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>`
    + body.join('') + `</sheetData></worksheet>`
}

// sheets: [{ name, rows: [[cell, ...], ...] }]
function buildXlsx(sheets) {
  const contentTypes = [`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`,
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`,
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>`,
    `<Default Extension="xml" ContentType="application/xml"/>`,
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>`]
  const wbRels = [`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`,
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`]
  const wbSheets = []

  const files = [
    { name: '[Content_Types].xml', data: null },
    { name: '_rels/.rels', data: strBytes(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
      + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
      + `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>`
      + `</Relationships>`) }
  ]

  sheets.forEach((s, i) => {
    const rid = `rId${i + 1}`
    contentTypes.push(`<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)
    wbRels.push(`<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`)
    wbSheets.push(`<sheet name="${xmlEsc(s.name).slice(0, 31)}" sheetId="${i + 1}" r:id="${rid}"/>`)
    files.push({ name: `xl/worksheets/sheet${i + 1}.xml`, data: strBytes(sheetXml(s.rows)) })
  })

  contentTypes.push(`</Types>`)
  wbRels.push(`</Relationships>`)
  files[0].data = strBytes(contentTypes.join(''))
  files.push({
    name: 'xl/workbook.xml',
    data: strBytes(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
      + `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>`
      + wbSheets.join('') + `</sheets></workbook>`)
  })
  files.push({ name: 'xl/_rels/workbook.xml.rels', data: strBytes(wbRels.join('')) })

  return buildZip(files)
}

module.exports = { buildXlsx }
