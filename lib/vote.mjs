/**
 * 三贤人 · 表决流水线
 *
 * 一次表决 = 三台**并行、互不可见**的判断 + 计票；重大案僵住时，再单独问最年长那一台一次。
 */
import { loadPersonas, ELDEST, buildSystemPrompt, buildUserContent, buildOverrideQuestion } from './personas.mjs'
import { tally } from './tally.mjs'
import { parseVerdict, parseOverride } from './parse.mjs'
import { resolveModelSelection, streamText } from './llm.mjs'
import { stubVerdict, stubOverride, STUB_PRESETS } from './stub.mjs'

/** 插件版本。会写进每条账本记录，用来确认"跑起来的到底是哪一版"。 */
export const PLUGIN_VERSION = '0.2.1'

/** 通用敏感词：命中即把档位升到 critical（三票一致才通过）。 */
export const DEFAULT_CRITICAL_KEYWORDS = Object.freeze([
  '删', '抹掉', '销毁', '不可逆', '覆盖', '清空', '格式化', '迁移', '上线', '生产', '发布', '外发', '上传', '公开',
  '密钥', '凭据', '密码', '隐私', '资金', '付款', '转账', '投资', '担保', '签字', '合同', '法律',
  '医疗', '手术', '用药', '人身', '安全', '辞职', '离职', '分手', '离婚', '买房', '卖掉',
])

function str(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function positiveNumber(value, fallback) {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

/** 把 patch 里那份可能残缺的 config 补成一份完整设置。 */
export function normalizeSettings(config = {}) {
  const source = config && typeof config === 'object' ? config : {}
  const keywords = Array.isArray(source.criticalKeywords) && source.criticalKeywords.length > 0
    ? source.criticalKeywords.map((k) => String(k)).filter((k) => k.trim() !== '')
    : [...DEFAULT_CRITICAL_KEYWORDS]
  const temperature = Number(source.temperature)
  const stubDelay = Number(source.stubDelayMs)
  return {
    provider: str(source.provider),
    model: str(source.model),
    personasDir: str(source.personasDir),
    ledgerDir: str(source.ledgerDir),
    historyLimit: Math.floor(positiveNumber(source.historyLimit, 50)),
    criticalKeywords: keywords,
    timeoutMs: Math.floor(positiveNumber(source.timeoutMs, 120000)),
    maxTokens: Math.floor(positiveNumber(source.maxTokens, 2200)),
    temperature: Number.isFinite(temperature) ? temperature : 0.7,
    llmMode: source.llmMode === 'stub' ? 'stub' : 'live',
    stubPreset: STUB_PRESETS.includes(source.stubPreset) ? source.stubPreset : 'split',
    stubDelayMs: Number.isFinite(stubDelay) && stubDelay >= 0 ? stubDelay : 120,
  }
}

/** 档位：显式给就听显式的；没给就按敏感词自动升级。 */
export function resolveCriticality(request, settings) {
  const explicit = request?.criticality
  if (explicit === 'critical') return { criticality: 'critical', source: 'explicit', matched: [] }
  if (explicit === 'normal') return { criticality: 'normal', source: 'explicit', matched: [] }
  const haystack = `${request?.question ?? ''}\n${request?.context ?? ''}`
  const matched = (settings?.criticalKeywords ?? []).filter((k) => k && haystack.includes(k))
  if (matched.length > 0) return { criticality: 'critical', source: 'keywords', matched }
  return { criticality: 'normal', source: 'default', matched: [] }
}

function delay(ms) {
  if (!(ms > 0)) return Promise.resolve()
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms)
    if (typeof t.unref === 'function') t.unref()
  })
}

/**
 * 跑一次完整表决。
 * @param {object} input
 * @param {object} input.ctx 宿主上下文（需要 llm / agentDefaultModel 服务）
 * @param {object} input.settings normalizeSettings 的结果
 * @param {{question: string, context?: string, criticality?: string}} input.request
 * @param {AbortSignal} [input.signal]
 */
