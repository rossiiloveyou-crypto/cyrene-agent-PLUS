# Responses 通道问题梳理：回放链路缺陷与端点审计

> 2026-09-28 · 由线上用户日志（gpt-6-sol 400）触发排查。本文档只记录现状、证据与待决策项，不动代码。
> 已按代码审查结论修订：区分协议切换方向、收回"无回归风险"断言、细化回放降级条件、端点修复改为档案/预设链路并补全迁移范围、补流中断落盘缺陷。

## TL;DR

排查发现**三个我们侧的代码缺陷**与**一个端点数据问题**，互相独立：

1. **回放链路两缺陷（问题一）**：降级构造给 assistant 历史文本写 `input_text`（协议非法，严格服务端 400）；异协议 `rawAssistant` 被静默清空后整条助手轮次丢弃（历史失真，无报错）。
2. **流中断结算错误（问题三）**：缺终态事件时部分文本仍作为成功结果落盘，是缺底稿消息的产源头。
3. **端点数据（问题二）**：MiniMax 中国区 Responses 官方端点在 `api.minimax.cn/v1/responses`，档案/预设用的是老域名 `api.minimaxi.com/v1`，收到误导性 401。修复必须走档案/预设/设置页链路，仅改注册表无效。

---

## 背景：两条触发日志

### 日志 A（线上用户，gpt-6-sol，Responses 通道）

```
400 Invalid value: 'input_text'. Supported values are: 'output_text' and 'refusal'.
param: input[1].content[0]
```

- `input[1]` 是请求体 `input` 数组第二条，一条 **assistant 角色**的历史消息，content block 类型非法。
- `rounds=0`：第一轮 LLM 调用就被拒，坏消息在本轮开始前已存在于会话历史。

### 日志 B（本机实测，MiniMax-M3 切 Responses 通道）

```
401 login fail: Please carry the API secret key in the 'Authorization' field (1004)
baseUrl: https://api.minimaxi.com/v1/responses
```

- 同一 key 在 `api.minimaxi.com/anthropic` 上长期可用，key 本身有效。
- 代码链路核实（`sdk-stream/client-config.ts` + OpenAI SDK）：`Authorization: Bearer` 确实发送。
- **已证实**：MiniMax 官方文档端点为 `api.minimax.cn/v1/responses`，旧地址与现行文档不符。
- **推断（未做对照实验）**：401 疑似老域名上无 `/v1/responses` 路由、网关对未知路由回鉴权错误文案所致；不排除其他原因。

---

## 问题一：回放链路两缺陷

回放入口 `responses-adapter.ts` `toWireInput()` 的 assistant 分支按两条路径分叉，各有一个缺陷：

### 1a. 降级构造协议非法（`rawAssistant === undefined` 时）

```ts
// 退化构造：正文 + 工具调用分别落 input items
const text = typeof m.content === "string" ? m.content : "";
if (text) input.push({ role: "assistant", content: [{ type: "input_text", text }] });
```

Responses 协议 assistant 侧 content block 只能是 `output_text` / `refusal`（服务端报错原文即证据）。`input_text` 是 user 侧类型，抄错了。

- **测试固化了错误**：`responses-adapter.test.ts:127` 的期望值就是 `input_text`，定向测试全绿掩盖故障。
- **修复未验证**：改成 `output_text` 是否被严格服务端接受尚待实测。OpenAI 官方对话状态指南推荐复用已有输出项；降级构造应优先采用 OpenAI SDK 支持的助手文本输入形状（如 `content` 为纯字符串的 easy input message），并以严格服务端两轮请求验证。
- **切协议方向**：从 OpenAI Chat Completions 切到 Responses 时，现有 `openai-adapter` 不写 `rawAssistant`，历史助手消息走本分支，可能触发同一个 400。

### 1b. 异协议底稿静默丢弃（`rawAssistant !== undefined` 但不可回放时）

```ts
if (m.rawAssistant !== undefined) {
  input.push(...replayRawAssistant(m.rawAssistant, includeEncryptedReasoning));
  continue;
}
```

