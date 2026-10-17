/**
 * 三贤人 · 输出解析单测
 * 跑：node test/parse.test.mjs
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extractJson, parseVerdict, parseOverride } from '../lib/parse.mjs'

test('裸 JSON 直接过', () => {
  const r = parseVerdict('{"stance":"reject","reason":"不行"}')
  assert.equal(r.ok, true)
  assert.equal(r.value.stance, 'reject')
})

test('围栏 JSON 也能过', () => {
  const r = parseVerdict('```json\n{"stance":"approve","reason":"可以"}\n```')
  assert.equal(r.ok, true)
  assert.equal(r.value.stance, 'approve')
})

test('前后带废话照样能抠出来', () => {
  const text = '好的，这是我的判断：\n{"stance":"approve","reason":"因为 X","basis":["a","b"]}\n希望有帮助。'
  const r = parseVerdict(text)
  assert.equal(r.ok, true)
  assert.deepEqual(r.value.basis, ['a', 'b'])
})

test('嵌套对象不会被截断', () => {
  const r = extractJson('{"a":{"b":{"c":1}},"d":2}')
  assert.equal(r.ok, true)
  assert.equal(r.value.a.b.c, 1)
})

test('字符串里的花括号不会打乱配平', () => {
  const r = extractJson('{"note":"他说 {这样} 写","ok":true}')
  assert.equal(r.ok, true)
  assert.equal(r.value.note, '他说 {这样} 写')
})

test('没有 stance 就是失败（会被计票按保守默认处理）', () => {
  const r = parseVerdict('{"reason":"我觉得行"}')
  assert.equal(r.ok, false)
  assert.match(r.error, /stance/)
})

test('根本不是 JSON 也是失败，并给出原文预览', () => {
  const r = parseVerdict('我觉得这事可以做，理由有三点。')
  assert.equal(r.ok, false)
  assert.ok(r.preview.length > 0)
})

test('降档回答只认布尔值', () => {
  const yes = parseOverride('```json\n{"sign_override": true, "reason":"卡住更贵"}\n```')
  assert.equal(yes.ok, true)
  assert.equal(yes.value.sign, true)
  const no = parseOverride('{"sign_override": false}')
  assert.equal(no.value.sign, false)
})

test('降档回答写成字符串"true"算无效（宁可保守）', () => {
  const r = parseOverride('{"sign_override": "true"}')
  assert.equal(r.ok, false)
})
