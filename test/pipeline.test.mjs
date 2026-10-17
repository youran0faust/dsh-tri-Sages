/**
 * 三贤人 · 流水线单测（离线，用桩模型与假 ctx，不联网）
 * 跑：node test/pipeline.test.mjs
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runVote, normalizeSettings, resolveCriticality, toRecord } from '../lib/vote.mjs'
import { createLedger } from '../lib/ledger.mjs'
import { renderReport } from '../lib/render.mjs'
import { RESULTS } from '../lib/tally.mjs'

const settings = (over = {}) => normalizeSettings({ llmMode: 'stub', stubDelayMs: 0, ...over })

const request = (question, over = {}) => ({ question, context: '', ...over })

test('档位：显式优先，没给就按敏感词升到 critical', () => {
  const s = settings()
  assert.equal(resolveCriticality(request('随便一件小事'), s).criticality, 'normal')
  const auto = resolveCriticality(request('要不要删除生产库里的旧表'), s)
  assert.equal(auto.criticality, 'critical')
  assert.equal(auto.source, 'keywords')
  assert.ok(auto.matched.includes('删'))
  assert.equal(resolveCriticality(request('要不要删除生产库里的旧表', { criticality: 'normal' }), s).source, 'explicit')
})

test('缺省的配置会被补全（patch 是整值替换，不能指望部分配置）', () => {
  const s = normalizeSettings({ maxTokens: 10 })
  assert.equal(s.maxTokens, 10)
  assert.equal(s.timeoutMs, 120000)
  assert.equal(s.temperature, 0.7)
  assert.equal(s.historyLimit, 50)
  assert.equal(s.llmMode, 'live')
  assert.ok(s.criticalKeywords.length > 10)
})

test('桩 · split：重大案未获一致 → VETO，问最年长的那一台，她拒签', async () => {
  const s = settings({ stubPreset: 'split' })
  const r = await runVote({ ctx: {}, settings: s, request: request('要不要换掉这套架构', { criticality: 'critical' }) })
  assert.equal(r.approvals, 1)
  assert.equal(r.result, RESULTS.VETO)
  assert.equal(r.override.asked, true)
  assert.equal(r.override.signed, false)
  assert.equal(r.overrideTurn.sign, false)
  assert.deepEqual(r.dissents, ['maiden'])
})

test('桩 · downgrade：最年长的那一台签字降档 → 改按多数决通过', async () => {
  const s = settings({ stubPreset: 'downgrade' })
  const r = await runVote({ ctx: {}, settings: s, request: request('要不要现在动手', { criticality: 'critical' }) })
  assert.equal(r.result, RESULTS.APPROVED)
  assert.equal(r.rule, 'crone-override')
  assert.equal(r.override.from, RESULTS.VETO)
  assert.equal(r.override.to, RESULTS.APPROVED)
})

test('桩 · unanimous：三票一致通过，且不会触发第二问', async () => {
  const s = settings({ stubPreset: 'unanimous' })
  const r = await runVote({ ctx: {}, settings: s, request: request('要不要采纳这个方案', { criticality: 'critical' }) })
  assert.equal(r.result, RESULTS.APPROVED)
  assert.equal(r.rule, 'unanimous')
  assert.equal(r.override, null)
  assert.equal(r.overrideTurn, null)
})

test('桩 · no-falsifier：赞成但写不出可证伪条件 → 举证责任把它记为反对', async () => {
  const s = settings({ stubPreset: 'no-falsifier' })
  const r = await runVote({ ctx: {}, settings: s, request: request('要不要上这个功能', { criticality: 'critical' }) })
  const matron = r.seats.find((x) => x.unit === 'matron')
  assert.equal(matron.stance, 'reject')
  assert.equal(matron.downgraded.reason, 'no-falsifier')
  assert.equal(r.approvals, 2)
  assert.equal(r.result, RESULTS.VETO)
})

test('日常档不触发第二问（多数决就够了）', async () => {
  const s = settings({ stubPreset: 'split' })
  const r = await runVote({ ctx: {}, settings: s, request: request('午饭吃什么') })
  assert.equal(r.criticality, 'normal')
  assert.equal(r.result, RESULTS.REJECTED)
  assert.equal(r.overrideTurn, null)
})

// ── live 路径：用假 ctx 顶掉宿主 ─────────────────────────────────────────
function fakeCtx(replyFor) {
  const seen = []
  return {
    seen,
    agentDefaultModel: { currentSelection: () => ({ provider: 'test-provider', model: 'test-model' }) },
    llm: {
      stream(req) {
        seen.push(req)
        const text = replyFor(req)
        return (async function* generate() {
          // 故意切成两段，验证拼接
          const half = Math.ceil(text.length / 2)
          yield { type: 'text-delta', index: 0, text: text.slice(0, half) }
          yield { type: 'text-delta', index: 0, text: text.slice(half) }
          yield { type: 'finish', reason: { kind: 'stop' } }
        })()
      },
    },
  }
}

const verdictJson = (over) => '```json\n' + JSON.stringify({
  stance: 'approve',
  confidence: 0.7,
  reason: '理由',
  basis: ['依据'],
  cost: ['代价'],
  falsifier: '若观测到 X',
  caveats: '',
  ...over,
}, null, 2) + '\n```'

test('live：三台并行、各带各的人格、共用模型；分片能拼起来', async () => {
  const ctx = fakeCtx((req) => {
    if (req.system.includes('少女')) return verdictJson({ stance: 'approve', reason: '少女的理由' })
    if (req.system.includes('成女')) return verdictJson({ stance: 'approve', reason: '成女的理由' })
    return verdictJson({ stance: 'reject', reason: '熟女的理由', falsifier: '' })
  })
  const s = settings({ llmMode: 'live' })
  const r = await runVote({ ctx, settings: s, request: request('要不要做这件事') })

  assert.equal(ctx.seen.length, 3, '应该正好三次模型调用')
  assert.ok(ctx.seen.every((q) => q.provider === 'test-provider' && q.model === 'test-model'), '应沿用会话默认模型')
  assert.equal(new Set(ctx.seen.map((q) => q.system)).size, 3, '三份 system prompt 必须互不相同')
  assert.ok(ctx.seen.every((q) => Array.isArray(q.messages) && q.messages[0].content[0].type === 'text'))
  assert.equal(r.result, RESULTS.APPROVED)
  assert.equal(r.seats.find((x) => x.unit === 'maiden').verdict.reason, '少女的理由')
})

test('live：某一台返回垃圾 → 该台按保守默认记为反对，其余照常计票', async () => {
  const ctx = fakeCtx((req) => {
    if (req.system.includes('成女')) return '我觉得可以，理由有三点。'
    return verdictJson({ stance: 'approve' })
  })
  const s = settings({ llmMode: 'live' })
  const r = await runVote({ ctx, settings: s, request: request('要不要做这件事') })
  const matron = r.seats.find((x) => x.unit === 'matron')
  assert.equal(matron.failed, true)
  assert.match(matron.error, /JSON/)
  assert.equal(r.approvals, 2)
  assert.equal(r.result, RESULTS.APPROVED)
})

test('live：三台全失败 → 表决不成立（ERROR），不伪造判决', async () => {
  const ctx = {
    agentDefaultModel: { currentSelection: () => ({ provider: 'p', model: 'm' }) },
    llm: {
      stream() {
        return (async function* generate() {
          yield { type: 'finish', reason: { kind: 'error', failure: { message: '上游 500' } } }
        })()
      },
    },
  }
  const s = settings({ llmMode: 'live' })
  const r = await runVote({ ctx, settings: s, request: request('要不要做这件事') })
  assert.equal(r.result, RESULTS.ERROR)
  assert.equal(r.rule, 'all-units-failed')
})

test('账本：追加、按 label 取回、报告能渲染出来', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'tri-sages-'))
  try {
    const ledger = createLedger(dir)
    const s = settings({ stubPreset: 'split' })
    const r = await runVote({ ctx: {}, settings: s, request: request('要不要把旧表删掉', { criticality: 'critical' }) })
    const first = await ledger.append(toRecord(r, '删表'))
    const second = await ledger.append(toRecord(r, null))

    assert.equal(first.id, 'ts-000001')
    assert.equal(second.id, 'ts-000002')

    const found = await ledger.find('删表')
    assert.equal(found.id, 'ts-000001')

    const recent = await ledger.read(10)
    assert.equal(recent.length, 2)
    assert.equal(recent[0].id, 'ts-000002')

    const text = renderReport(found)
    assert.match(text, /三贤人 · ts-000001/)
    assert.match(text, /结果：否決 VETO/)
    assert.match(text, /异议存档/)
    assert.match(text, /少女 · 黄金/)
    // 异议的原话必须原样留在账本里
    assert.equal(found.seats.find((x) => x.unit === 'maiden').verdict.reason.length > 0, true)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
