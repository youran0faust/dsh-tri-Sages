/**
 * 三贤人 · 斜杠命令单测（假 ctx，不联网）
 * 跑：node test/command.test.mjs
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apply, name, inject } from '../command.mjs'

function fakeCtx() {
  const commands = new Map()
  return {
    commands: {
      register(command) {
        if (commands.has(command.name)) throw new Error(`already registered: ${command.name}`)
        commands.set(command.name, command)
        return () => commands.delete(command.name)
      },
    },
    llm: {
      stream() {
        throw new Error('stub 模式不该调模型')
      },
    },
    agentDefaultModel: { currentSelection: () => ({ provider: 'test-provider', model: 'test-model' }) },
    logger: { warn() {}, info() {} },
    _commands: commands,
  }
}

async function mount(over = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'tri-sages-cmd-'))
  const ctx = fakeCtx()
  apply(ctx, { llmMode: 'stub', stubDelayMs: 0, ledgerDir: dir, ...over })
  return { ctx, dir, run: (rawInput) => ctx._commands.get('sages').handler({ rawInput }) }
}

test('注册了 /sages，元信息齐全', async () => {
  const { ctx, dir } = await mount()
  try {
    assert.equal(name, 'tri-sages-command')
    assert.deepEqual(inject, ['commands', 'llm', 'agentDefaultModel'])
    assert.deepEqual([...ctx._commands.keys()], ['sages'])
    const command = ctx._commands.get('sages')
    assert.equal(command.name, 'sages')
    assert.ok(command.input.hint.includes('critical'))
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('空输入与 help 都给帮助', async () => {
  const { dir, run } = await mount()
  try {
    const empty = await run('')
    assert.equal(empty.kind, 'success')
    assert.match(empty.text, /\/sages critical/)
    const help = await run('help')
    assert.equal(help.kind, 'success')
    assert.match(help.text, /一次表决/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('跑一次表决：自动升档（命中敏感词）→ 落账 → 出报告', async () => {
  const { dir, run } = await mount({ stubPreset: 'split' })
  try {
    const out = await run('要不要把生产库的旧表删掉')
    assert.equal(out.kind, 'success')
    assert.match(out.text, /三贤人 · ts-000001/)
    assert.match(out.text, /档位：重大（命中敏感词：删、生产）/)
    assert.match(out.text, /结果：否決 VETO/)
    assert.match(out.text, /少女 · 黄金/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('critical / normal 前缀能强制档位', async () => {
  const { dir, run } = await mount({ stubPreset: 'unanimous' })
  try {
    const forced = await run('critical 一件无害的小事')
    assert.match(forced.text, /档位：重大（显式指定）/)
    assert.match(forced.text, /结果：承認 APPROVED/)

    const normal = await run('normal 一件无害的小事')
    assert.match(normal.text, /档位：日常/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('history 与按 id 取回', async () => {
  const { dir, run } = await mount({ stubPreset: 'unanimous' })
  try {
    await run('normal 第一件事')
    await run('normal 第二件事')

    const list = await run('history')
    assert.match(list.text, /最近 2 次表决/)
    assert.match(list.text, /第二件事/)

    const one = await run('ts-000001')
    assert.match(one.text, /第一件事/)
    assert.match(one.text, /三贤人 · ts-000001/)

    const missing = await run('ts-999999')
    assert.equal(missing.kind, 'error')
    assert.match(missing.text, /找不到/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('personas 能看当前生效的人格', async () => {
  const { dir, run } = await mount()
  try {
    const out = await run('personas')
    assert.equal(out.kind, 'success')
    assert.match(out.text, /少女 · 黄金/)
    assert.match(out.text, /熟女 · 没药/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('只给前缀不给议题 → 报错并给帮助', async () => {
  const { dir, run } = await mount()
  try {
    const out = await run('critical')
    assert.equal(out.kind, 'error')
    assert.match(out.text, /要给个议题/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('模型层出问题时会变成一条 error 文本，不会把命令炸掉', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'tri-sages-cmd-'))
  try {
    const ctx = fakeCtx()
    // 故意用 live 模式 + 没有可用的 agentDefaultModel → runVote 应当抛错并被捕获
    ctx.agentDefaultModel = { currentSelection: () => ({}) }
    apply(ctx, { llmMode: 'live', ledgerDir: dir })
    const out = await ctx._commands.get('sages').handler({ rawInput: '一件事' })
    assert.equal(out.kind, 'error')
    assert.match(out.text, /三贤人跑不动/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