export async function runVote({ ctx, settings, request, signal }) {
  const startedAt = Date.now()
  const personas = await loadPersonas(settings.personasDir)
  const gate = resolveCriticality(request, settings)
  const selection = settings.llmMode === 'stub'
    ? { provider: 'stub', model: 'stub', source: 'stub' }
    : resolveModelSelection(ctx, settings)
  const userText = buildUserContent({ question: request.question, context: request.context, criticality: gate.criticality })

  const runOne = async (unit) => {
    if (settings.llmMode === 'stub') {
      await delay(settings.stubDelayMs)
      return { unit: unit.id, ok: true, verdict: stubVerdict(unit.id, settings.stubPreset, request.question), stub: true }
    }
    try {
      const { text, warning } = await streamText(ctx, {
        provider: selection.provider,
        model: selection.model,
        system: buildSystemPrompt(unit, personas, { criticality: gate.criticality }),
        userText,
        temperature: settings.temperature,
        maxTokens: settings.maxTokens,
        timeoutMs: settings.timeoutMs,
        signal,
      })
      const parsed = parseVerdict(text)
      if (!parsed.ok) {
        return { unit: unit.id, ok: false, error: `${parsed.error}｜原文：${parsed.preview}`, warning, raw: text.slice(0, 2000) }
      }
      // 成功的票不再存原文（解析出来的 verdict 就是内容），免得账本白白胖三倍
      return { unit: unit.id, ok: true, verdict: parsed.value, warning }
    } catch (err) {
      return { unit: unit.id, ok: false, error: String(err?.message ?? err) }
    }
  }

  // 注意：必须遍历**装载后**的 personas.units（带 prompt），不是元数据常量 UNITS
  const seats = await Promise.all(personas.units.map(runOne))
  let result = tally({ seats, criticality: gate.criticality })

  // ── 第二问：只有最年长的那一台会被问，且只在「重大案未获一致」时 ──
  let overrideTurn = null
  if (result.needsOverrideSignature) {
    const crone = personas.units.find((u) => u.id === ELDEST)
    if (settings.llmMode === 'stub') {
      await delay(settings.stubDelayMs)
      overrideTurn = { ...stubOverride(settings.stubPreset), stub: true }
    } else {
      try {
        const { text } = await streamText(ctx, {
          provider: selection.provider,
          model: selection.model,
          system: buildSystemPrompt(crone, personas, { criticality: gate.criticality }),
          userText: buildOverrideQuestion({
            question: request.question,
            approvals: result.approvals,
            rejects: result.rejects,
            seats: result.seats,
          }),
          temperature: settings.temperature,
          maxTokens: settings.maxTokens,
          timeoutMs: settings.timeoutMs,
          signal,
        })
        const parsed = parseOverride(text)
        overrideTurn = parsed.ok
          ? parsed.value
          : { sign: false, reason: `回答无法解析（${parsed.error}），按不签字处理` }
      } catch (err) {
        overrideTurn = { sign: false, reason: `第二问失败（${err?.message ?? err}），按不签字处理` }
      }
    }
    result = tally({
      seats,
      criticality: gate.criticality,
      overrideSignature: overrideTurn.sign,
      overrideReason: overrideTurn.reason,
    })
  }

  return {
    ...result,
    gate,
    overrideTurn,
    question: String(request.question ?? '').trim(),
    personas: {
      dir: personas.dir,
      contractHash: personas.contract.hash,
      units: personas.units.map((u) => ({ id: u.id, label: u.label, gift: u.gift, hash: u.hash, chars: u.prompt.length })),
    },
    selection,
    llmMode: settings.llmMode,
    elapsedMs: Date.now() - startedAt,
  }
}

/** 把一次表决的结果整理成要落账的那条记录（异议原样保留）。 */
export function toRecord(result, label) {
  const clean = str(label)
  return {
    ts: new Date().toISOString(),
    label: clean === '' ? null : clean,
    question: result.question,
    criticality: result.criticality,
    criticalitySource: result.gate.source,
    matchedKeywords: result.gate.matched,
    result: result.result,
    rule: result.rule,
    approvals: result.approvals,
    rejects: result.rejects,
    // 真正回了话的台数。有台没回话时，它那张"反对"是系统代投的，必须标出来。
    quorum: result.total - result.unitFailures,
    degraded: result.unitFailures > 0,
    override: result.override,
    overrideTurn: result.overrideTurn ?? null,
    dissents: result.dissents,
    seats: result.seats.map((s) => ({
      unit: s.unit,
      label: s.label,
      stance: s.stance,
      failed: Boolean(s.failed),
      note: s.note ?? null,
      error: s.error ?? null,
      warning: s.warning ?? null,
      downgraded: s.downgraded ?? null,
      verdict: s.verdict ? { ...s.verdict } : null,
      // 只有失败的单元才留原始返回（2000 字），用来事后诊断
      raw: s.failed ? (s.raw ?? null) : null,
    })),
    personas: result.personas,
    model: result.selection,
    llmMode: result.llmMode,
    pluginVersion: PLUGIN_VERSION,
    elapsedMs: result.elapsedMs,
  }
}
