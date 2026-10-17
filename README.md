# 三贤人 · tri-sages（DSH 插件）

三份自我，对**同一件事**各自下判断，互不可见，必须选边——再计票。

| 单元 | 献礼 | 她是哪一份自我 | 她只问一个问题 |
| --- | --- | --- | --- |
| 少女 | 黄金 | 还没做过 | 这件事**可能**成立吗 |
| 成女 | 乳香 | 正在做 | 这件事**办得成**吗，代价谁付 |
| 熟女 | 没药 | 已经做过太多 | **三十年后**还剩什么 |

三样礼物里只有黄金是给活人的——所以**替"现在还活着的人"说话的那一台，天生是少数派**。

## 怎么玩（不用启动）

**没有启动命令、不用开任何进程。** 插件挂在 DSH 宿主里，profile 一改就生效（实测热挂载，无需重启）。

两种入口：

**1. 斜杠命令（给人用）** —— 在会话输入框里直接打：

| 输入 | 作用 |
| --- | --- |
| `/sages 要不要把旧表删掉` | 跑一次表决（档位自动判断，命中敏感词自动升到重大） |
| `/sages critical 要不要现在就动手` | 强制按重大判：三票一致才过 |
| `/sages normal 中午吃什么` | 强制按日常判：多数决 |
| `/sages history` | 翻账本（最近 10 次） |
| `/sages ts-000001` | 取回某一次完整记录（含三台原话） |
| `/sages personas` | 看当前生效的三份人格 |
| `/sages help` | 用法 |

> 若 `/` 菜单里没列出它，**手打完整字符串**即可（和 `/permission`、`/cache-report` 一样，命令是注册好的）。

**2. 工具（给模型用）** —— 在对话里说「让三贤人表决：……」，agent 调 `sages_vote`。

一次表决 30～60 秒、3 次模型调用（僵局时 +1 次）。想不花钱试结构，把 `llmMode` 设成 `stub`。

## 规则（四条，一条不多）

1. **必须选边，没有弃权。** 落在自己判断域之外也要给判断，把把握写进 `caveats`。
2. **投赞成必须写明「什么观测会推翻我」。** 写不出，这一票**记为反对**——这叫举证责任。
3. 日常**多数决**；重大事项**三票一致**才通过，任一反对即 `VETO`。
4. **僵局降档**：重大案未获一致时，**只有最年长的那一台**能被再问一次，由她签字改成多数决。
   换句话说：**每达不成一次共识，权力就往年长的那一台挪一格。** 制度不会政变，它会自然地老去。
5. **异议存档**：与最终结果相反的那些票，理由**原样落账**，不进摘要、不可覆盖。

三台各自的"毛病"与"自查"写在人格文件里；每台的自查都能把自己的赞成翻成反对。详见 `personas/*.md`。

## 三个工具

| 工具 | 用途 |
| --- | --- |
| `sages_vote(question, context?, criticality?, label?)` | 发起表决。返回票数、判决、三份原话与账本 id |
| `sages_history(limit?, key?)` | 翻账本；`key` 可按 id（`ts-000003`）或 label 取回某一次 |
| `sages_personas(action?, unit?)` | 看当前生效的人格（sha256／字数）；`action:"text"` 取全文 |

判决只有三种：`APPROVED / REJECTED / VETO`（`承認 / 拒否 / 否決`）。三台全都没回话时是 `ERROR`——**不伪造判决**。

## 人格是外部文件，现读

```
personas/maiden.md     少女 · 黄金
personas/matron.md     成女 · 乳香
personas/crone.md      熟女 · 没药
personas/contract.md   三台共用的输出契约（JSON 结构、反 AI 腔、判定口径）
```

**每次表决现读**：改完文件，下一次表决就生效，不用重启。每次表决都会在账本里记下四份文件的 sha256。

## 配置

