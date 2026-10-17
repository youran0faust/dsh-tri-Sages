/**
 * 三贤人 · 计票
 *
 * 纯函数，不碰 IO，方便单测。规则：
 *  1. 三台各自独立选边：approve 或 reject，**没有弃权**。
 *  2. **投 approve 必须给出 falsifier**（"什么观测会推翻我"）。给不出，这一票记为 reject。
 *     这条叫举证责任：赞成的一方要负举证。
 *  3. normal：多数决。critical：三票一致才通过，任一反对即 VETO。
 *  4. 降档：critical 未获一致时，**只有最年长的那一台可以签字**把它改成多数决。
 *  5. 调用失败的单元按保守默认记为 reject；三台全失败则整次表决报 ERROR，不伪造判决。
 *  6. 异议存档：与最终结果相反的那些票，理由原样保留，不进摘要。
 */
import { UNITS, ELDEST } from './personas.mjs'

export const RESULTS = Object.freeze({
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  VETO: 'VETO',
  ERROR: 'ERROR',
})

export const RESULT_LABEL = Object.freeze({
  APPROVED: '承認',
  REJECTED: '拒否',
  VETO: '否決',
  ERROR: '表决未成',
})

function hasText(value) {
  return typeof value === 'string' && value.trim() !== ''
}

function toList(value, max = 3) {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === 'string' ? item.trim() : String(item ?? '').trim()))
      .filter((item) => item !== '')
      .slice(0, max)
  }
  if (hasText(value)) return [String(value).trim()]
  return []
}

/** 把单元返回的任意东西收敛成契约里的形状。 */
export function normalizeVerdict(raw) {
  const source = raw && typeof raw === 'object' ? raw : {}
  const confidence = Number(source.confidence)
  return {
    stance: source.stance === 'approve' ? 'approve' : 'reject',
    confidence: Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : null,
    reason: hasText(source.reason) ? String(source.reason).trim() : '',
    basis: toList(source.basis),
    cost: toList(source.cost),
    falsifier: hasText(source.falsifier) ? String(source.falsifier).trim() : '',
    caveats: hasText(source.caveats) ? String(source.caveats).trim() : '',
  }
}

/**
 * 计票。
 * @param {object} input
 * @param {Array<{unit: string, ok: boolean, verdict?: object, error?: string}>} input.seats
 * @param {'normal'|'critical'} [input.criticality]
 * @param {boolean|undefined} [input.overrideSignature]
 *        省略 = 还没问过最年长那一台；true = 她签了；false = 她拒签。
 * @param {string} [input.overrideReason] 她签字或拒签时的理由
 */
export function tally(input = {}) {
  const criticality = input.criticality === 'critical' ? 'critical' : 'normal'
  const given = Array.isArray(input.seats) ? input.seats : []

  // 按固定座次归一，缺的按失败处理
  const seats = []
  for (const unit of UNITS) {
    const seat = given.find((s) => s && s.unit === unit.id)
    if (!seat || seat.ok !== true || !seat.verdict) {
      seats.push({
        unit: unit.id,
        label: unit.label,
        ok: false,
        failed: true,
        stance: 'reject',
        note: '调用失败，按保守默认记为拒否',
        error: seat?.error || 'no-verdict',
      })
      continue
    }
    const verdict = normalizeVerdict(seat.verdict)
    let stance = verdict.stance
    let downgraded = null
    if (stance === 'approve' && !hasText(verdict.falsifier)) {
      downgraded = {
        from: 'approve',
        to: 'reject',
        reason: 'no-falsifier',
        note: '这张赞成票没有给出「什么观测会推翻我」，按举证责任记为反对',
      }
      stance = 'reject'
    }
    seats.push({
      unit: unit.id,
      label: unit.label,
      ok: true,
      failed: false,
      stance,
      downgraded,
      verdict: { ...verdict, stance },
    })
  }

  const total = seats.length
  const approvals = seats.filter((s) => s.stance === 'approve').length
  const rejects = total - approvals
  const unitFailures = seats.filter((s) => s.failed).length

  const base = { criticality, approvals, rejects, total, seats, unitFailures }

  if (unitFailures === total) {
    return {
      ...base,
      result: RESULTS.ERROR,
      rule: 'all-units-failed',
      dissents: [],
      override: null,
      needsOverrideSignature: false,
      note: '三台全部没有回话，本次表决不成立（不伪造判决）',
    }
  }

  let result
  let rule
  if (criticality === 'critical') {
    if (approvals === total) {
      result = RESULTS.APPROVED
      rule = 'unanimous'
    } else {
      result = RESULTS.VETO
      rule = 'no-unanimity'
    }
  } else {
    result = approvals * 2 > total ? RESULTS.APPROVED : RESULTS.REJECTED
    rule = 'majority'
  }

  let override = null
  let needsOverrideSignature = false

  if (result === RESULTS.VETO) {
    const croneSeat = seats.find((s) => s.unit === ELDEST)
    if (croneSeat?.failed) {
      override = { asked: false, signed: false, unavailable: true, note: '最年长的那一台没有回话，无法降档' }
    } else if (input.overrideSignature === undefined) {
      override = { asked: false, signed: false, pending: true }
      needsOverrideSignature = true
    } else if (input.overrideSignature === true) {
      const after = approvals * 2 > total ? RESULTS.APPROVED : RESULTS.REJECTED
      override = {
        asked: true,
        signed: true,
        by: ELDEST,
        from: RESULTS.VETO,
        to: after,
        reason: hasText(input.overrideReason) ? String(input.overrideReason).trim() : '',
        note: '最年长的那一台签字降档，改按多数决执行',
      }
      result = after
      rule = 'crone-override'
    } else {
      override = {
        asked: true,
        signed: false,
        by: ELDEST,
        reason: hasText(input.overrideReason) ? String(input.overrideReason).trim() : '',
        note: '最年长的那一台拒绝签字，否决维持',
      }
    }
  }

  const finalYes = result === RESULTS.APPROVED
  const dissents = seats.filter((s) => (s.stance === 'approve') !== finalYes).map((s) => s.unit)

  return { ...base, result, rule, dissents, override, needsOverrideSignature }
}
