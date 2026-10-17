/**
 * 三贤人 · 输出解析
 *
 * 契约里写了「只输出一个 JSON 对象」，但模型经常加围栏、加前后话、加注释。
 * 所以不指望它听话：先在整段文本里找第一个**括号配平**的 JSON 对象，再退到围栏内容。
 */

/** 失败时留在错误里的原文预览长度：够诊断，又不至于把报告撑爆。 */
const PREVIEW_MAX = 800

/** 找第一个括号配平的对象字面量（认得字符串与转义）。 */
function firstBalancedObject(text) {
  const start = text.indexOf('{')
  if (start < 0) return null
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === '{') depth += 1
    else if (ch === '}') {
      depth -= 1
      if (depth === 0) return text.slice(start, i + 1)
    }
  }
  return null
}

/** 去掉 ```json 围栏，取出里面的内容；没有围栏就原样返回。 */
function stripFences(text) {
  const m = /```(?:json|JSON)?\s*([\s\S]*?)```/.exec(text)
  return m ? m[1] : text
}

/**
 * 从模型输出里抠出一个 JSON 对象。
 * @returns {{ok: true, value: object} | {ok: false, error: string, preview: string}}
 */
export function extractJson(text) {
  const raw = String(text ?? '')
  const fenced = stripFences(raw)
  const candidates = []
  const push = (value) => {
    if (typeof value === 'string' && value.trim() !== '' && !candidates.includes(value)) candidates.push(value)
  }
  push(fenced === raw ? null : fenced)
  push(raw)
  push(firstBalancedObject(fenced))
  push(firstBalancedObject(raw))

  for (const candidate of candidates) {
    let value
    try {
      value = JSON.parse(candidate.trim())
    } catch {
      continue
    }
    if (value && typeof value === 'object' && !Array.isArray(value)) return { ok: true, value }
  }
  return { ok: false, error: '没有找到合法的 JSON 对象', preview: raw.trim().slice(0, PREVIEW_MAX) }
}

/**
 * 解析一台单元的一票。必须带合法的 stance，否则算失败（失败会被计票按保守默认处理）。
 */
export function parseVerdict(text) {
  const result = extractJson(text)
  if (!result.ok) return { ...result, kind: 'verdict' }
  const value = result.value
  const stance = value.stance === 'approve' ? 'approve' : value.stance === 'reject' ? 'reject' : null
  if (stance === null) {
    return { ok: false, error: 'JSON 里没有合法的 stance（只能是 approve 或 reject）', preview: String(text).trim().slice(0, PREVIEW_MAX), kind: 'verdict' }
  }
  return { ok: true, value: { ...value, stance } }
}

/**
 * 解析最年长那一台的降档回答。只认一个布尔值。
 */
export function parseOverride(text) {
  const result = extractJson(text)
  if (!result.ok) return { ...result, kind: 'override' }
  const value = result.value
  const sign = value.sign_override ?? value.signOverride ?? value.sign ?? value.override
  if (typeof sign !== 'boolean') {
    return { ok: false, error: 'JSON 里没有 sign_override 布尔值', preview: String(text).trim().slice(0, PREVIEW_MAX), kind: 'override' }
  }
  return { ok: true, value: { sign, reason: String(value.reason ?? '').trim() } }
}
