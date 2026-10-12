# 摘要记忆模式 Implementation Plan（实施方案）

> **For agentic workers（实施者）：** 按下列任务逐项实施；如使用 superpowers 工作流，可选 `superpowers:executing-plans`。本方案只记录实施步骤，尚未修改运行代码。

**Goal（目标）：** 在现有“向量 / 关闭”之间加入独立的“摘要”记忆模式，用短 Markdown（轻量标记文本）文件维持会话与工作区记忆，不依赖向量模型。

**Architecture（结构）：** 主进程按可信工作区绑定和会话 ID（标识符）解析文件路径；每 10 个完整对话轮次异步整理新内容。每段会话固定的实际文件路径与使用规则进入稳定提示词，文件正文进入现有运行时可变区。模型沿用已有文件工具；Chat（聊天）模式只读，文件由后台维护。

**Tech Stack（现有能力）：** Electron（桌面应用框架）主进程、TypeScript（类型脚本）、现有会话轨迹与工作区绑定、`memory-llm-client`（记忆模型调用层）、`read_file` / `write_file`（文件工具）。不新增通用文件库或专用记忆工具。

**Spec（已定需求）：** 本文件下方“确定的行为”一节。

## 确定的行为

1. 模式为 `vector`（向量）、`summary`（摘要）、`off`（关闭）。摘要模式不启动嵌入、重排序、向量索引或既有 L0/L1/L2 自动维护；既有向量数据保留，切回向量模式仍可使用。世界书维持现有独立行为。
2. 每个会话累计 **10 个完整的用户发言＋助手成功回复**后，后台整理一次；工具调用、失败和取消不计轮次。切换或关闭会话时，如有未整理轮次，补一次整理。工作区文件在每次整理时检查，但没有新的跨会话事实就不改写。
3. 当前会话文件上限 **800 个 Unicode（统一码）字符**，工作区文件上限 **1,200 个 Unicode 字符**；计数包括 Markdown 标记、空白和标点，换行先统一为 `\n`。这是上限，不要求写满。
4. 有可信工作区绑定时，文件放在 `<workspaceRoot>/.cyrene/memory/workspace.md` 与 `<workspaceRoot>/.cyrene/memory/sessions/<sessionKey>.md`。`sessionKey` 是会话 ID 的确定性散列，避免路径穿越和 Windows 非法文件名。Chat 模式只维护 `<userData>/summary-memory/sessions/<sessionKey>.md`，不创建工作区文件；这里使用持久的应用用户数据目录，避免临时缓存清理丢失摘要。
5. 程序选择当前会话文件后，把该会话的**实际绝对路径**和可用的工作区摘要绝对路径放在稳定提示词中；它们在本会话内不变，工作区重新绑定时才改变。文件**正文**放在固定顺序的运行时可变区：工作区摘要（存在时）在前，会话摘要在后。Chat 模式只有会话摘要。每轮从磁盘读取，外部编辑下轮生效；内容未变化时不重写文件。
6. 不新增面向模型的记忆工具。工作、代码、学习模式收到用户“更新记忆”的要求时，模型先用现有 `read_file` 读文件最新内容，再用现有 `write_file` 或局部编辑工具修改稳定提示词给出的路径。Chat 模式不向模型提供写入摘要的能力；用户在 Chat 中提出更新要求也不提前触发文件写入，仍按下一次静默整理处理。
7. 摘要模式不把其他会话文件全文自动注入提示词；有工作区的模式可沿用现有文件工具按需读取其他会话文件。摘要模式不把 L2 事件片段展示为摘要，也不把旧向量数据迁移成摘要。模式为摘要或关闭时，L2 区域继续隐藏。

## 复用与边界

- 复用 `memory-llm-client` 的已配置模型调用、结构化输出和用量记录；现有 `memory-compressor` 会写向量索引，不直接拿来维护 Markdown 文件。
- 复用可信 `workspaceBinding.workspaceRoot`、会话轨迹和文件工具；只新增“路径解析、摘要读写、增量整理”的业务适配。
- 项目内 `.cyrene/memory/` 会显示为工作区文件。本期不自动改动项目的 `.gitignore`（Git 忽略配置），是否纳入版本控制由用户管理；删除会话时清理该会话摘要，保留工作区摘要。

## Global Constraints（全局约束）

- 保存设置后即时切换模式；后台任务在模式改变或会话删除后不得继续写旧目标。
- 后台整理失败不得阻断聊天；保留旧文件和未处理进度，后续重试。
- 后台整理输出必须核对事实、保留重要决定和未完事项；工作区文件只收纳跨会话信息。
- 外部或模型用通用文件工具写入超长文件时，提示词注入仍按 800/1,200 字符上限截取并明确标记；下次静默整理将其压回上限。专用后台写入必须先通过长度校验，再原子替换文件。

## Review Focus（实施时重点检查）

1. 工作区路径、会话 ID 包含 `..`、分隔符或 Windows 非法字符时，不能越出预定目录。
2. 同一工作区的两个会话同时整理时，不丢失对方刚写入的工作区事实。
3. 切换模式、删除会话、取消运行后，排队中的旧摘要任务不能落盘。
4. 超长或格式错误的模型输出不得覆盖旧文件，也不得推进整理进度。
5. Chat 模式不能因提示词给出了路径而获得 `write_file`。

---

### Task 1：模式配置与运行时隔离

**Files:** `src/main/memory/memory-mode.ts`、`src/main/settings/model-settings.ts`、`src/main/settings/settings-ipc.ts`、`src/main/application/default-dependencies.ts`、`src/main/orchestrator/tools/registry/tool-registry.ts`、`src/main/orchestrator/tools/history-tools.ts`；对应主进程测试文件。

