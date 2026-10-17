/**
 * 体检用的补丁检查器：解析 profile 的 cordis.patch.yml，把 insert 条目列出来。
 * 跑：node tools/check-patch.mjs "<cordis.patch.yml 的绝对路径>"
 */
import { readFileSync } from 'node:fs'
import { parse } from 'yaml'

const file = process.argv[2]
if (!file) {
  console.error('用法：node tools/check-patch.mjs <cordis.patch.yml>')
  process.exit(2)
}

const text = readFileSync(file, 'utf8')
let doc
try {
  doc = parse(text)
} catch (err) {
  console.error('YAML 解析失败：', err.message)
  process.exit(1)
}
if (!Array.isArray(doc)) {
  console.error('顶层不是数组（DSH 的 patch 必须是顶层 YAML 数组）')
  process.exit(1)
}

console.log(`顶层条目数：${doc.length}`)
console.log('id 一览：')
for (const entry of doc) {
  if (entry && entry.insert) {
    console.log(`  [insert] ${JSON.stringify(entry.insert)}`)
  } else if (entry && entry.id) {
    console.log(`  ${entry.id}`)
  } else {
    console.log(`  ${JSON.stringify(entry)}`)
  }
}
const tri = doc.find((e) => Array.isArray(e?.insert) && e.insert.some((i) => i?.id === 'tri-sages'))
console.log('')
console.log(tri ? `✅ 找到 tri-sages 条目：${JSON.stringify(tri.insert)}` : '⚠️ 没有找到 tri-sages 条目')
