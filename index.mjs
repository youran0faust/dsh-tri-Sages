/**
 * 三贤人 · DSH 插件入口
 *
 * 三份自我对同一件事各自下判断，必须选边，赞成要负举证责任，再计票。
 * 工具：sages_vote / sages_history / sages_personas
 *
 * 人格是外部 md（personas/），每次表决现读——改完下一次就生效。
 */
import z from '@deepseek-ai/schemastery'
import { loadPersonas, UNITS, UNIT_IDS } from './lib/personas.mjs'
import { createLedger } from './lib/ledger.mjs'
import { RESULT_LABEL } from './lib/tally.mjs'
import { runVote, normalizeSettings, toRecord } from './lib/vote.mjs'
import { renderReport, renderHistory, renderPersonas } from './lib/render.mjs'
import { loadDshModule } from './lib/resolve.mjs'

export const name = 'tri-sages'
export const inject = ['tools', 'llm', 'agentDefaultModel']

/** 全部字段可选：patch 是整值替换，缺的项由 normalizeSettings 补默认。 */
export const Config = z.object({
  provider: z.string(),
  model: z.string(),
  personasDir: z.string(),
  ledgerDir: z.string(),
  historyLimit: z.number(),
  criticalKeywords: z.array(z.string()),
  timeoutMs: z.number(),
  maxTokens: z.number(),
  temperature: z.number(),
  llmMode: z.string(),
  stubPreset: z.string(),
  stubDelayMs: z.number(),
})

const VOTE_OUTPUT = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string', required: true },
    result: { type: 'string', required: true },
    resultLabel: { type: 'string', required: true },
    criticality: { type: 'string', required: true },
    approvals: { type: 'integer', required: true },
    rejects: { type: 'integer', required: true },
    report: { type: 'string', required: true },
    ledgerPath: { type: 'string', required: true },
  },
}

const TEXT_OUTPUT = {
  type: 'object',
  additionalProperties: false,
  properties: {
    count: { type: 'integer', required: true },
    report: { type: 'string', required: true },
    ledgerPath: { type: 'string', required: true },
  },
}

