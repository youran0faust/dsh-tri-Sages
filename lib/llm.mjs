/**
 * 三贤人 · 与宿主模型之间的桥
 *
 * 走 `ctx.llm.stream(options)`：一次性调用，**没有会话、没有工具、没有副作用**。
 * 三台因此是纯粹的判断者——它们不能去动任何东西，只能说话。
 *
 * 取文本只认 `text-delta`；`finish` 里出现 error / aborted 视为失败。
 */

/**
 * 决定这一票用哪个 provider/model。
 * config 里留空 = 沿用会话默认模型（读 agentDefaultModel 服务）。
 */
export function resolveModelSelection(ctx, settings = {}) {
  const wanted = {
    provider: typeof settings.provider === 'string' ? settings.provider.trim() : '',
    model: typeof settings.model === 'string' ? settings.model.trim() : '',
  }
  if (wanted.provider && wanted.model) return { ...wanted, source: 'config' }

  let fallback = null
  try {
    fallback = ctx?.agentDefaultModel?.currentSelection?.() ?? null
  } catch {
    fallback = null
  }
  const provider = wanted.provider || fallback?.provider || ''
  const model = wanted.model || fallback?.model || ''
  if (!provider || !model) {
    throw new Error(
      '三贤人：没有可用的 provider/model。请在插件 config 里显式指定 provider 与 model，' +
        '或确保 agentDefaultModel 服务已挂载（默认模型未设置）。',
    )
  }
  return { provider, model, source: wanted.provider || wanted.model ? 'config+default' : 'session-default' }
}

/**
 * 跑一次模型调用，把流拼成整段文本。
 * @returns {Promise<{text: string, warning: string|null}>}
 */
export async function streamText(ctx, options) {
  const { provider, model, system, userText, temperature, maxTokens, timeoutMs, signal } = options
  if (typeof ctx?.llm?.stream !== 'function') throw new Error('三贤人：宿主没有提供 llm 服务（inject 失败？）')

  const controller = new AbortController()
  const abort = (reason) => {
    try {
      controller.abort(reason)
    } catch {
      /* 已经 aborted */
    }
  }
  if (signal) {
    if (signal.aborted) abort(signal.reason)
    else signal.addEventListener('abort', () => abort(signal.reason), { once: true })
  }
  let timer = null
  if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
    timer = setTimeout(() => abort(new Error(`超时 ${timeoutMs}ms`)), timeoutMs)
    if (typeof timer.unref === 'function') timer.unref()
  }

  let text = ''
  let failure = null
  try {
    const request = {
      provider,
      model,
      system,
      messages: [{ role: 'user', content: [{ type: 'text', text: userText }] }],
      signal: controller.signal,
    }
    if (Number.isFinite(temperature)) request.temperature = temperature
    if (Number.isFinite(maxTokens) && maxTokens > 0) request.maxTokens = maxTokens

    for await (const chunk of ctx.llm.stream(request)) {
      if (!chunk || typeof chunk !== 'object') continue
      if (chunk.type === 'text-delta' && typeof chunk.text === 'string') {
        text += chunk.text
      } else if (chunk.type === 'finish') {
        const kind = chunk.reason?.kind
        if (kind === 'error' || kind === 'aborted') {
          failure = chunk.reason?.failure?.message || `模型调用结束于 ${kind}`
        }
      }
    }
  } catch (err) {
    failure = failure || String(err?.message ?? err)
  } finally {
    if (timer) clearTimeout(timer)
  }

  if (text.trim() === '') throw new Error(failure || '模型没有返回任何文本')
  return { text, warning: failure }
}
