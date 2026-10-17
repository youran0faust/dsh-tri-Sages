/**
 * 三贤人 · 账本
 *
 * JSONL 追加，永不覆盖。**异议存档就在这里**：少数派的理由原样落盘，不进摘要、不参与压缩。
 */
import { appendFile, mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'

export function defaultLedgerDir() {
  const home = process.env.DSH_HOME || join(homedir(), '.dsh')
  return join(home, 'tri-sages')
}

export function createLedger(dir) {
  const base = typeof dir === 'string' && dir.trim() !== '' ? dir.trim() : defaultLedgerDir()
  const file = join(base, 'ledger.jsonl')

  async function readAll() {
    try {
      return await readFile(file, 'utf8')
    } catch {
      return ''
    }
  }

  /**
   * 每次都从文件重算 max seq —— **不缓存**。
   *
   * 为什么：命令模块（/sages）与工具模块（sages_vote）各自持有一个 ledger 实例，
   * 而缓存会让两个实例各写出一条 seq 相同的记录 —— 2026-10-16 实测撞出两条 ts-000002。
   * 账本只有几十行，每次重读的代价可以忽略。
   * 说明：这只保证同一进程内顺序调用不撞号；跨进程并发写需要文件锁，本插件用不到。
   */
  async function nextSeq() {
    const text = await readAll()
    let max = 0
    for (const line of text.split('\n')) {
      const m = /"seq"\s*:\s*(\d+)/.exec(line)
      if (m) {
        const n = Number(m[1])
        if (n > max) max = n
      }
    }
    return max + 1
  }

  return {
    dir: base,
    file,
    /** 追加一条记录，返回带 seq / id 的完整条目。 */
    async append(record) {
      await mkdir(base, { recursive: true })
      const n = await nextSeq()
      const entry = { seq: n, id: `ts-${String(n).padStart(6, '0')}`, ...record }
      await appendFile(file, JSON.stringify(entry) + '\n', 'utf8')
      return entry
    },
    /** 读最近 limit 条（新的在前）。坏行跳过，不因为一行坏掉整本账。 */
    async read(limit = 10) {
      const count = Number.isFinite(Number(limit)) && Number(limit) > 0 ? Math.floor(Number(limit)) : 10
      const text = await readAll()
      const lines = text.split('\n').filter((line) => line.trim() !== '')
      const out = []
      for (let i = lines.length - 1; i >= 0 && out.length < count; i -= 1) {
        try {
          out.push(JSON.parse(lines[i]))
        } catch {
          /* 跳过坏行 */
        }
      }
      return out
    },
    /** 按 label 或 id 找一条，或返回最近一条匹配。 */
    async find(key) {
      const needle = String(key ?? '').trim()
      if (needle === '') return null
      const text = await readAll()
      const lines = text.split('\n').filter((line) => line.trim() !== '')
      for (let i = lines.length - 1; i >= 0; i -= 1) {
        let entry
        try {
          entry = JSON.parse(lines[i])
        } catch {
          continue
        }
        if (entry.id === needle || entry.label === needle) return entry
      }
      return null
    },
  }
}