`replayRawAssistant()` 按类型 `message` / `function_call`（及带加密内容的 `reasoning`）过滤。若底稿来自 Anthropic 协议（`text` / `tool_use` 块），过滤结果为空——**整条助手轮次无声消失**，正文与工具调用均不重建，也不报错。空底稿、无法识别的旧数据同样可能触发；当前 OpenAI Chat Completions 适配器不写 `rawAssistant`，其切换路径属于 1a。

- **触发路径**：OpenAI Chat Completions → Responses 因无底稿走 1a，可能 400；Anthropic → Responses 若保留 Anthropic 底稿则走 1b，可能静默丢失。问题三的流中断落盘也会产生走 1a 的无底稿消息。
- **影响**：跨协议或跨档案且切换协议后复用会话时，历史可能失真，模型看不到自己说过的话和发起过的工具调用，行为退化且无任何诊断信号。
- **降级边界**：底稿混有未知项不等于整条不可回放。应保留可回放的有效消息和工具调用；仅当回放结果无法覆盖原消息已有正文或工具调用时，才从统一字段重建，并避免同一轮重复加入。

---

## 问题二：MiniMax 端点数据（数据，非协议代码错）

### 证据

- [MiniMax 官方文档](https://platform.minimax.cn/docs/api-reference/responses-create)：Responses 端点为 `https://api.minimax.cn/v1/responses`（国际站 `api.minimax.io` 另有端点，不通用）。
- 注册表 `entries/minimax.ts`：`baseUrl` 是 anthropic 入口，`visionBaseUrl`（OpenAI 兼容入口）是老域名 `api.minimaxi.com/v1`，无 responses 专用端点。

### 结构性根因（消费链，不止注册表）

- 实际请求使用**档案保存的地址**，不是注册表现查。
- 设置页 [ModelSettingsPanel.tsx:146-149](../../src/renderer/react/features/settings/ModelSettingsPanel.tsx) 的 `transportUrl()` 只区分 anthropic / 其他两种：`preset.anthropicBaseUrl` 与 `preset.baseUrl`，**没有 responses 档位**。切到 Responses 协议时沿用的就是 OpenAI 兼容老地址。
- 因此仅给注册表加字段不解决 401，还会形成第二份易漂移的数据；必须让预设 → 设置页切换/重置 → 档案整条链路消费同一来源。
- 已保存配置同时存在 `modelProfiles`、`perProvider` 和由后者展开的顶层镜像；迁移必须覆盖这些消费路径，不能只改模型档案列表。

### 顺带发现：MiniMax Responses 行为差异（待实测确认）

官方 ContentPart 类型总表同时列 `input_text` / `output_text`，但不能据此判断服务端的角色级校验是否宽松；MiniMax 是否会复现 1a 待连通后实测。协议 bug 的严格校验验证应以 DeepSeek / OpenAI 链路为准。另：MiniMax 的 `tool_choice` 仅支持 `none` / `auto`（注册表 `toolChoiceQuirk` 已覆盖）。

---

## 问题三：流中断部分文本落为成功历史

`sdk-stream/runtime.ts:214-238`（responses 分支）：流循环中只有收到终态事件（`responsesTerminalResponse`）才填充 `finalResponse`；传输中断时 `finalResponse` 为空 → `outputItems` 为 undefined → 但 `accumulator.finalize()` 聚积的**部分文本仍作为成功 ChatResponse 返回并落盘**，`rawAssistant` 缺失。

- 代码注释自称"安全降级"，实际上：这条消息下一轮就走 1a 的非法构造 → 400（严格服务端）。
- **修复方向**：无终态事件应按协议失败结算（报错或标记中断），不得把部分回复当作完整助手历史持久化。
- 与 1a 的关系：这是缺底稿消息的**上游产源头**之一；修好 1a 的类型标签不等于处理好了中断。

---

## 影响面审计：Responses 通道 7 家厂商现状

| 厂商 | 端点来源 | 现状 | 待办 |
| --- | --- | --- | --- |
| chatgpt | `api.openai.com/v1` | 原生 Responses，无问题 | 无 |
| deepseek | `api.deepseek.com` | 三格式官方全支持，本机实测 responses 可通 | 无 |
| minimax | 无 responses 档位（老域名） | 官方在 `api.minimax.cn/v1`，档案/预设待迁移 | 补端点 + 实测 |
| grok | `api.x.ai/v1` | [官方文档](https://docs.x.ai/developers/rest-api-reference/inference/responses)确认 `/v1/responses`，预设地址匹配 | 连通冒烟待做 |
| doubao | `ark.cn-beijing.volces.com/api/v3` | [方舟文档](https://docs.volcengine.com/docs/ark/1187687?lang=zh)确认 `/api/v3/responses`，预设地址匹配 | 连通冒烟待做 |
| qwen | `dashscope.aliyuncs.com/compatible-mode/v1` | [百炼文档](https://help.aliyun.com/zh/model-studio/qwen-api-via-openai-responses)确认 `/compatible-mode/v1/responses`；旧通用域名仍可用，推荐业务空间专属域名 | 连通冒烟待做；专属域名由用户配置 |
| mimo | `api.xiaomimimo.com/v1` | [小米文档](https://mimo.mi.com/docs/zh-CN/api/chat/responses)确认 `/v1/responses`，预设地址匹配 | 连通冒烟待做 |

（claude / gemini / kimi / glm 未声明 responses 支持，不在通道内，无影响。）

---

## 修复方案（按依赖顺序）

1. **回放修复（问题一 1a + 1b）**
   - 降级消息改用 OpenAI SDK 支持的助手文本输入形状构造；
   - 对 `rawAssistant` 做可回放性判断：混有未知项时保留有效输出项；只有有效项不足以覆盖已有正文或工具调用时，才从统一字段补建缺失部分，避免重复回放；
   - 定向测试矩阵：无底稿 / 异协议底稿 / 空底稿 / 有效项混未知项 / 工具调用与工具结果顺序；
   - 用严格服务端验证两轮请求（复现 → 修复 → 通过）。

2. **端点修复（问题二）**
   - 先用对应区域的有效密钥验证 MiniMax 新端点连通，再迁移已保存地址；
   - 沿用模型预设的按协议选地址机制，增加 Responses 默认地址档位；
   - 更新设置页协议切换与重置逻辑，消费同一来源（注册表/预设若存地址，设置页必须实际消费，避免第二份数据）；
   - 对**MiniMax + Responses + 地址恰好等于旧默认值**的 `modelProfiles` 和 `perProvider` 做定向迁移，并保持顶层镜像一致；自定义地址原样保留。

3. **流中断结算（问题三）**
   - 无终态事件按协议失败结算，杜绝部分回复落为完整历史。

4. **验证闭环**
   - 分别测试：正常多轮回放、流中断恢复后继续、旧档案迁移与自定义地址保留、MiniMax 新端点多轮与工具调用（需对应区域有效密钥）。

---

## 待决策

- [ ] 方案顺序是否按上表执行（回放 → 端点 → 流中断 → 验证）
- [ ] 流中断结算的形态：报错中断（用户重发）还是落盘但标记中断待续传——影响用户体验，需拍板
- [ ] `responses-adapter.test.ts` 其余断言对照官方文档的一次性全量复核是否纳入本轮
- [ ] 4 家已核实端点的连通冒烟是否纳入本轮（官方地址已核对，尚未持密钥实测）

## 关键文件索引

- `src/main/orchestrator/vendors/responses-adapter.ts:134-173` — `toWireInput()`（1a 出错点 :166；1b 分叉 :159-163）
- `src/main/orchestrator/vendors/responses-adapter.ts:102-127` — `replayRawAssistant()`（异协议过滤清空点）
- `src/main/orchestrator/vendors/responses-adapter.ts:32-40` — `WireMessageItem`（协议形状自证）
- `src/main/orchestrator/vendors/responses-adapter.test.ts:127-147` — 固化错误行为的测试
- `src/main/orchestrator/vendors/sdk-stream/runtime.ts:214-238` — 流中断落盘（问题三）
- `src/renderer/react/features/settings/ModelSettingsPanel.tsx:146-149` — `transportUrl()` 无 responses 档位
- `src/shared/vendor-registry/entries/minimax.ts` — 端点数据待补
- 前置相关：`docs/internal-issue/2026-09-20-harness-recovery-orphan-tool-result-400-report.md`（同为 Responses 400 但根因不同：孤儿 tool result）
