/**
 * 三贤人 · 计票单测
 * 跑：node test/tally.test.mjs
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { tally, RESULTS } from '../lib/tally.mjs'

const vote = (stance, extra = {}) => ({
  ok: true,
  verdict: {
    stance,
    confidence: 0.7,
    reason: `${stance} 的理由`,
    basis: ['一条依据'],
    cost: ['一条代价'],
    falsifier: stance === 'approve' ? '若观测到 X，则我的判断被推翻' : '',
    caveats: '',
    ...extra,
  },
})

const trio = (a, b, c) => [
  { unit: 'maiden', ...a },
  { unit: 'matron', ...b },
  { unit: 'crone', ...c },
]

test('normal 2:1 通过（多数决）', () => {
  const r = tally({ seats: trio(vote('approve'), vote('approve'), vote('reject')), criticality: 'normal' })
  assert.equal(r.result, RESULTS.APPROVED)
  assert.equal(r.rule, 'majority')
  assert.deepEqual(r.dissents, ['crone'])
})

test('normal 1:2 否决', () => {
  const r = tally({ seats: trio(vote('approve'), vote('reject'), vote('reject')), criticality: 'normal' })
  assert.equal(r.result, RESULTS.REJECTED)
  assert.deepEqual(r.dissents, ['maiden'])
})

test('critical 3:0 一致通过', () => {
  const r = tally({ seats: trio(vote('approve'), vote('approve'), vote('approve')), criticality: 'critical' })
  assert.equal(r.result, RESULTS.APPROVED)
  assert.equal(r.rule, 'unanimous')
  assert.equal(r.override, null)
})

test('critical 2:1 → VETO，并挂起等最年长的那一台签字', () => {
  const r = tally({ seats: trio(vote('approve'), vote('approve'), vote('reject')), criticality: 'critical' })
  assert.equal(r.result, RESULTS.VETO)
  assert.equal(r.rule, 'no-unanimity')
  assert.equal(r.needsOverrideSignature, true)
  assert.equal(r.override.pending, true)
})

test('critical 2:1 + 最年长签字 → 降档为多数决通过', () => {
  const r = tally({
    seats: trio(vote('approve'), vote('approve'), vote('reject')),
    criticality: 'critical',
    overrideSignature: true,
    overrideReason: '卡住比走错更贵',
  })
  assert.equal(r.result, RESULTS.APPROVED)
  assert.equal(r.rule, 'crone-override')
  assert.equal(r.override.signed, true)
  assert.equal(r.override.from, RESULTS.VETO)
  assert.equal(r.override.to, RESULTS.APPROVED)
  assert.equal(r.override.reason, '卡住比走错更贵')
})

test('critical 2:1 + 最年长拒签 → 否决维持', () => {
  const r = tally({
    seats: trio(vote('approve'), vote('approve'), vote('reject')),
    criticality: 'critical',
    overrideSignature: false,
  })
  assert.equal(r.result, RESULTS.VETO)
  assert.equal(r.override.signed, false)
  assert.equal(r.needsOverrideSignature, false)
})

test('举证责任：赞成票写不出 falsifier → 记为反对', () => {
  const r = tally({
    seats: trio(vote('approve'), vote('approve', { falsifier: '   ' }), vote('reject')),
    criticality: 'normal',
  })
  assert.equal(r.approvals, 1)
  const seat = r.seats.find((s) => s.unit === 'matron')
  assert.equal(seat.stance, 'reject')
  assert.equal(seat.downgraded.reason, 'no-falsifier')
  assert.equal(r.result, RESULTS.REJECTED)
})

test('举证责任能把 3:0 打成 2:1（于是 critical 变成 VETO）', () => {
  const r = tally({
    seats: trio(vote('approve'), vote('approve', { falsifier: '' }), vote('approve')),
    criticality: 'critical',
  })
  assert.equal(r.approvals, 2)
  assert.equal(r.result, RESULTS.VETO)
  assert.equal(r.needsOverrideSignature, true)
})

test('单台失败 → 保守记为拒否，并注明', () => {
  const r = tally({
    seats: [
      { unit: 'maiden', ...vote('approve') },
      { unit: 'matron', ok: false, error: 'timeout' },
      { unit: 'crone', ...vote('approve') },
    ],
    criticality: 'normal',
  })
  const matron = r.seats.find((s) => s.unit === 'matron')
  assert.equal(matron.failed, true)
  assert.equal(matron.stance, 'reject')
  assert.match(matron.note, /保守默认/)
  assert.equal(r.result, RESULTS.APPROVED)
  assert.deepEqual(r.dissents, ['matron'])
})

test('三台全失败 → ERROR，不伪造判决', () => {
  const r = tally({
    seats: [
      { unit: 'maiden', ok: false, error: 'a' },
      { unit: 'matron', ok: false, error: 'b' },
      { unit: 'crone', ok: false, error: 'c' },
    ],
    criticality: 'critical',
  })
  assert.equal(r.result, RESULTS.ERROR)
  assert.equal(r.rule, 'all-units-failed')
  assert.equal(r.needsOverrideSignature, false)
})

test('最年长的那一台自己失败时，无法降档', () => {
  const r = tally({
    seats: [
      { unit: 'maiden', ...vote('approve') },
      { unit: 'matron', ...vote('approve') },
      { unit: 'crone', ok: false, error: 'timeout' },
    ],
    criticality: 'critical',
  })
  assert.equal(r.result, RESULTS.VETO)
  assert.equal(r.needsOverrideSignature, false)
  assert.equal(r.override.unavailable, true)
})

test('座次与缺项：少传一台也算得出来，缺的记为反对', () => {
  const r = tally({ seats: [{ unit: 'maiden', ...vote('approve') }], criticality: 'normal' })
  assert.equal(r.total, 3)
  assert.equal(r.approvals, 1)
  assert.equal(r.result, RESULTS.REJECTED)
})

test('confidence 越界会被夹回 0..1，非数字记 null', () => {
  const r = tally({
    seats: trio(vote('approve', { confidence: 9 }), vote('approve', { confidence: 'x' }), vote('approve')),
    criticality: 'normal',
  })
  assert.equal(r.seats.find((s) => s.unit === 'maiden').verdict.confidence, 1)
  assert.equal(r.seats.find((s) => s.unit === 'matron').verdict.confidence, null)
})
