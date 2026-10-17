/**
 * 三贤人 · 人格与提示词组装
 *
 * 三份人格是**外部 md**，每次表决现读：改完下一次表决即生效，不用重启。
 *   personas/maiden.md   少女 · 黄金（还没做过）
 *   personas/matron.md   成女 · 乳香（正在做）
 *   personas/crone.md    熟女 · 没药（已经做过太多）
 *   personas/contract.md 三台共用的输出契约
 */
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
export const DEFAULT_PERSONAS_DIR = join(HERE, '..', 'personas')

/** 三台的座次。顺序固定：少女 → 成女 → 熟女（也就是从最年轻到最老）。 */
export const UNITS = Object.freeze([
  Object.freeze({ id: 'maiden', index: 1, label: '少女', gift: '黄金', file: 'maiden.md', ask: '这件事可能成立吗' }),
  Object.freeze({ id: 'matron', index: 2, label: '成女', gift: '乳香', file: 'matron.md', ask: '这件事办得成吗、代价谁付' }),
  Object.freeze({ id: 'crone', index: 3, label: '熟女', gift: '没药', file: 'crone.md', ask: '三十年后还剩什么' }),
])

export const UNIT_IDS = Object.freeze(UNITS.map((u) => u.id))

/** 最年长那一台的 id：只有她能签降档。 */
export const ELDEST = 'crone'

export const REASON_MAX_CHARS = 200

function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

async function readText(path, what) {
  let text
  try {
    text = await readFile(path, 'utf8')
  } catch (err) {
    throw new Error(`三贤人：读不到${what}（${path}）：${err.message}`)
  }
  if (text.trim() === '') throw new Error(`三贤人：${what}是空的（${path}）`)
  return text
}

/**
 * 现读人格与契约。
 * @param {string} [personasDir] 外部人格目录；留空用插件自带的 personas/。
 * @returns {Promise<{dir: string, contract: {text: string, hash: string}, units: Array<object>}>}
 */
export async function loadPersonas(personasDir) {
  const dir = typeof personasDir === 'string' && personasDir.trim() !== '' ? personasDir.trim() : DEFAULT_PERSONAS_DIR
  const contractText = await readText(join(dir, 'contract.md'), '公共契约')
  const units = []
  for (const unit of UNITS) {
    const text = await readText(join(dir, unit.file), `单元「${unit.label}」的人格`)
    units.push({ ...unit, prompt: text, hash: sha256(text) })
  }
  return { dir, contract: { text: contractText, hash: sha256(contractText) }, units }
}

/**
 * 组装某一台的 system prompt。
 * @param {object} unit loadPersonas 返回的单元（含 prompt 与 hash）
 * @param {{contract: {text: string}}} personas
 * @param {{criticality?: 'normal'|'critical'}} [options]
 */
export function buildSystemPrompt(unit, personas, options = {}) {
  const criticality = options.criticality === 'critical' ? 'critical' : 'normal'
  const lines = [unit.prompt.trim(), '']
  if (criticality === 'critical') {
    lines.push(
      '【本次表决的档位：重大事项】',
      '本议题需要**三台一致同意**才能执行：任何一票反对即整体否决（本系统没有弃权、没有保留）。',
      '把标准提到最高：只有在你自己的立场上真正无保留地赞成时，才投 approve。',
      '有一点保留就投 reject，不要为了「让它通过」而妥协。',
      '',
    )
  }
  lines.push(`【理由长度】reason 不超过 ${REASON_MAX_CHARS} 字。`, '', personas.contract.text)
  return lines.join('\n')
}

/** 三台看到的用户消息正文（三台内容完全一致，只有 system 不同）。 */
export function buildUserContent(request) {
  const criticality = request?.criticality === 'critical' ? 'critical' : 'normal'
  const parts = ['【待决事项】', String(request?.question ?? '').trim()]
  const context = String(request?.context ?? '').trim()
  if (context !== '') parts.push('', '【背景与约束】', context)
  parts.push('', `【计票规则】${criticality === 'critical' ? '三票一致方可执行（critical）' : '多数决（normal）'}`)
  parts.push('', '按你的身份给出判断，严格按输出契约返回 JSON。')
  return parts.join('\n')
}

/**
 * 第二问：只有最年长的那一台会被问，且只在「重大案未获一致」时问。
 * 这是她唯一一次听见另外两份自己的理由——也正因为如此，签字才贵。
 */
export function buildOverrideQuestion({ question, approvals, rejects, seats }) {
  const lines = [
    '【降档表决 · 只有你会被问这一次】',
    '',
    '【待决事项】',
    String(question ?? '').trim(),
    '',
    '刚才这次表决的档位是「重大」，需要三台一致。结果是**未获一致**，按规则整体否决。',
    '现在只有你能把它改成多数决：**你签字，就按多数票执行；你不签，它维持否决。**',
    '',
    `局面：赞成 ${approvals} 票，反对 ${rejects} 票。`,
    '',
    '**这是你唯一一次听见另外两份自己的理由：**',
  ]
  const others = (seats || []).filter((s) => s && s.unit !== ELDEST)
  if (others.length === 0) lines.push('- （没有其他单元回话）')
  for (const seat of others) {
    const label = UNITS.find((u) => u.id === seat.unit)?.label || seat.unit
    const reason = seat?.verdict?.reason || seat?.note || seat?.error || '（没有给出理由）'
    lines.push(`- ${label}（${seat.stance === 'approve' ? '赞成' : '反对'}）：${reason}`)
  }
  lines.push(
    '',
    '你签字不是因为赞成这件事，而是因为你认为「让它按多数决走完」比「就这样卡住」更好。',
    '只输出一个 JSON 对象，不要解释文字：',
    '{"sign_override": true 或 false, "reason": "不超过 120 字"}',
  )
  return lines.join('\n')
}
