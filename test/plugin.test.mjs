/**
 * 三贤人 · 插件挂载测试（用真实的 @deepseek-ai/dsh-tools 与假 ctx，不联网）
 *
 * 这一份证明的是：插件**真能挂上去**——能从 DSH 安装目录解析出 dsh-tools，
 * 能注册三个工具，且工具真的跑得通。跑：node test/plugin.test.mjs
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apply, name, inject, Config } from '../index.mjs'
import { loadDshModule } from '../lib/resolve.mjs'

function fakeCtx() {
  const tools = new Map()
  return {
    tools: {
      register(tool) {
        if (tools.has(tool.name)) throw new Error(`already registered: ${tool.name}`)
        tools.set(tool.name, tool)
        return () => tools.delete(tool.name)
      },
    },
    llm: {
      stream() {
        throw new Error('stub 模式不该调模型')
      },
    },
    agentDefaultModel: { currentSelection: () => ({ provider: 'test-provider', model: 'test-model' }) },
    logger: { warn() {}, info() {}, debug() {} },
    _tools: tools,
  }
}

async function mount(over = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'tri-sages-plugin-'))
  const ctx = fakeCtx()
  await apply(ctx, { llmMode: 'stub', stubDelayMs: 0, ledgerDir: dir, ...over })
  return { ctx, dir }
}

test('插件元信息齐全', () => {
  assert.equal(name, 'tri-sages')
  assert.deepEqual(inject, ['tools', 'llm', 'agentDefaultModel'])
  assert.equal(typeof Config, 'function', 'schemastery 的 z.object() 返回可调用 schema')
  assert.equal(typeof apply, 'function')
})

test('能从 DSH 安装目录解析出 @deepseek-ai/dsh-tools（本地挂载最容易死在这里）', async () => {
  const mod = await loadDshModule('@deepseek-ai/dsh-tools')
  assert.equal(typeof mod.defineTool, 'function')
})

test('挂载后注册了三个工具，且参数规格是平铺属性映射', async () => {
  const { ctx, dir } = await mount()
  try {
    assert.deepEqual([...ctx._tools.keys()].sort(), ['sages_history', 'sages_personas', 'sages_vote'])

    const vote = ctx._tools.get('sages_vote')
    assert.equal(vote.name, 'sages_vote')
    assert.ok(vote.description.length > 50)
    // defineTool 会把参数规格转成 JSON Schema：属性必须平铺在 properties 下
    assert.ok(vote.parameters.properties.question, 'question 应在 properties 里')
    assert.deepEqual(vote.parameters.required, ['question'])
    assert.ok(vote.output && typeof vote.output.render === 'function')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('端到端：用真实工具定义跑一次表决（stub，重大档，僵局）', async () => {
  const { ctx, dir } = await mount({ stubPreset: 'split' })
  try {
    const vote = ctx._tools.get('sages_vote')
    const out = await vote.execute({ question: '要不要把生产库里的旧表删掉', label: '删表' }, {})
    assert.equal(out.result, 'VETO')
    assert.equal(out.resultLabel, '否決')
    assert.equal(out.criticality, 'critical')
    assert.equal(out.approvals, 1)
    assert.equal(out.rejects, 2)
    assert.match(out.report, /三贤人 · ts-000001/)
    assert.match(out.report, /异议存档：少女/)
    assert.match(out.report, /降档：最年长的那一台拒签/)
    // 渲染出的文本就是模型会看到的东西
    const rendered = vote.output.render({ question: 'x' }, out)
    assert.equal(rendered[0].type, 'text')
    assert.equal(rendered[0].text, out.report)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('端到端：降档路径（最年长的那一台签字）也能跑通', async () => {
  const { ctx, dir } = await mount({ stubPreset: 'downgrade' })
  try {
    const vote = ctx._tools.get('sages_vote')
    const out = await vote.execute({ question: '要不要现在就动手', criticality: 'critical' }, {})
    assert.equal(out.result, 'APPROVED')
    assert.match(out.report, /最年长的那一台已签字/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('sages_history：按 key 取回某一次，label 也认', async () => {
  const { ctx, dir } = await mount()
  try {
    const vote = ctx._tools.get('sages_vote')
    const history = ctx._tools.get('sages_history')
    await vote.execute({ question: '第一件小事', criticality: 'normal' }, {})
    await vote.execute({ question: '第二件小事', criticality: 'normal', label: '第二件' }, {})

    const list = await history.execute({ limit: 10 }, {})
    assert.equal(list.count, 2)
    assert.match(list.report, /第二件小事/)

    const one = await history.execute({ key: '第二件' }, {})
    assert.equal(one.count, 1)
    assert.match(one.report, /三贤人 · ts-000002/)

    const missing = await history.execute({ key: '不存在的东西' }, {})
    assert.equal(missing.count, 0)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('sages_personas：概要能看，全文也能取', async () => {
  const { ctx, dir } = await mount()
  try {
    const personas = ctx._tools.get('sages_personas')
    const show = await personas.execute({ action: 'show' }, {})
    assert.equal(show.count, 3)
    assert.match(show.report, /少女 · 黄金/)
    assert.match(show.report, /sha256/)

    const text = await personas.execute({ action: 'text', unit: 'crone' }, {})
    assert.equal(text.count, 1)
    assert.match(text.report, /我记得每一张脸/)

    const contract = await personas.execute({ action: 'text', unit: 'contract' }, {})
    assert.match(contract.report, /没有弃权/)

    // 非法 unit 会在 defineTool 的参数校验那一层就被拦掉（好事情：模型传不错）
    await assert.rejects(() => personas.execute({ action: 'text', unit: 'nobody' }, {}), /must be one of/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('空 question 会被工具直接拒掉', async () => {
  const { ctx, dir } = await mount()
  try {
    const vote = ctx._tools.get('sages_vote')
    await assert.rejects(() => vote.execute({ question: '   ' }, {}), /question 不能为空/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
