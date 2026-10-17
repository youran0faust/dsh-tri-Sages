/**
 * 三贤人 · 账本单测（含 id 撞号回归）
 * 跑：node test/ledger.test.mjs
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createLedger, defaultLedgerDir } from '../lib/ledger.mjs'

async function withDir(fn) {
  const dir = await mkdtemp(join(tmpdir(), 'tri-sages-ledger-'))
  try {
    return await fn(dir)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

const idsOf = async (dir) => {
  const raw = await readFile(join(dir, 'ledger.jsonl'), 'utf8')
  return raw.split('\n').filter((l) => l.trim() !== '').map((l) => JSON.parse(l).id)
}

test('默认目录跟随 DSH_HOME', () => {
  const before = process.env.DSH_HOME
  process.env.DSH_HOME = join('X:', 'fake-home')
  try {
    assert.equal(defaultLedgerDir(), join(join('X:', 'fake-home'), 'tri-sages'))
  } finally {
    if (before === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = before
  }
})

test('追加、id 递增、读回（新的在前）', async () => {
  await withDir(async (dir) => {
    const ledger = createLedger(dir)
    assert.equal((await ledger.append({ label: 'a' })).id, 'ts-000001')
    assert.equal((await ledger.append({ label: 'b' })).id, 'ts-000002')
    const recent = await ledger.read(10)
    assert.equal(recent.length, 2)
    assert.equal(recent[0].label, 'b')
    assert.equal(recent[1].label, 'a')
  })
})

test('回归：两个实例（命令模块与工具模块）不再撞号', async () => {
  await withDir(async (dir) => {
    const toolSide = createLedger(dir) // 模拟 sages_vote 工具模块
    const commandSide = createLedger(dir) // 模拟 /sages 命令模块
    const a = await toolSide.append({ label: 'tool' })
    const b = await commandSide.append({ label: 'cmd' })
    assert.equal(a.id, 'ts-000001')
    assert.equal(b.id, 'ts-000002')
    assert.notEqual(a.id, b.id)
    const ids = await idsOf(dir)
    assert.equal(new Set(ids).size, ids.length, '账本里不允许出现重复 id')
  })
})

test('交叉追加多轮也不撞号', async () => {
  await withDir(async (dir) => {
    const one = createLedger(dir)
    const two = createLedger(dir)
    for (let i = 0; i < 4; i += 1) {
      await one.append({ label: `one-${i}` })
      await two.append({ label: `two-${i}` })
    }
    assert.deepEqual(await idsOf(dir), [
      'ts-000001', 'ts-000002', 'ts-000003', 'ts-000004',
      'ts-000005', 'ts-000006', 'ts-000007', 'ts-000008',
    ])
  })
})

test('坏行不拖垮整本账，且不影响后续 seq', async () => {
  await withDir(async (dir) => {
    const ledger = createLedger(dir)
    await ledger.append({ label: '甲', question: '第一件事' })
    await ledger.append({ label: '乙', question: '第二件事' })
    const file = join(dir, 'ledger.jsonl')
    await writeFile(file, (await readFile(file, 'utf8')) + '{这不是 JSON}\n', 'utf8')

    assert.equal((await ledger.find('ts-000001')).question, '第一件事')
    assert.equal((await ledger.find('乙')).question, '第二件事')
    assert.equal(await ledger.find('不存在'), null)
    assert.equal((await ledger.read(10)).length, 2, '坏行应被跳过')
    assert.equal((await ledger.append({ label: '丙' })).id, 'ts-000003', '坏行不该影响 seq')
  })
})