**Interfaces:** `MemoryMode = "vector" | "summary" | "off"`；新增 `isVectorMemoryEnabled()` 与 `isSummaryMemoryEnabled()`，保留既有向量链路只在 `vector` 时执行。

- [ ] 覆盖三态配置持久化、启动恢复、热切换以及向量工具列表的行为：摘要/关闭模式不向模型暴露 `user_memory`、`read_memory`、`write_memory`、`recall_history`。
- [ ] 让 `switchMemoryMode("summary")` 释放向量索引与检索模型，启用摘要服务；切回 `vector` 时按既有流程初始化与对账。旧配置缺失模式时仍按现有默认值处理。
- [ ] 检查模式切换失败回滚、旧向量数据保留、世界书不受影响。

### Task 2：文件路径、持久化与生命周期

**Files:** 新建 `src/main/memory/summary-memory-paths.ts`、`src/main/memory/summary-memory-store.ts`；修改 `src/main/chats/chats-ipc.ts`，必要时修改 `src/shared/chat-types.ts` 和 `src/main/chats/chats-store.ts` 以保存每会话整理进度；对应测试文件。

**Interfaces:** `resolveSummaryPaths(conversationId: string, workspaceRoot?: string): { sessionPath: string; workspacePath?: string }`；`readSummary(path, maxChars)`；`writeSummaryAtomic(path, content, maxChars)`；每会话进度记录“最后已整理的正式助手消息 ID”。

- [ ] 验证可信路径解析、无工作区 Chat 路径、Unicode 字符计数、超长读取标记和会话删除清理。
- [ ] 实现确定性会话文件名、文件缺失视为空摘要、先写临时文件再同目录替换；后台文件超限时拒绝替换，保持旧文件。
- [ ] 整理进度放在现有会话持久化元数据中，不写进给模型看的 Markdown 正文；重启后继续按同一进度计算轮次。

### Task 3：每 10 轮的静默整理

**Files:** 新建 `src/main/memory/summary-memory-scheduler.ts`、`src/main/memory/summary-memory-llm.ts`；接入 `src/main/orchestrator/build-options.ts` 的成功收尾及会话切换/结束入口；扩展 `src/main/memory/memory-llm-client.ts`、`src/main/orchestrator/structured-output/types.ts`、`src/main/runtime-policy/token-budget.ts` 的摘要操作映射；对应测试文件。

**Interfaces:** `scheduleSummaryTurn(conversationId: string): void`；`flushSummary(conversationId: string): Promise<void>`。模型输入为原文件正文与进度之后的正式对话轮次；输出为完整的新会话摘要及可选的新工作区摘要。

- [ ] 覆盖第 9/10 轮、不同会话交错、会话切换补写、工作区无新事实不改写、模型失败不推进进度、模式切换后过期任务不落盘。
- [ ] 在成功回复已经写入正式会话轨迹后调度，按正式回复 ID 去重，避免流式消息和工具调用重复计数。使用现有模型配置和结构化输出；校验输出字数与事实来源。超限时最多请求一次压缩修复，仍超限则保留旧文件与进度。
- [ ] 按会话串行整理，并对同一工作区文件串行“重读→合并→写入”，避免两个会话覆盖彼此；成功写入后才推进进度。

### Task 4：提示词注入与缓存边界

**Files:** `src/main/orchestrator/build-options.ts`、`src/main/orchestrator/mode-prompt-profile.ts` 或当前固定规则所在文件；`src/main/orchestrator/build-options.test.ts`。

**Interfaces:** 在现有稳定前缀中增加当前会话固定的实际文件路径和规则，在 `soulRuntimeContext`（运行时可变上下文）中增加固定的摘要正文段落。

- [ ] 用固定输入逐字段比较提示词：向量/关闭模式没有摘要段；Chat 只有当前会话；绑定工作区有两段且顺序固定；无工作区时不泄漏旧项目路径。
- [ ] 核对稳定前缀包含当前会话及工作区的实际文件路径，但不包含摘要正文或轮次；摘要文件变化只改变运行时段。工作区重新绑定时更新路径并允许该会话的缓存前缀重建。
- [ ] 在可写模式的规则中说明：用户明确要求更新摘要时，先重读磁盘，再用已有文件工具更新对应路径并遵守长度上限；Chat 规则只读。

### Task 5：记忆面板与交付检查

**Files:** `src/renderer/react/features/settings/MemorySettingsPanel.tsx`、`src/renderer/settings/shared/types.ts`、`src/renderer/global.d.ts`、`src/renderer/react/i18n/{zh-CN,en,ja-JP}.json`；如需读取文件预览，扩展现有记忆面板的进程间通信接口。

- [ ] 增加“摘要”选项并展示适用说明、当前摘要文件路径和正文；没有工作区时只展示会话文件。L2 区域仅在向量模式显示。
- [ ] 核对切换后的 UI、三种语言、缺失文件的空状态，以及切回向量模式仍能查看原有记忆。
- [ ] 实施阶段运行相关主进程与渲染层检查，并做一次实际会话的 10 轮、重启、切换、删除路径核对；本方案编写阶段不运行测试或提交代码。

## 完成标准

- 摘要模式的 Chat 会话每 10 轮后台维护一份最多 800 字符的用户数据目录文件；模型每轮只读其选定路径与正文。
- 绑定项目的会话每 10 轮维护会话文件，并在有新跨会话信息时维护最多 1,200 字符的工作区文件；两者均在项目 `.cyrene/memory/` 下。
- 稳定提示词不含动态摘要；摘要模式不做向量化，也不向模型暴露向量记忆工具；原有向量模式和关闭模式行为保持可用。
