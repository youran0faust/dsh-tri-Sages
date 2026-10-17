/**
 * 三贤人 · 斜杠命令 /sages
 *
 * 给人用的入口：不经过模型，直接在会话输入框里跑一次表决。
 * （模型用的入口是 sages_vote 工具，见 index.mjs。）
 */
import { createLedger } from './lib/ledger.mjs'
import { runVote, normalizeSettings, toRecord } from './lib/vote.mjs'
import { renderReport, renderHistory, renderPersonas } from './lib/render.mjs'
import { loadPersonas } from './lib/personas.mjs'

export const name = 'tri-sages-command'
export const inject = ['commands', 'llm', 'agentDefaultModel']

const HELP = [
  '三贤人 · /sages',
  '',
  '  /sages <一件事>            交给三贤人表决（档位自动判断；命中敏感词自动升到重大）',
  '  /sages critical <一件事>   强制按「重大」判：三票一致才通过，任一反对即否决',
  '  /sages normal <一件事>     强制按「日常」判：多数决',
  '  /sages history [N]         翻账本，默认最近 10 次',
  '  /sages <ts-000001|标签>    取回某一次表决的完整记录（含三台原话）',
  '  /sages personas            看当前生效的三份人格（目录、sha256、字数）',
  '  /sages help                这条',
  '',
  '一次表决 = 三台各自独立判断（互不可见、必须选边）+ 计票 + 落账。',
  '重大案僵住时，只有最年长的那一台会被再问一次，由她决定要不要签字降档。',
  '耗时通常 30～60 秒。',
].join('\n')

function isRecordKey(text, head) {
  return /^ts-\d{6}$/.test(head) || text.startsWith('ts-')
}

export function apply(ctx, config) {
  const settings = normalizeSettings(config)
  const ledger = createLedger(settings.ledgerDir)

  ctx.commands.register({
    name: 'sages',
    description: '三贤人：三份自我（少女/成女/熟女）对同一件事各自下判断，必须选边，赞成要负举证责任（/sages help 看用法）',
    input: { hint: '[<一件事> | critical <一件事> | history [N] | personas | help]' },
    handler: async ({ rawInput }) => {
      const raw = String(rawInput ?? '').trim()
      if (raw === '' || raw.toLowerCase() === 'help') return { kind: 'success', text: HELP }

      const parts = raw.split(/\s+/)
      const head = parts[0]
      const lower = head.toLowerCase()
      const rest = parts.slice(1).join(' ').trim()

      try {
        if (lower === 'history' || lower === 'log' || lower === '账本') {
          const limit = Number.isFinite(Number(rest)) && Number(rest) > 0 ? Math.floor(Number(rest)) : 10
          const entries = await ledger.read(limit)
          return { kind: 'success', text: renderHistory(entries, ledger.file) }
        }

        if (lower === 'personas' || lower === '人格') {
          const personas = await loadPersonas(settings.personasDir)
          return { kind: 'success', text: renderPersonas(personas) }
        }

        // 取回某一次：/sages ts-000001  或  /sages <标签>
        if (isRecordKey(raw, head)) {
          const entry = await ledger.find(head)
          if (!entry) return { kind: 'error', text: `账本里找不到「${head}」。` }
          return { kind: 'success', text: renderReport(entry) }
        }

        let criticality
        let question = raw
        if (lower === 'critical' || lower === '重要' || lower === '重大') {
          criticality = 'critical'
          question = rest
        } else if (lower === 'normal' || lower === '日常') {
          criticality = 'normal'
          question = rest
        }
        if (question.trim() === '') {
          return { kind: 'error', text: `要给个议题。\n\n${HELP}` }
        }

        const result = await runVote({ ctx, settings, request: { question, context: '', criticality } })
        const entry = await ledger.append(toRecord(result, '/sages'))
        return { kind: 'success', text: renderReport(entry) }
      } catch (err) {
        return { kind: 'error', text: `三贤人跑不动：${String(err?.message ?? err)}` }
      }
    },
  })
}

export default { name, inject, apply }
