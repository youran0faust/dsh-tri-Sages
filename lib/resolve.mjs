/**
 * 在宿主进程里定位并加载 DSH 自己的包（@deepseek-ai/dsh-tools 等）。
 *
 * 为什么需要这个：插件以 `name: './tri-sages/index.mjs'` 这种**本地路径**被
 * 挂进 profile 时，从插件目录往上找**找不到** `@deepseek-ai/dsh-tools`——
 * 它装在 DSH 安装目录的 node_modules 里，不在 profile 的 node_modules 里。
 * 所以这里按几个锚点往上搜，搜到就加载。
 * （dsh-undo-savepoint 用的是同一套办法，本机在用，可靠。）
 */
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, parse as parsePath } from 'node:path'
import { homedir } from 'node:os'
import { pathToFileURL } from 'node:url'

const cache = new Map()

function anchorRoots() {
  const roots = []
  const push = (value) => {
    if (typeof value === 'string' && value.trim() !== '' && !roots.includes(value)) roots.push(value)
  }
  push(process.env.DSH_ROOT)
  if (process.argv[1]) push(dirname(process.argv[1]))
  push(process.cwd())
  push(join(homedir(), 'AppData', 'Roaming', 'npm', 'node_modules'))
  push(join(homedir(), 'AppData', 'Roaming', 'npm', 'node_modules', '@deepseek-ai', 'dsh'))
  push(join(homedir(), '.dsh'))
  push(join(homedir(), '.dsh', 'dsh-runtimes'))
  return roots
}

/** 把 "pkg/name" 拆成路径片段，逐层往父目录找 node_modules。 */
function findPackageDir(spec) {
  const parts = spec.split('/')
  for (const root of anchorRoots()) {
    let dir = root
    for (let depth = 0; depth < 14; depth += 1) {
      for (const base of [dir, join(dir, 'node_modules')]) {
        const candidate = join(base, ...parts)
        if (existsSync(join(candidate, 'package.json'))) return candidate
      }
      const up = dirname(dir)
      if (up === dir) break
      dir = up
    }
    const stem = parsePath(root).root
    if (root === stem) break
  }
  return null
}

/** 从 package.json 里挑出入口文件。 */
function packageEntry(dir) {
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
  const exported = pkg.exports
  let rel = null
  if (typeof exported === 'string') rel = exported
  else if (exported && typeof exported === 'object') {
    const dot = exported['.']
    if (typeof dot === 'string') rel = dot
    else if (dot && typeof dot === 'object') rel = dot.import ?? dot.node ?? dot.default ?? null
  }
  if (!rel) rel = pkg.module ?? pkg.main ?? 'index.js'
  return join(dir, rel)
}

/**
 * 加载一个 DSH 包。先按锚点搜，搜到就优先用 createRequire（Node ≥22 支持 require(esm)），
 * 再退到动态 import；全找不到就按普通裸 import 试一次。
 * @param {string} spec 包名，例如 '@deepseek-ai/dsh-tools'
 */
export async function loadDshModule(spec) {
  if (cache.has(spec)) return cache.get(spec)
  const pending = (async () => {
    const dir = findPackageDir(spec)
    if (dir) {
      try {
        const req = createRequire(join(dir, 'package.json'))
        return req(spec)
      } catch {
        /* 落到动态 import */
      }
      try {
        return await import(pathToFileURL(packageEntry(dir)).href)
      } catch {
        /* 落到裸 import */
      }
    }
    return await import(spec)
  })()
  cache.set(spec, pending)
  try {
    return await pending
  } catch (err) {
    cache.delete(spec)
    throw new Error(
      `tri-sages：加载不了 "${spec}"（${err?.message ?? err}）。` +
        '若插件是本地挂载，请把环境变量 DSH_ROOT 指向 DSH 安装目录。',
    )
  }
}
