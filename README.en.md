# Tri-Sages (三贤人)

**Three selves judge the same question independently — blind to one another, and they must take sides.**

A DeepSeek Harness plugin for decisions you cannot take back.

| Unit | Which self | The one question she asks |
| --- | --- | --- |
| Maiden · Gold | nothing done yet | **can** this work at all? |
| Matron · Frankincense | mid-career | can it **be done** — and who pays? |
| Crone · Myrrh | too much done already | what is left **in thirty years**? |

Only one of the three gifts was for the living; the other two are burned at funerals. So the unit that speaks for the people still alive is **structurally the minority**.

## The rules (four, no more)

1. **Take a side. No abstention.** If the matter falls outside your domain, still judge — and put your uncertainty in `caveats`.
2. **Approval carries the burden of proof.** An approving vote must state *what observation would refute it*. If it cannot, the vote is **recorded as a rejection**.
3. **Daily matters: majority. Critical matters: unanimity** — any single rejection vetoes.
4. **Deadlock downgrade.** When a critical matter fails unanimity, only the eldest is asked once more; she may sign it into a majority vote. *Every failure to agree moves power one notch toward the eldest.*
5. **Dissent is archived.** Votes that ran against the final outcome keep their reasons verbatim — never summarized, never overwritten.

Each unit also carries a **self-check** that can flip her own approval into a rejection. The Crone's, for instance: *"shrink the time horizon to one generation — does my judgment still hold?"*

## Tools

| Tool | Purpose |
| --- | --- |
| `sages_vote(question, context?, criticality?, label?)` | run a vote; returns tallies, verdict, all three raw opinions, ledger id |
| `sages_history(limit?, key?)` | read the ledger; `key` accepts an id (`ts-000003`) or a label |
| `sages_personas(action?, unit?)` | show the active personas (sha256 / size), or dump one in full |

Verdicts: `APPROVED` / `REJECTED` / `VETO`. If all three units fail to answer, the vote is `ERROR` — **no verdict is fabricated**.

## Personas are external files, read on every vote

```
personas/maiden.md     Maiden · Gold
personas/matron.md     Matron · Frankincense
personas/crone.md      Crone · Myrrh
personas/contract.md   the shared output contract
```

Edit a file and the **next vote** uses it — no restart. Every vote records the sha256 of all four.

## Install

Local mount (how this repo was developed): copy the directory into your profile and add to the profile's `cordis.patch.yml`:

```yaml
- insert:
    - id: tri-sages
      name: ./tri-sages/index.mjs
      config:
        llmMode: live
```

Or as a package: `dsh plugin --profile <name> add <path-to-this-dir>`.

> **Code changes need a restart; persona and contract changes do not.** The loader's live reload re-runs `apply` but does not hot-swap ESM modules. That is why every ledger record carries `pluginVersion` and every report prints `engine: tri-sages vX.Y.Z` — so you can tell which version actually ran.

## Config

| Field | Default | Notes |
| --- | --- | --- |
| `provider` / `model` | `''` | empty = use the session default model |
| `personasDir` | `''` | empty = the bundled `personas/` |
| `ledgerDir` | `''` | empty = `<DSH_HOME>/tri-sages` |
| `historyLimit` | `50` | |
| `criticalKeywords` | built-in list | a hit escalates the matter to `critical` |
| `timeoutMs` / `maxTokens` / `temperature` | `120000` / `2200` / `0.7` | |
| `llmMode` | `live` | `stub` = offline, deterministic, free |
| `stubPreset` | `split` | `split` / `unanimous` / `downgrade` / `no-falsifier` |

## Tests

```bash
npm run test:offline   # 46 tests, no DSH host required
npm test               # 54 tests; the extra 8 mount the plugin with the real host tool API
```

`test/plugin.test.mjs` is the first line of defence: it proves the plugin **actually mounts**, including resolving `@deepseek-ai/dsh-tools` from the DSH installation — the step local plugins most often die on.

## What is in `refs/`

Experiment material, not plugin code: a verified answer key for *The Case of the Speluncean Explorers* (Fuller 1949 + Suber 1998), the measurement report, and a redacted copy of the ledger. See [refs/README.md](refs/README.md).

## Known caveats

- **The three units share one model.** "Independent" means independent *personas*, not independent weights. This is the single most important limitation, and the next step is to train one adapter per self.
- **A single run is not a conclusion.** Byte-identical prompts have produced different tallies. Re-run before treating a result as a judgment.
- **The instrument drifts.** The same `provider/model` name can be served by a different backend; verify the model before any cross-time comparison.
- Failed units are recorded as rejections by default. The report says so at the top (`⚠ answered: N/3`) and the ledger keeps their raw output.

MIT
