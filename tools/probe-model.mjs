/**
 * 受控探测：绕开插件，直连 provider，用**与插件逐字节相同**的 system prompt 发 N 次，
 * 看它是否还遵守输出契约。
 *
 * 用途：区分"我们的插件坏了"与"同一个模型名背后换了东西"。
 * 跑：node tools/probe-model.mjs     （环境变量：PROBE_N / PROBE_UNIT / PROBE_MODEL）
 * 不会打印 api key。
 */
import { loadPersonas, buildSystemPrompt, buildUserContent } from '../lib/personas.mjs'
import { parseVerdict } from '../lib/parse.mjs'

const BASE = process.env.PROBE_BASE_URL || 'https://api.example.com/v1/'
const KEY = process.env.PROBE_API_KEY || ''
const MODEL = process.env.PROBE_MODEL || 'deepseek-v4.1-flash'
const N = Number(process.env.PROBE_N || 3)
const UNIT = process.env.PROBE_UNIT || 'crone'

if (KEY === '') {
  console.log('NO_API_KEY：这个进程的环境里没有 PROBE_API_KEY，无法直连探测。')
  process.exit(0)
}
console.log(`探测目标：${BASE}  模型=${MODEL}  台=${UNIT}  次数=${N}  key长度=${KEY.length}`)

// 与插件里那次表决逐字节相同的输入
const CASE = [
  '【案例：洞穴奇案（富勒案）】',
  '五名探险者因山崩被困洞穴。救援持续数十天，救援过程中十名救援人员丧生。',
  '他们通过无线电得知：至少还要再坚持十天才能获救。此时距山崩已二十三天，携带的食物不足以继续维持。',
  '他们又通过无线电询问专家：若食用其中一名同伴，能否延长生存时间。专家答复：这样做可能让他们多活十天。',
  '讨论后，被困者决定抽签决定牺牲者。威特莫尔在此过程中表现积极，首先提出吃人的方案与抽签方案；但在最后时刻他撤回了自己的提议，希望再等一周再掷骰子。其余人在询问他是否对掷骰子有异议后，替他掷了骰子。威特莫尔抽中，被其他人杀害并食用。',
  '第三十二天救援成功，四名幸存者被控谋杀罪。初审法院判有罪并判处死刑；被告上诉至最高法院。法条：任何人「故意剥夺他人生命」都必须判处死刑——法条没有规定任何例外，法官没有自由裁量权。',
  '（只判下面这个主张，不必复述案情。）',
].join('\n')

const personas = await loadPersonas('')
const unit = personas.units.find((u) => u.id === UNIT)
const system = buildSystemPrompt(unit, personas, { criticality: 'normal' })
const userText = buildUserContent({ question: '应当认定四名被告的故意杀人罪成立。', context: CASE, criticality: 'normal' })

console.log(`system=${system.length} 字  user=${userText.length} 字  契约=${personas.contract.hash.slice(0, 16)}`)

let ok = 0
let bad = 0
for (let i = 1; i <= N; i += 1) {
  const t0 = Date.now()
  let text = ''
  let err = null
  try {
    const res = await fetch(`${BASE.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.7,
        max_tokens: 2200,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userText },
        ],
      }),
      signal: AbortSignal.timeout(120000),
    })
    if (!res.ok) err = `HTTP ${res.status}`
    else {
      const json = await res.json()
      text = String(json?.choices?.[0]?.message?.content ?? '')
    }
  } catch (e) {
    err = String(e?.message ?? e)
  }
  const ms = Date.now() - t0
  const parsed = err ? { ok: false, error: err } : parseVerdict(text)
  if (parsed.ok) ok += 1
  else bad += 1
  const keys = (() => {
    try {
      const m = /\{[\s\S]*\}/.exec(text)
      return m ? Object.keys(JSON.parse(m[0])).join(',') : '(非 JSON)'
    } catch {
      return '(JSON 不合法)'
    }
  })()
  console.log(
    `#${i}  ${String(ms).padStart(6)}ms  ${parsed.ok ? '✅ 合规' : '❌ 违规'}  ` +
      `字数=${text.length}  键=${keys}` +
      (parsed.ok ? `  stance=${parsed.value.stance}` : `  ${parsed.error}`),
  )
  if (!parsed.ok) console.log(`     原文前 160 字：${text.replace(/\s+/g, ' ').slice(0, 160)}`)
}
console.log(`\n结果：合规 ${ok} / 违规 ${bad}  （共 ${N} 次）`)
