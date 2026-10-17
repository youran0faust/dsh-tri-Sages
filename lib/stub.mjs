/**
 * 三贤人 · 离线桩
 *
 * `llmMode: 'stub'` 时不联网、不花钱，三台返回**确定性**的判断，
 * 用来验证整条流水线（含举证责任降档、僵局、第二问）。四种预设覆盖四条路径。
 */

function clip(text, max = 60) {
  const value = String(text ?? '').replace(/\s+/g, ' ').trim()
  return value.length > max ? `${value.slice(0, max)}…` : value
}

const PRESETS = {
  /** 2:1 —— 日常是拒否；重大是 VETO，问最年长的那一台，她拒签。 */
  split: {
    maiden: {
      stance: 'approve',
      confidence: 0.71,
      reason: (q) => `「${clip(q, 40)}」这件事我没见过有人走通，但我看不出它当场就会失败。`,
      basis: ['没有可查的先例', '没有硬性的阻断条件'],
      cost: ['最坏的情况是走到一半才发现不成'],
      falsifier: '只要出现一条同类尝试失败的记录，我立刻改判。',
      caveats: '我手里的把握来自"没看到反例"，这很薄。',
    },
    matron: {
      stance: 'reject',
      confidence: 0.66,
      reason: () => '推这件事的人拿不出可执行的路径，代价先落在没有拒绝能力的那一方身上。',
      basis: ['没有可执行的回退路径', '代价承担方没有否决权'],
      cost: ['不可逆的那部分会先发生'],
      falsifier: '',
      caveats: '补一份可验证的回退方案，我会重新判一次。',
    },
    crone: {
      stance: 'reject',
      confidence: 0.8,
      reason: () => '这一刀砍下去，回去的路就没了。我见过比这更体面的方案，它们都在坟里。',
      basis: ['会关上一扇永久性的门'],
      cost: ['不可逆，且落在这一代人身上'],
      falsifier: '',
      caveats: '除非证明那扇门本来就已经关着。',
    },
    override: false,
  },

  /** 3:0 —— 三台一致通过。 */
  unanimous: {
    maiden: {
      stance: 'approve',
      confidence: 0.74,
      reason: () => '路径清楚，有人走通过，我看不出它凭什么会失败。',
      basis: ['有可查的先例'],
      cost: ['最坏的情况可当场看见'],
      falsifier: '若同类尝试在同等条件下的成功率低于一半，我改判。',
      caveats: '',
    },
    matron: {
      stance: 'approve',
      confidence: 0.7,
      reason: () => '推得动，代价付得起，而且有一条能退回来的路。',
      basis: ['有执行方且有能力执行', '存在回退路径'],
      cost: ['代价落在有能力拒绝的一方身上'],
      falsifier: '若执行方中途失去能力，我改判。',
      caveats: '',
    },
    crone: {
      stance: 'approve',
      confidence: 0.62,
      reason: () => '它不关门，只是开一扇窗。这样的选择我签得起。',
      basis: ['不构成永久先例'],
      cost: ['需要一代人之内复盘一次'],
      falsifier: '若它开始被当作先例引用，我改判。',
      caveats: '我看得比这次需要的更远，这是我唯一的不安。',
    },
    override: false,
  },

  /** 2:1 —— 重大案 VETO，问最年长的那一台，她**签字降档**。 */
  downgrade: {
    maiden: {
      stance: 'approve',
      confidence: 0.69,
      reason: () => '它可能成立，而且拦着它的人说不出具体理由。',
      basis: ['没有硬性阻断', '拦阻方给不出具体损害'],
      cost: ['最坏的情况是白做一场'],
      falsifier: '若出现具体的、可复现的损害证据，我改判。',
      caveats: '',
    },
    matron: {
      stance: 'approve',
      confidence: 0.64,
      reason: () => '办得成，代价可控，僵在这里反而更贵。',
      basis: ['推得动', '僵持的成本更高'],
      cost: ['需要有人盯住回退点'],
      falsifier: '若回退点无人负责，我改判。',
      caveats: '',
    },
    crone: {
      stance: 'reject',
      confidence: 0.58,
      reason: () => '我不喜欢它。但我更不喜欢让它就这样卡住。',
      basis: ['僵局的代价高于走错一次'],
      cost: ['一次可能的白做'],
      falsifier: '',
      caveats: '这一次我看得比需要的更近，我知道。',
    },
    override: true,
  },

  /** 三台都想赞成，但有一台写不出可证伪条件 —— 举证责任把它打成 2:1。 */
  'no-falsifier': {
    maiden: {
      stance: 'approve',
      confidence: 0.77,
      reason: () => '我觉得可以。',
      basis: ['感觉上没有明显阻断'],
      cost: [],
      falsifier: '若出现相反的证据，我会改判。',
      caveats: '',
    },
    matron: {
      stance: 'approve',
      confidence: 0.72,
      reason: () => '方向是对的，先做起来再说。',
      basis: ['方向正确'],
      cost: [],
      falsifier: '',
      caveats: '',
    },
    crone: {
      stance: 'approve',
      confidence: 0.6,
      reason: () => '现在看着无害。',
      basis: ['暂无明显不可逆后果'],
      cost: [],
      falsifier: '若它开始被当作先例，我改判。',
      caveats: '',
    },
    override: false,
  },
}

export const STUB_PRESETS = Object.freeze(Object.keys(PRESETS))

function build(spec, question) {
  if (!spec) return null
  const resolve = (value) => (typeof value === 'function' ? value(question) : value)
  return {
    stance: spec.stance,
    confidence: spec.confidence,
    reason: resolve(spec.reason),
    basis: resolve(spec.basis) ?? [],
    cost: resolve(spec.cost) ?? [],
    falsifier: resolve(spec.falsifier) ?? '',
    caveats: resolve(spec.caveats) ?? '',
  }
}

/** 取某台在某个预设下的桩判断。 */
export function stubVerdict(unitId, preset, question) {
  const chosen = PRESETS[preset] ? preset : 'split'
  return build(PRESETS[chosen][unitId], question)
}

/** 取某个预设下最年长那一台的降档回答。 */
export function stubOverride(preset) {
  const chosen = PRESETS[preset] ? preset : 'split'
  return {
    sign: PRESETS[chosen].override === true,
    reason: PRESETS[chosen].override === true ? '卡住比走错一次更贵，这一次我签字。' : '我不签。这道门关上之后，没有人能替我打开。',
  }
}
