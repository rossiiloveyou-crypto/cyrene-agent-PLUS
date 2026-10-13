<h1 align="center">cyrene-agent-PLUS</h1>

<p align="center">
  <strong>本分支相对上游 <a href="https://github.com/Playa-0v0/Cyrene-Agent">Cyrene-Agent</a> 的全部改动清单</strong>
</p>

<p align="center">
  版本：<code>1.3.0-PLUS</code>（基线 = 上游 <code>1.3.0</code>，merge commit <code>9cceeeac</code>）
</p>

---

> **本文档的目的**：本分支是**个人 fork**。上游那份 README（安装、配置、功能总览、许可证、致谢）**原样保留、未作改写**；
> 本文档只回答一个问题 —— **「这个 fork 比上游多了什么」**。
>
> 📌 **原项目的下载、完整文档、问答与 Issue 请一律去上游**：<https://github.com/Playa-0v0/Cyrene-Agent>
> 本分支**不代表上游立场**、**不承诺跟进上游后续版本**、**未获得作者背书**。

---

## 一、一句话概括

本分支在**跟随上游**的前提下，补上了一组上游没有的**「记忆按域隔离」与「渠道按账号授权」**能力：

> **群聊的记忆不进桌面、桌面的画像不进群；群里谁能用工具、谁能看到什么，按账号逐个授权；记忆可以按人彻底擦除。**

本分支的取舍原则（人拍板）：**「我的功能不能发生功能性变化和缺失，其余方面跟随官方或者审计」**
⇒ 因此本分支会**合并上游的全部更新**，同时**保护本地自建能力不被上游的删除静默带走**。

---

## 二、本分支新增的功能

### 2.1 三项主体能力

| # | 能力 | 解决什么问题 |
|---|---|---|
| 1 | **记忆按区块隔离（Zones）** | 外部会话（QQ 群 / 私聊）默认落在**独立记忆域**，不会把你桌面私聊的记忆带进陌生群。归入同一区块的会话**共享记忆**，未归区的会话**各自独立**。另有开关控制「是否向该域注入你的画像（L0/L1）」。 |
| 2 | **按人彻底擦除（person-erasure）** | 可以按**身份**（而非按会话）精确删除某个人的记忆与归属痕迹，带**预览 → 确认**两段式流程。 |
| 3 | **渠道按账号授权（tool-access / 渠道权限）** | 渠道与群里的工具调用**按账号授权**：谁能用哪些工具、群成员是否放行，逐个配置，而不是全渠道一刀切。 |

### 2.2 群聊相关

| # | 能力 | 说明 |
|---|---|---|
| 4 | **群语料累积（group-corpus）** | 群消息持续入库，成为可回溯的群上下文。 |
| 5 | **群聊旁听上下文（`buildGroupContextBlock`）** | 你 @ 她之前，群里聊了什么她能理解 —— 取**旁听消息**（未叫她时群友的发言）注入上下文。 |
| 6 | **群上下文上限（`groupContextLimit`）** | 可调条数（默认 **10**，范围 **3–50**）。 |

### 2.3 记忆与运维界面

| # | 能力 | 说明 |
|---|---|---|
| 7 | **记忆管理控制台（memory-console）** | 在设置页「记忆」里查看 / 查询 / 删除记忆条目、按人擦除、调群上下文上限。 |
| 8 | **区块设置面板（ZONES_）** | 管理记忆域、把外部会话（群 / 私聊）拖进区块、配置各域的画像注入与旁听开关。 |
| 9 | **关键词策略（keyword-policy）** | 渠道 / 群相关的关键词分区配置。 |
| 10 | **用量徽章（USAGE_BADGE）** | 聊天页导航栏展示对话用量徽章。 |
| 11 | **渠道审计（audit-log）** | 渠道与工具调用的审计视图。 |
| 12 | **删除强确认门（`confirmValue`）** | 删除全部记忆一类的高危操作需**输入确认短语**（比旧壳的普通弹窗更强）。 |

