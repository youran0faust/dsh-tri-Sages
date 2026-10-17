/**
 * 三贤人 · 呈现
 *
 * 只做一件事：把结构化结果变成人能读、模型也能读的一段文本。
 * 层分两半——**公开层**是结果与票数，**里侧层**是三台各自的原话。
 */
import { UNITS } from './personas.mjs'
import { RESULT_LABEL } from './tally.mjs'

const STANCE_LABEL = { approve: '赞成', reject: '反对' }
const RULE_LABEL = {
  unanimous: '三票一致',
  'no-unanimity': '未获一致',
  majority: '多数决',
  'crone-override': '最年长者签字降档后按多数决',
  'all-units-failed': '三台全部没有回话',
}
const SOURCE_LABEL = { explicit: '显式指定', keywords: '命中敏感词', default: '默认', stub: '桩' }

function stamp(iso) {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    const pad = (n) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  } catch {
    return iso
  }
}

function seatLines(seat, index) {
  const unit = UNITS.find((u) => u.id === seat.unit) || { label: seat.unit, gift: '' }
  const mark = ['①', '②', '③'][index] ?? `${index + 1}.`
  const head = `${mark} ${unit.label} · ${unit.gift}`
  const lines = []

  if (seat.failed) {
    lines.push(`${head}   ［没有回话］`)
    lines.push(`     原因：${seat.error || '未知'}`)
    lines.push(`     按保守默认记为：${STANCE_LABEL[seat.stance] || seat.stance}`)
    return lines
  }

  const v = seat.verdict || {}
  const conf = Number.isFinite(v.confidence) ? v.confidence.toFixed(2) : '—'
  lines.push(`${head}   ${STANCE_LABEL[seat.stance] || seat.stance}   conf ${conf}`)
  lines.push(`     理由：${v.reason || '（空）'}`)
  if (Array.isArray(v.basis) && v.basis.length > 0) lines.push(`     依据：${v.basis.join(' ／ ')}`)
  if (Array.isArray(v.cost) && v.cost.length > 0) lines.push(`     代价：${v.cost.join(' ／ ')}`)
  lines.push(`     可推翻：${v.falsifier || '（未给出）'}`)
  if (v.caveats) lines.push(`     保留：${v.caveats}`)
  if (seat.downgraded) lines.push(`     ⚠ 举证责任：${seat.downgraded.note} → 记为反对`)
  return lines
}

/** 一条账本记录 → 完整报告文本。 */
export function renderReport(record) {
  const out = []
  const gateDetail = record.criticality === 'critical'
    ? `重大（${SOURCE_LABEL[record.criticalitySource] || record.criticalitySource}${record.matchedKeywords?.length ? `：${record.matchedKeywords.join('、')}` : ''}）`
    : '日常'

  out.push(`三贤人 · ${record.id ?? '(未落账)'}${record.ts ? ` · ${stamp(record.ts)}` : ''}`)
  if (record.label) out.push(`标签：${record.label}`)
  out.push(`议题：${record.question}`)
  out.push(`档位：${gateDetail}`)
  out.push(`结果：${RESULT_LABEL[record.result] || record.result} ${record.result} · ${record.approvals}:${record.rejects}（${RULE_LABEL[record.rule] || record.rule}）`)
  const missing = record.seats.filter((s) => s.failed).length
  if (missing > 0) {
    const live = Number.isFinite(record.quorum) ? record.quorum : record.seats.length - missing
    out.push(`⚠ 已表态：${live}/${record.seats.length} 台 —— 结果里有 ${missing} 张系统代投的反对票，请按折扣读`)
  }
  out.push('')

  record.seats.forEach((seat, index) => {
    out.push('─'.repeat(46))
    out.push(...seatLines(seat, index))
  })
  out.push('─'.repeat(46))

  const ov = record.override
  if (ov && ov.asked !== false) {
    if (ov.signed) out.push(`降档：最年长的那一台已签字 → 改按多数决：${RESULT_LABEL[ov.to] || ov.to}`)
    else out.push('降档：最年长的那一台拒签 → 否决维持')
    if (ov.reason) out.push(`     她的原话：${ov.reason}`)
  } else if (ov && ov.pending) {
    out.push('降档：尚未询问最年长的那一台')
  } else if (ov && ov.unavailable) {
    out.push('降档：最年长的那一台没有回话，无法降档')
  }

  if (Array.isArray(record.dissents) && record.dissents.length > 0) {
    const names = record.dissents.map((id) => UNITS.find((u) => u.id === id)?.label || id)
    out.push(`异议存档：${names.join('、')}（理由已原样落账，不进摘要）`)
  }

  const failed = record.seats.filter((s) => s.failed).length
  if (failed > 0) {
    out.push(`未能回话：${failed} 台 —— 它们那一票是系统代投的反对，不是它们自己的判断。`)
    out.push('账本里保留了每台的原始返回（raw），可事后诊断。')
  }

  const model = record.model
  if (model) out.push(`模型：${model.provider}/${model.model}（${SOURCE_LABEL[model.source] || model.source}）`)
  if (Number.isFinite(record.elapsedMs)) out.push(`用时：${(record.elapsedMs / 1000).toFixed(1)}s`)
  if (record.pluginVersion) out.push(`引擎：tri-sages v${record.pluginVersion}`)
  if (record.llmMode === 'stub') out.push('注意：本次是桩模型（llmMode=stub），不联网、不花钱。')
  return out.join('\n')
}

/** 历史列表 → 文本。 */
export function renderHistory(entries, ledgerFile) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return `账本还是空的。\n位置：${ledgerFile}`
  }
  const out = [`最近 ${entries.length} 次表决（新的在前）`, `账本：${ledgerFile}`, '']
  for (const entry of entries) {
    const label = entry.label ? `［${entry.label}］` : ''
    out.push(`${entry.id} · ${stamp(entry.ts)} · ${RESULT_LABEL[entry.result] || entry.result} ${entry.approvals}:${entry.rejects} · ${entry.criticality} ${label}`)
    out.push(`    ${String(entry.question ?? '').replace(/\s+/g, ' ').slice(0, 80)}`)
    if (Array.isArray(entry.dissents) && entry.dissents.length > 0) {
      const names = entry.dissents.map((id) => UNITS.find((u) => u.id === id)?.label || id)
      out.push(`    异议：${names.join('、')}`)
    }
  }
  return out.join('\n')
}

/** 人格现状 → 文本。 */
export function renderPersonas(personas, extra) {
  const out = [
    '三贤人 · 当前生效的人格',
    `目录：${personas.dir}`,
    `公共契约 sha256：${personas.contract.hash.slice(0, 16)}…`,
    '',
  ]
  for (const unit of personas.units) {
    out.push(`${unit.label} · ${unit.gift}　sha256 ${unit.hash.slice(0, 16)}…　${unit.prompt.length} 字`)
    out.push(`   她在问：${unit.ask}`)
  }
  out.push('', '这些是**外部 md**，每次表决现读：改完文件，下一次表决就生效，不用重启。')
  if (extra) out.push('', extra)
  return out.join('\n')
}