export async function apply(ctx, config) {
  const settings = normalizeSettings(config)
  const ledger = createLedger(settings.ledgerDir)
  const { defineTool } = await loadDshModule('@deepseek-ai/dsh-tools')

  if (settings.llmMode === 'stub') {
    ctx.logger?.warn?.('[tri-sages] llmMode=stub：三台返回桩判断，不联网。上线前请改回 live。')
  }

  // ── 表决 ────────────────────────────────────────────────────────────────
  ctx.tools.register(defineTool({
    name: 'sages_vote',
    description:
      '把一件事交给三贤人表决：三份自我（少女·黄金／成女·乳香／熟女·没药）各自独立判断，' +
      '互不可见，必须选边（没有弃权）。日常按多数决；重大事项需三票一致，任一反对即否决——' +
      '此时只有最年长的那一台能签字降档改按多数决。投赞成的单元必须给出「什么观测会推翻我」，' +
      '写不出则记为反对（举证责任）。适合在动手之前、或两个方案僵持不下时用。',
    parameters: {
      question: { type: 'string', required: true, description: '待决事项，一句话说清要判什么。' },
      context: { type: 'string', description: '背景与约束：已知条件、代价、时间点、相关的人。' },
      criticality: {
        type: 'string',
        enum: ['normal', 'critical'],
        description: '档位。不填则按敏感词自动判断（删除/不可逆/生产/密钥/资金/医疗…命中即升级为 critical）。',
      },
      label: { type: 'string', description: '给这次表决起个短标签，方便之后用 sages_history 找回来。' },
    },
    output: {
      schema: VOTE_OUTPUT,
      render: (_args, value) => [{ type: 'text', text: value.report }],
    },
    async execute(args, exec) {
      const question = String(args.question ?? '').trim()
      if (question === '') throw new Error('sages_vote: question 不能为空')
      const result = await runVote({
        ctx,
        settings,
        request: { question, context: args.context ?? '', criticality: args.criticality },
        signal: exec?.signal,
      })
      const entry = await ledger.append(toRecord(result, args.label))
      return {
        id: entry.id,
        result: entry.result,
        resultLabel: RESULT_LABEL[entry.result] || entry.result,
        criticality: entry.criticality,
        approvals: entry.approvals,
        rejects: entry.rejects,
        report: renderReport(entry),
        ledgerPath: ledger.file,
      }
    },
    presentCall: (args) => ({
      card: 'generic',
      title: `三贤人表决：${String(args.question ?? '').slice(0, 40)}`,
      kind: 'other',
      rawInput: args,
    }),
  }))

  // ── 历史账本 ────────────────────────────────────────────────────────────
  ctx.tools.register(defineTool({
    name: 'sages_history',
    description:
      '翻三贤人的账本：过去几次表决的议题、档位、票数与结果，以及少数派的异议。' +
      '传 key 可以按 id 或 label 取回某一次表决的完整记录（含三台原话）。',
    parameters: {
      limit: { type: 'integer', description: '取最近几条，默认用配置里的 historyLimit。' },
      key: { type: 'string', description: '按 id（如 ts-000003）或 label 取某一次；给了就忽略 limit。' },
    },
    output: {
      schema: TEXT_OUTPUT,
      render: (_args, value) => [{ type: 'text', text: value.report }],
    },
    async execute(args) {
      const key = String(args.key ?? '').trim()
      if (key !== '') {
        const entry = await ledger.find(key)
        if (!entry) {
          return { count: 0, report: `账本里找不到「${key}」。`, ledgerPath: ledger.file }
        }
        return { count: 1, report: renderReport(entry), ledgerPath: ledger.file }
      }
      const limit = Number.isFinite(Number(args.limit)) && Number(args.limit) > 0
        ? Math.floor(Number(args.limit))
        : settings.historyLimit
      const entries = await ledger.read(limit)
      return { count: entries.length, report: renderHistory(entries, ledger.file), ledgerPath: ledger.file }
    },
  }))

  // ── 人格 ────────────────────────────────────────────────────────────────
  ctx.tools.register(defineTool({
    name: 'sages_personas',
    description:
      '看三贤人当前生效的人格：来自哪个目录、每份的 sha256 与字数。' +
      'action=text 并指定 unit，可以把某一份人格的全文取出来（用来改它——它们是外部 md，改完下一次表决即生效）。',
    parameters: {
      action: { type: 'string', enum: ['show', 'text'], description: 'show（默认）= 概要；text = 取某一份的全文。' },
      unit: { type: 'string', enum: [...UNIT_IDS, 'contract'], description: 'action=text 时要取哪一份。' },
    },
    output: {
      schema: TEXT_OUTPUT,
      render: (_args, value) => [{ type: 'text', text: value.report }],
    },
    async execute(args) {
      const personas = await loadPersonas(settings.personasDir)
      const action = args.action === 'text' ? 'text' : 'show'
      if (action === 'show') {
        return { count: personas.units.length, report: renderPersonas(personas), ledgerPath: ledger.file }
      }
      const unit = String(args.unit ?? '').trim()
      if (unit === 'contract') {
        return { count: 1, report: `# 公共契约（${personas.dir}）\n\n${personas.contract.text}`, ledgerPath: ledger.file }
      }
      const found = personas.units.find((u) => u.id === unit)
      if (!found) {
        return {
          count: 0,
          report: `没听说过「${unit}」。可选：${UNIT_IDS.join(' / ')} / contract`,
          ledgerPath: ledger.file,
        }
      }
      return {
        count: 1,
        report: `# ${found.label} · ${found.gift}（${personas.dir}）\n\n${found.prompt}`,
        ledgerPath: ledger.file,
      }
    },
  }))
}

export default { name, inject, Config, apply }