> 📌 上表 1–12 与上游的差异是**"多出来的能力"**，不是"改了上游的行为"。上游原有的功能、界面与工具**一律保持**。

---

## 三、怎么安装

**前置与上游相同**（Node 24 / pnpm 10），本文档不重复，只写本分支的差异点。

### 3.1 克隆与依赖

```bash
git clone https://github.com/rossiiloveyou-crypto/cyrene-agent-PLUS.git
cd cyrene-agent-PLUS
pnpm install --frozen-lockfile      # 锁文件已入库，直接用
```

### 3.2 构建并启动

```bash
pnpm run build                      # = check:main → check:preload → build:main → build:preload → build:cli → build:renderer
pnpm start                          # = electron .
```

> ⚠️ **先 `build` 再 `start`**：`pnpm start` 加载的是 `dist/` 里的**构建产物**，不是源码。
> 只跑 `pnpm start` 会启动上一次的旧产物。

### 3.3 🔴 BGE-M3 Embedding 模型（**本分支与上游的重要差异**）

上游 README 让你「前往 Releases 下载 BGE-M3」。**本分支必须手动装**，因为它直接决定
**记忆召回 / 文档检索 / 贴纸语义匹配**能不能用 —— 缺了它，记忆会**静默降级**（详见 §四）。

**模型放这里**（三个候选目录，任选其一，推荐第一个）：

```text
<仓库根>/models/Xenova/bge-m3/
  ├── config.json
  ├── tokenizer.json
  ├── tokenizer_config.json
  ├── special_tokens_map.json
  ├── sentencepiece.bpe.model
  ├── quantize_config.json
  └── onnx/model_quantized.onnx      ← 约 543 MB，必需
```

> 三个候选目录（代码实测的搜索顺序，见 `src/main/rag/model-status.ts`）：
> ① `<仓库根>/models`（可用环境变量 `CYRENE_MODELS_DIR` 覆盖）
> ② `<electron 可执行体目录>/models`
> ③ `<app 目录>/models`
> 另外也支持 HF 缓存布局 `~/.cache/huggingface/Xenova/bge-m3/`。
>
> ⚠️ `models/` 在 `.gitignore` 里被整体忽略（模型**永不入库**），所以你必须自己放。

**下载（国内网络注意）**：

```bash
# 🔴 实测：huggingface.co 在国内常不通（连接超时），hf-mirror.com 可用
BASE=https://hf-mirror.com/Xenova/bge-m3/resolve/main
DEST=models/Xenova/bge-m3
mkdir -p "$DEST/onnx"
for f in config.json tokenizer.json tokenizer_config.json special_tokens_map.json \
         sentencepiece.bpe.model quantize_config.json onnx/model_quantized.onnx; do
  curl -sSL --retry 3 -C - -o "$DEST/$f" "$BASE/$f"
done
# 核对三个必需文件（缺任一 = 视为未安装）
ls -la "$DEST/tokenizer.json" "$DEST/config.json" "$DEST/onnx/model_quantized.onnx"
```

**装好后怎么确认它真的生效**：启动应用后日志里应出现

```text
[RAG] switched embedding model to bgem3 dims: 1024 cleared: 0
```

而**不该**出现：

```text
[Cyrene] embedding model "bgem3" not detected anywhere.
[Memory/RAG] reconciliation skipped: vector store is not writable
[PMRS/Manager] L2 已写入，但 RAG 同步失败: Error: RAG not initialized
```

> 💡 在设置页 **昔涟设置 → 本地检索** 里也能看到 `BGE-M3 · 已安装 / 未安装` 的状态徽标。
> 📌 **已知欠缺**：本分支**还没有**"一键安装 BGE-M3"的按钮（点该徽标只会尝试切换模型，不会下载）。当前只能按上面的步骤手工装。
> 这是本分支**已知的待办**，不是上游的缺陷。

### 3.4 版本号与「关于」里的头衔