写在 profile 的 `cordis.patch.yml` 里这个条目的 `config` 下。⚠️ **Loader 的 patch 是整值替换、不做按键深合并**：要覆盖就重述整份 `config`（本插件的 `normalizeSettings` 会给缺的项补默认值，所以部分覆盖也不会崩，但别指望别人的配置还留着）。

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `provider` / `model` | `''` | 留空 = 沿用**本会话默认模型**（读 `agentDefaultModel` 服务） |
| `personasDir` | `''` | 空 = 用插件自带 `personas/` |
| `ledgerDir` | `''` | 空 = `<DSH_HOME>/tri-sages` |
| `historyLimit` | `50` | `sages_history` 默认取几条 |
| `criticalKeywords` | 内置词表 | 命中即升档到 `critical`（删/不可逆/生产/密钥/资金/医疗…） |
| `timeoutMs` | `120000` | 单台超时 |
| `maxTokens` | `2200` | 单台输出上限（v0.2.0 由 1400 提高，防 JSON 被截断） |
| `temperature` | `0.7` | 三台共用的采样温度 |
| `llmMode` | `live` | `stub` = 离线桩，不联网不花钱，用来验证结构 |
| `stubPreset` | `split` | 桩的四种预设：`split` / `unanimous` / `downgrade` / `no-falsifier` |
| `stubDelayMs` | `120` | 桩的假延迟 |

## 安装

**A. 本地挂载（当前用法，不动依赖）** —— 把插件目录放进 profile，再在 profile 的 `cordis.patch.yml` 里加：

```yaml
- insert:
    - id: tri-sages
      name: ./tri-sages/index.mjs
      config:
        llmMode: live
```

**B. 装成包**（本目录自带 `package.json` 与 `cordis.patch.yml`）：

```bash
dsh plugin --profile web add <本目录路径>
```

卸载：删掉 profile 的 `cordis.patch.yml` 里那条 `insert` 条目（A），或 `dsh plugin --profile web remove tri-sages`（B）。
账本不会自动删，位置见配置项 `ledgerDir`。

## 自测（离线，不联网）

```bash
node test/tally.test.mjs      # 13 项：计票、举证责任、降档、失败降级
node test/parse.test.mjs      #  9 项：模型输出解析（围栏/废话/嵌套/非法）
node test/pipeline.test.mjs   # 11 项：桩与假 ctx 跑通整条流水线
node test/plugin.test.mjs     #  8 项：用**真实** defineTool 挂载并调用三个工具
```

`test/plugin.test.mjs` 是第一道防线：它证明插件**真能挂上去**（含"从 DSH 安装目录解析 `@deepseek-ai/dsh-tools`"这一步——本地挂载最容易死在这里）。

## 版本与自证

每次表决的报告末尾会打印 `引擎：tri-sages vX.Y.Z`，账本每条记录也带 `pluginVersion`——
用来确认**跑起来的到底是哪一版**。

> 为什么要这个：**人格与契约是现读的，改完即生效；但代码改动要重新挂载才生效。**
> 没有这行自证，跑出来的可能还是旧代码，而"改前/改后"的对照会**静默失效**。

改动见 [CHANGELOG.md](CHANGELOG.md)。

## 已知坑

- **本地挂载时 `@deepseek-ai/dsh-tools` 不在 profile 的 node_modules 里**，`lib/resolve.mjs` 会按几个锚点往上找（`DSH_ROOT` → 主脚本目录 → cwd → npm 全局根 → `~/.dsh`）。找不到就报错，不会静默降级。必要时设 `DSH_ROOT` 指向 DSH 安装目录。
- **`ctx.llm.stream` 是一次性调用**：没有会话、没有工具。三台因此是纯粹的判断者——它们不能去动任何东西，只能说话。
- `finish` 里的 `error / aborted` 视为失败；失败的单元按**保守默认记为反对**并注明，不会被当成赞成。
- 别把 `llmMode` 留在 `stub` 上做真决策——桩判断是写死的。
