# Tri-Sages · 三贤人

[![CI](https://github.com/youran0faust/dsh-tri-Sages/actions/workflows/ci.yml/badge.svg)](https://github.com/youran0faust/dsh-tri-Sages/actions/workflows/ci.yml) ![node](https://img.shields.io/badge/node-%3E%3D20-brightgreen) [![version](https://img.shields.io/badge/version-v0.2.1-blue)](https://github.com/youran0faust/dsh-tri-Sages/releases/tag/v0.2.1)

> **Ask the same thing twice and it gives you two answers — and never tells you.**

A multi-agent judgment plugin for DSH (DeepSeek Harness). Three persona units judge independently and blind to one another, **must take a side**, and an approving vote must state *what observation would refute it*. Votes are tallied by rule, and every reason — including every dissent — is kept **verbatim**.

> [中文](README.md) | English · MIT · zero runtime dependencies

## The question it answers

Ask a large model to help you decide and it fails in three structural ways — and all of them land hardest on decisions you cannot take back:

| Failure | What it looks like |
|---|---|
| **Fudging** | A flawless two-sided answer. You read it and stay exactly where you were — more information, no decision |
| **Wishing machine** | It follows the asker's preference. You hear what you wanted to hear |
| **Cannot vouch for itself** | Ask the same question twice and you may get two answers, with no signal that anything changed |

Tri-Sages writes the discipline into the **mechanism** rather than into the goodwill of a prompt:

| Pain | What it does |
|---|---|
| Fudging: you read it and stay put | **Take a side** — the verdict is approve or reject, with **no abstention**; if the matter falls outside your domain, still judge, and put your uncertainty in the caveats |
| Wishing machine: it tells you what you want | **Approval carries the burden of proof** — an approving vote must state *what observation would refute it*; without that, the system **records it as a rejection** |
| A single judgment cannot vouch for itself | **Unanimity plus a self-reported engine** — critical matters need all three, any rejection vetoes; every record carries the engine version and persona hashes |
| The conclusion is not auditable | **Dissent archived verbatim** — minority reasons are stored as written, never summarized, never overwritten |
| A deadlock stalls with nobody accountable | **A downgrade must be signed** — only the eldest is asked once more, and only she can sign it into a majority; power moves and it leaves a name |
| The persona is a black box | **Personas and contract are external Markdown** — read on every vote, so an edit takes effect on the next vote, no restart |

### The three units

| Unit | Which self she is | The one question she asks |
| --- | --- | --- |
| Maiden · Gold | nothing done yet | **can** this work at all? |
| Matron · Frankincense | mid-career | can it **be done** — and who pays? |
| Crone · Myrrh | too much done already | what is left **in thirty years**? |

Only one of the three gifts was for the living; the other two are burned at funerals. So the unit that speaks for **the people still alive is structurally the minority**.

Each unit also carries a **self-check** that can flip her own approval into a rejection. The Crone's: *"shrink the time horizon to one generation — does this judgment still hold?"*

## Install

Requires DSH (`@deepseek-ai/dsh`) `0.2.0-rc.2` (declared in `peerDependencies`) and Node.js >= 20.

### Option A: local mount (recommended)

Copy this directory into your profile and add to the profile's `cordis.patch.yml`:

```yaml
- insert:
    - id: tri-sages
      name: ./tri-sages/index.mjs
      config:
        llmMode: live
```

### Option B: as a package

```bash
dsh plugin --profile <name> add <path-to-this-dir>
```

Two entry points once installed:

| Input | What it does |
|---|---|
| `/sages should we drop the old table` | run a vote (tier auto-detected; a keyword hit escalates it to critical) |
| `/sages critical should we do it now` | force the critical tier: all three must agree, any rejection vetoes |
| `/sages normal what should I have for lunch` | force the daily tier: majority |
| `/sages history` | read the ledger (last 10) |
| `/sages ts-000001` | retrieve one full record, including all three raw opinions |
| `/sages personas` | show the personas currently in force |
| `/sages help` | usage |

> If the `/` menu does not list it, **type the full string** — like `/permission` or `/cache-report`, the command is registered.

Tools for the model:

| Tool | Purpose |
|---|---|
| `sages_vote(question, context?, criticality?, label?)` | run a vote; returns tallies, verdict, all three raw opinions, ledger id |
| `sages_history(limit?, key?)` | read the ledger; `key` accepts an id (`ts-000003`) or a label |
| `sages_personas(action?, unit?)` | show the active personas (sha256 / size); `action:"text"` dumps one in full |

Verdicts are only ever `APPROVED` / `REJECTED` / `VETO`. If all three units fail to answer, it is `ERROR` — **no verdict is fabricated**.

> ⚠️ **Code changes need a restart; persona and contract changes do not.** The loader's live reload re-runs `apply` but does not hot-swap ESM modules. That is why every ledger record carries `pluginVersion` and every report prints `engine: tri-sages vX.Y.Z` — so you can tell **which version actually ran**.

## Example output

> Taken from the **real ledger** (`ts-000001`). Unit reasons are quoted verbatim in Chinese — the personas are Chinese-language. This record predates the engine stamp (added in v0.2.0), hence no `engine:` line.

```
$ /sages critical 从今以后，AI 助手在做不可逆的大改动之前（删文件、改 profile 配置、
                  装卸插件、批量改写），是否必须先跑一次三贤人表决？

三贤人 · ts-000001 · 2026-10-16 15:07:45
档位：重大（命中敏感词：不可逆）
结果：否決 VETO · 0:3（未获一致）

① 少女 · 黄金   反对   conf 0.72
     理由：这条路我没见过走通。不可逆没有清单，谁能触发没写，卡住超时怎么办没写，
           靠自觉的规矩会滑成两种：天天跑，或没人跑。否决权是单向的——一台模型的
           犹豫就能停一次回滚；三台又是同一套模型，错会一起错，三份判断换不来三份证据。
     可推翻：出现已定义的不可逆清单、超时默认放行机制，并有真实拦下一次误操作的记录，我就改判。
     保留：我愿意相信流程能约束人，这是希望不是证据，按自查改为反对。
② 成女 · 乳香   反对   conf 0.68
     理由：闸门的触发条件由被判断者自己认定……真正挡住不可逆损害的是备份、回收站、
           回退路径，这些机器查得到，模型的自评查不到。
     保留：把触发条件换成外部固定清单（无备份的删除、凭据与 profile 写入、装卸插件），
           并强制动手前写下回退路径与备份点，我改判赞成。
③ 熟女 · 没药   反对   conf 0.63
     理由：判断者与被判断者同源，这一票给不出新信息，只给出一份可以引用的合法性。
           「写不出推翻条件就反对」这条纪律值得留，它不必以表决为形。

降档：最年长的那一台拒签 → 否决维持
     她的原话：0 比 3 不是僵局，是一致。我签字改的是规则本身：今天为「让它走完」
               降一次档，明天任何被否决的事都能再拿来问我一遍。那道闸门回不去。
模型：deepseek-v4.1-flash（会话默认）
用时：49.8s
```

**The system's very first vote was to veto itself.** And the three reasons differ: the Maiden says *"I have never seen this road walked"*, the Matron says *"what actually stops irreversible damage is a backup, not another round of thinking"*, the Crone says *"judgments from the same source produce no new information, only a citable legitimacy."*

## How to read a verdict

**A tally is not a probability, and unanimity is not correctness.** The places people misread:

| Trap | What it means |
|---|---|
| **One run is not a conclusion** | Byte-identical inputs have produced different tallies (2:1 once, 3:0 the next). Re-run before treating a result as a judgment |
| **3:0 does not mean "correct"** | It only means the three selves found no disagreement *along these three axes*. All three axes lean conservative, so unanimity can be a **collective blind spot** |
| **`confidence` is not calibrated** | It is the unit's own number, uncalibrated; the same unit on the same question drifts between 0.56 and 0.86 |
| **Watch the ⚠ at the top** | When a unit does not answer, its vote is a **system-cast** rejection, not its judgment (the ledger keeps that unit's raw output) |
| **Read who signed the downgrade** | A deadlock becomes a majority only because the **eldest** signed it; her reason is usually worth more than the verdict |

### Three rules that actually help

1. **Read the dissent, not the tally.** Unanimity tells you little; the **minority reason** is the real output of this system.
2. **Use `critical` only for matters that deserve it.** It demands unanimity and any rejection vetoes; on daily matters it just produces `VETO` after `VETO`.
3. **Read the caveats.** That is where each unit keeps the part she does not quite believe — the `caveats` field is usually closer to the truth than the `reason`.

## Data and privacy

**What leaves the machine on a vote**: three system prompts (persona + shared contract) plus one shared "question + context". **No session history, no tool definitions, no file contents** — `ctx.llm.stream` is a one-shot call.

**The units have no hands**: they cannot read or write files, run commands, or call any tool. All they can do is speak.

**The ledger**: local JSONL at `<DSH_HOME>/tri-sages/ledger.jsonl`, **append-only, never overwritten**. It holds the question, all three raw opinions, the dissent, the sha256 of each persona and the contract, and the engine version.

**What it does not do**: it does not upload the ledger, contact any third-party service, or read your session logs. Apart from that one model call, it does not touch the network.

> ⚠️ **The question goes into the model call** — do not paste secrets or credentials into it.

## Project layout

| Path | Contents |
|---|---|
| `index.mjs` / `command.mjs` | plugin entry (the three tools) and the slash-command entry |
| `lib/` | tally, persona loading, prompt assembly, model bridge, output parsing, ledger, rendering, offline stub, module resolution |
| `personas/` | the three personas + the shared output contract (external Markdown, read on every vote) |
| `test/` | 54 tests, including the mount test through the host's real tool API |
| `tools/` | patch validation, model probe |
| `refs/` | experiment material: answer key, measurement report, redacted ledger |

## Limitations (honestly)

- **The three units share one set of weights.** "Independent" means independent *personas*, not independent parameters. This is the project's most important limitation, and the next step is to train one adapter per self.
- **A single run is not a conclusion.** Byte-identical inputs have produced different tallies; re-run before treating a result as a judgment.
- **The instrument drifts.** The same `provider/model` name can be served by a different backend. In testing, the output-contract violation rate went from 2% to 33% and latency collapsed from 46–92 s to 17–22 s, which invalidated an entire round. **Before any cross-time comparison, verify the model is still the same one.**
- **Failures are handled conservatively.** When a unit does not answer, its vote is recorded as a rejection (safety first). The report says so at the top (`⚠ answered: N/3`).
- **This is not legal or medical advice.** The Speluncean case is a **measuring instrument** here, not something to be judged correctly.
- **The measurements are a small sample.** Six propositions × three rounds plus repeats — not enough to claim statistical stability of any kind.

## Uninstall

```bash
dsh plugin --profile <name> remove tri-sages
```

For a local mount, delete the `insert` entry from the profile's `cordis.patch.yml`.
**The ledger is not deleted** — see the `ledgerDir` setting (default `<DSH_HOME>/tri-sages/`).

## Development

```bash
npm run test:offline   # 46 tests, no DSH host required (this is what CI runs)
npm test               # 54 tests; the extra 8 mount the plugin through the host's real tool API
node tools/probe-model.mjs   # controlled probe: bypass the plugin, call the provider directly,
                             # and check whether the model still honours the output contract
```

`test/plugin.test.mjs` is the first line of defence: it proves the plugin **actually mounts**, including resolving `@deepseek-ai/dsh-tools` from the DSH installation — the step local plugins most often die on.

See [CHANGELOG.md](CHANGELOG.md) for what changed; see [refs/](refs/README.md) for the experiment material.

## License

MIT