本分支版本为 `1.3.0-PLUS`（`package.json` 的 `version`）。

上游给 `1.3.0` 配了一个版本头衔「正式版」（`src/renderer/react/features/settings/app-update-view.ts` 的 `VERSION_TITLE_KEYS`，按**精确版本号**匹配）。
本分支**没有**沿用上游那个头衔 —— 否则 `1.3.0-PLUS` 会在「关于」里显示成上游的「**正式版**」，容易被误读成官方发布。

⇒ 本分支为 `1.3.0-PLUS` **单独加了一个头衔「个人分支 PLUS」**（i18n 键 `ui.version.forkPlus`，`zh-CN` / `en` / `ja-JP` 三处同步），
上游原有的 `"1.3.0": "ui.version.firstStable"` 映射**原样保留、未改动**。

---

## 四、一个必须知道的坑：模型缺失会**静默降级**

这是本分支实测发现、并写进经验库的一条重要教训（键号 `E13` + 判据 `J-27`）：

> **`tsc` 全绿 + 全部单测通过 + `pnpm run build` 成功 `exit=0`，仍然可能"向量检索整条不可用"。**

模型缺失时**不会**产生编译错误、**不会**让任何测试变红，只会让依赖 embedding 的能力静默关闭或降级，
并且**让你无法判断"记忆没召回"是因为隔离生效、还是因为压根没东西可召回**。

⇒ **因此：装完模型后，请务必按 §3.3 的日志核对确认它生效**，再判断记忆相关功能是否正常。

---

## 五、怎么验证本分支的能力（不依赖上游的测试）

上游的测试覆盖不到本地自建功能的失效方式（例如"能力在、入口没了"**不会**让任何测试变红）。
本分支的验证要**同时看机器判据和人眼判据**：

1. **设置页逐个打开**：通用 / 外观 / 偏好 / 模型 / 用量 / **浏览器控制** / **区块** / **知识库** / **子代理** / **记忆**
2. **记忆域隔离**（本分支的核心）：在**桌面私聊**里告诉她一件只属于你的事 → 去**群里 @ 她**问同一件事 → **她应当答不出**
3. **按人擦除**：记忆面板里的擦除流程（预览 → 确认）
4. **删全部记忆的强确认**：必须输入确认短语才放行
5. **渠道按账号授权**：工具控制台里逐个账号配置

> 📌 若要复现完整的施工与验收证据，见仓库内 `docs/construction/HEB-1.3.0/`：
> 总蓝图、各 Phase 蓝图与完成报告、`HUMAN-人工验证台账.md`（人工判据的唯一真值）、以及方法论与经验库。

---

## 六、与上游的关系（**保留不变的部分**）

以下内容**完全沿用上游**，本分支不做改动：

- 项目定位、角色、四种对话模式（Chat / Work / Code / Learn）
- `CyreneHarness` 引擎、`DMAE` 记忆引擎、`Worldbook`
- 语音（TTS / ASR / 语音通话）、音乐、Live2D 桌面陪伴与主题外观
- 工具生态、MCP、插件系统、Skill 系统、主动聊天
- 多平台接入框架（飞书 / 微信 iLink / QQ）
- 安装、配置、API Key 配置流程
- 许可证、致谢、免责声明

**本分支的唯一增量 = §二 那 12 项**，以及为保护它们不被上游删除而做的冲突处置。

---

## 七、反馈

| 问题类型 | 去哪里 |
|---|---|
| **本分支**的多出来的功能有 bug / 建议 | **本仓库**开 Issue |
| 上游本身的功能、安装包、文档、Bug | **[上游仓库](https://github.com/Playa-0v0/Cyrene-Agent)** |

---

<p align="center">
  <sub>本分支基于 <a href="https://github.com/Playa-0v0/Cyrene-Agent">Cyrene-Agent</a>（作者 <a href="https://github.com/Playa-0v0">Playa-0v0</a>）· 原项目版权与许可证见 <a href="./LICENSE">LICENSE</a></sub>
</p>
