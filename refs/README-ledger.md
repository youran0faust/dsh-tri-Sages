# 关于 ledger-redacted.jsonl

这是原始账本的**脱敏副本**，逐行一条表决记录（JSONL）。

## 被脱敏的地方（只有三处）

1. **一条与本项目无关的私人提问记录**：`question` 改为占位说明，三台的理由与原始返回全部置空。
   它的标签是 `/sages`（即通过斜杠命令发起的那一次）。
2. **provider 别名**：所有记录的 `model.provider` 改为 `（略）`（模型 id 保留）。
3. **称呼与路径**：本仓库全仓把私人称呼改为「AI 助手」，绝对路径改为 `<DSH_HOME>` 等占位符。

## 没有被改动的地方

- 每一次表决的**议题、档位、票数、判决、三台各自的立场与理由、异议、耗时**——原样保留。
- v0.2.0 之后失败的单元，其**原始返回（raw）**也原样保留（这正是当初修好"失败无法诊断"的证据）。

## 字段速查

| 字段 | 含义 |
| --- | --- |
| `id` / `seq` | 账本序号。**早期版本存在一次主键撞号（两条 `ts-000002`）**，那是一次真实缺陷，已在 v0.2.1 修复并补了回归测试；历史记录不重写，原样保留。 |
| `question` / `context` | 议题与背景（`context` 未入账，只有议题） |
| `criticality` / `criticalitySource` / `matchedKeywords` | 档位（日常／重大）、档位来源（显式／敏感词／默认）、命中的敏感词 |
| `result` / `rule` / `approvals` / `rejects` | 判决（APPROVED／REJECTED／VETO／ERROR）、依据的计票规则、票数 |
| `override` | 僵局降档：最年长那一台是否被再问一次、签没签、理由 |
| `dissents` | 与最终结果相反的票（异议存档） |
| `seats[]` | 三台各自的一票：`stance`／`verdict`（reason/basis/cost/falsifier/caveats/confidence）／`failed`／`downgraded`／`raw` |
| `personas` / `pluginVersion` | 人格与契约的哈希、引擎版本（用来确认"跑起来的到底是哪一版"） |
