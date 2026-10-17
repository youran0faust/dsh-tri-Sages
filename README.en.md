# Tri-Sages · 三贤人

[![license](https://img.shields.io/badge/license-MIT-brightgreen)](LICENSE) [![version](https://img.shields.io/badge/version-v0.1.0-blue)](https://github.com/youran0faust/dsh-tri-Sages/releases/tag/v0.1.0) [![DSH](https://img.shields.io/badge/DSH-0.2.0--rc.2-4B6BFB)](.) [![platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-0078D6)](.) [![tests](https://img.shields.io/badge/tests-54%20green-3FB950)](.)

> **One decision you dare not make alone, in — three mutually blind verdicts that must take sides, out.**

Tri-Sages turns "a decision you dare not make alone" into **three verdicts that refuse to agree**: three persona units judge independently and blind to one another, **must take a side**, and an approving vote must state *what observation would refute it*. Votes are then tallied by rule, and every reason — including every dissent — is kept **verbatim**. It is a DeepSeek Harness (DSH) plugin, with 54 automated tests and a controlled case study on *The Case of the Speluncean Explorers*.

> [中文](README.md) | English · MIT

## What it solves

Ask a large model to help you decide and it fails in two structural ways — and both failures land hardest on decisions you cannot take back. It **fudges** (a flawless two-sided answer that leaves you exactly where you were), or it becomes a **wishing machine** (it tells you what you want to hear). More fundamentally, **a single model's judgment cannot vouch for itself**: ask the same question twice and you may get two answers, with no signal that anything changed.

Tri-Sages answers by writing the discipline into the mechanism rather than into the goodwill of a prompt:

| Pain | What Tri-Sages does |
|---|---|
| Fudging: you read it and stay put | **Take a side** — the verdict is approve or reject, with **no abstention**; if the matter falls outside your domain, still judge, and put your uncertainty in the caveats |
| Wishing machine: it tells you what you want | **Approval carries the burden of proof** — an approving vote must state *what observation would refute it*; without that, the system **records it as a rejection** |
| A single judgment cannot vouch for itself | **Unanimity plus a self-reported engine** — critical matters need all three, any rejection vetoes; every record carries the engine version and persona hashes |
| The conclusion is not auditable | **Dissent archived verbatim** — minority reasons are stored as written, never summarized, never overwritten |
| A deadlock stalls with nobody accountable | **A downgrade must be signed** — only the eldest is asked once more, and only she can sign it into a majority; power moves and it leaves a name |
| The persona is a black box | **Personas and contract are external Markdown** — read on every vote, so an edit takes effect on the next vote, no restart |

## The three units

| Unit | Which self she is | The one question she asks |
| --- | --- | --- |
| Maiden · Gold | nothing done yet | **can** this work at all? |
| Matron · Frankincense | mid-career | can it **be done** — and who pays? |
| Crone · Myrrh | too much done already | what is left **in thirty years**? |

Only one of the three gifts was for the living; the other two are burned at funerals. So the unit that speaks for **the people still alive is structurally the minority**.

Each unit also carries a **self-check** that can flip her own approval into a rejection. The Crone's, for instance: *"shrink the time horizon to one generation — does this judgment still hold?"*

## Quick start

Requires DSH `0.2.0-rc.2` (declared in `peerDependencies`).

**A. Local mount** — copy this directory into your profile and add to the profile's `cordis.patch.yml`:

```yaml
- insert:
    - id: tri-sages
      name: ./tri-sages/index.mjs
      config:
        llmMode: live
```

**B. As a package**: `dsh plugin --profile <name> add <path-to-this-dir>`

Two entry points once installed:

- **Slash command (for humans)**: `/sages should we drop the old table` ｜ `/sages critical …` ｜ `/sages history` ｜ `/sages personas` ｜ `/sages help`
- **Tools (for the model)**: `sages_vote(question, context?, criticality?, label?)` ｜ `sages_history(limit?, key?)` ｜ `sages_personas(action?, unit?)`

> ⚠️ **Code changes need a restart; persona and contract changes do not.** The loader's live reload re-runs `apply` but does not hot-swap ESM modules. That is why every ledger record carries `pluginVersion` and every report prints `engine: tri-sages vX.Y.Z` — so you can tell **which version actually ran**.

## Project layout

| Path | Contents |
|---|---|
| `index.mjs` / `command.mjs` | plugin entry (the three tools) and the slash-command entry |
| `lib/` | tally, persona loading, prompt assembly, model bridge, output parsing, ledger, rendering, offline stub, module resolution |
| `personas/` | the three personas + the shared output contract (external Markdown, read on every vote) |
| `test/` | 54 tests, including the mount test through the host's real tool API |
| `tools/` | patch validation, model probe |
| `refs/` | experiment material: answer key, measurement report, redacted ledger |
## Reliability and measurements

- **54 automated tests green** (`npm test`). 46 of them need no DSH host and run in CI via `npm run test:offline`; the remaining 8 are `test/plugin.test.mjs` — the step local plugins most often die on: it mounts the plugin through the host's **real tool-definition API** and actually calls all three tools.
- **Offline stub** (`llmMode: stub` — no network, no cost) deterministically reproduces all four rule paths: majority, unanimity, **deadlock refused**, **deadlock downgraded**, and **the burden of proof turning an approval into a rejection** (3:0 becomes 2:1).
- **Change discipline**: snapshot and rollback backup before every change; pilot then full run; reports and the raw ledger kept in separate layers.
- **Measurements**: *The Case of the Speluncean Explorers* (Fuller 1949 + Suber 1998) was used as a measuring instrument across several rounds on the same six propositions, cross-checked against **14 human judicial positions** (6 convict : 6 acquit : 2 withdraw). The verdicts held, and the system proved **structurally conservative** — traceable to the choice of its three axes, which in turn surfaced and fixed two real defects. See [refs/](refs/README.md).

## Limitations (honest notes)

- **The three units share one set of weights.** "Independent" means independent *personas*, not independent parameters. This is the project's most important limitation, and the next step is to train one adapter per self.
- **A single run is not a conclusion.** Byte-identical inputs have produced different tallies; re-run before treating a result as a judgment.
- **The instrument drifts.** The same `provider/model` name can be served by a different backend. In testing, the output-contract violation rate went from 2% to 33% and latency collapsed from 46–92 s to 17–22 s, which invalidated an entire round. **Before any cross-time comparison, verify the model is still the same one.**
- **Failures are handled conservatively.** When a unit does not answer, its vote is recorded as a rejection (safety first). The report says so at the top (`⚠ answered: N/3`) and the ledger keeps that unit's raw output.
- **This is not legal or medical advice.** The Speluncean case is a **measuring instrument** here, not something to be judged correctly.

## Docs

- [refs/ — experiment material](refs/README.md): answer key, measurement report, redacted ledger
- [CHANGELOG.md](CHANGELOG.md): what changed from v0.1.0 to v0.2.1, and why
- [personas/](personas/): the three personas and the shared output contract (edit them freely)

## License

[MIT](LICENSE)
