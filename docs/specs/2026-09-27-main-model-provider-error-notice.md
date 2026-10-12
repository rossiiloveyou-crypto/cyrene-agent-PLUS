# 主模型厂商错误分类与输入区提示方案

## 目标与范围

主模型调用最终失败时，在聊天输入框上方显示一条错误项：左侧图标和文字给出“错误提示”及简短说明，右侧按钮打开详情弹窗查看完整错误码。未知错误显示“未知错误”，详情中提示用户根据状态码、厂商错误码查询厂商文档。失败摘要同时保留在对应聊天轮次中。

范围是桌面聊天运行中的主模型请求，包括 ChatLoop 与 Harness 的流式请求及其非流式降级请求。用户取消、工具失败、插件、渠道、语音、记忆、图像识别等链路不触发本提示。辅助摘要请求如果导致整个运行失败，仍走现有通用错误提示；它不冒充主模型请求失败。

本方案只改善失败的识别与呈现。第一版不增加自动重试，不在运行时抓取厂商文档，也不引入新的网络请求依赖。

## 现状与复用判断

- 主模型流式调用已使用 `openai@7.5.0` 与 `@anthropic-ai/sdk`。两套官方 SDK 都暴露 HTTP 状态码、响应头、错误对象及请求标识；Cyrene 现有客户端配置将 `maxRetries` 设为 `0`。优先读取这些结构化字段，不解析 SDK 的整段 `message`。
- `src/main/orchestrator/vendors/sdk-stream/runtime.ts` 当前把大多数异常包装成通用 `E_MODEL_REQUEST_FAILED`。`src/main/orchestrator/cyrene-agent.ts` 再生成纯文本安全异常，厂商状态码到 `RUN_ERROR` 时已经丢失。
- `src/main/orchestrator/chat-loop.ts` 和 `src/main/orchestrator/harness/harness-llm.ts` 各有非流式 `fetch` 降级路径，需要共用同一错误提取方法。后者当前直接 `JSON.parse` 失败响应；响应不是合法 JSON 时可能进一步丢失原始 HTTP 状态。
- `RUN_ERROR` 已有 `code` 和 `metadata` 字段。保留 `code` 作为 Cyrene 内部错误码，把安全的厂商错误详情放入 `metadata.cyreneModelFailure`；不使用 `rawEvent` 传原始响应。
- `ChatComposer` 外层 `cy-composer-stack` 是纵向容器，当前内容顺序为欢迎区、待发送队列、输入框。可在队列与输入框之间加入错误项，与输入框同宽。
- 输入框基于 `@ant-design/x` 的 `Sender`。项目已有 `components.json` shadcn 配置、`radix-ui`、`cn` 类名合并工具和 `lucide-react` 图标；当前 UI 目录尚无 shadcn `Item` 与 `Dialog` 组件。实现时沿用现有配置，通过 shadcn 组件生成器添加这两个组件，并接入 Cyrene 主题变量，不另引入一套 UI 框架。
- 聊天运行控制器已有把失败摘要写入当前轮 `processMessages` 的路径，可继续作为失败历史的简短留痕。

因此只需要少量项目专属的错误映射和接线逻辑。官方 SDK 继续负责协议与异常解析；不另造请求客户端、通知窗口或通用错误框架。

## 错误数据与分类

在 `src/shared/model-failure.ts` 定义跨进程共用、仅含安全字段的 `ModelFailureInfo`；提取与分类函数只放主进程。字段如下：

| 字段 | 含义 |
| --- | --- |
| `category` | 稳定分类：`AUTH`、`PERMISSION`、`BILLING`、`QUOTA`、`RATE_LIMIT`、`INVALID_REQUEST`、`NOT_FOUND`、`CONTEXT_LIMIT`、`PAYLOAD_TOO_LARGE`、`CONTENT_POLICY`、`CONFLICT`、`TIMEOUT`、`NETWORK`、`OVERLOADED`、`SERVER_ERROR`、`UNAVAILABLE`、`CANCELLED`、`UNKNOWN`；详细定义见[厂商错误码映射表](2026-09-27-main-model-provider-error-map.md) |
| `providerId`、`model` | 运行时实际使用的厂商标识和模型名；不从错误文本猜测 |
| `httpStatus?` | 有 HTTP 响应时的三位状态码 |
| `vendorCode?`、`vendorType?` | 厂商响应中确实存在的短代码或类型；缺失就不显示，不把 HTTP 状态伪装成厂商代码 |
| `requestId?` | SDK 或明确允许的响应头提供的请求标识，供用户向厂商反馈 |
| `retryAfterSeconds?` | 有合法 `Retry-After` 且能可靠换算时才提供；缺失不编造等待时间 |

所有字段在主进程白名单提取并做长度限制。`providerId` 使用当前适配器的 `id`。原始响应体、任意响应头、请求地址、密钥、提示词与 SDK 原始 `message` 不跨进程传给界面。厂商错误码不稳定或缺失时，仍可按 HTTP 状态归类。

分类优先级：用户取消 → 无 HTTP 响应的传输/运行时异常 → 厂商与协议匹配的结构化业务码/错误类型 → 厂商专属 HTTP 状态规则 → 通用 HTTP 规则 → 文档明确且受限的结构化消息信号 → `UNKNOWN`。厂商规则按稳定的 `providerId` 和实际协议模式命中；自定义端点只使用通用规则，不根据 URL 猜厂商。项目内置的 11 家厂商规则、证据强度和来源统一按[厂商错误码映射表](2026-09-27-main-model-provider-error-map.md)维护。

| 信号 | 类别 | 提示建议 |
| --- | --- | --- |
| DeepSeek 402；明确的余额不足代码 | `BILLING` | 检查账户余额或计费状态 |
| HTTP 429；明确的限流代码 | `RATE_LIMIT` | 降低请求频率，稍后重试 |
| HTTP 401 | `AUTH` | 检查当前模型档案的密钥 |
| HTTP 403 | `PERMISSION` | 检查账号或模型权限 |
| HTTP 400、404、422 | `INVALID_REQUEST` / `NOT_FOUND` | 检查模型档案或请求参数；按厂商规则区分资源不存在 |
| HTTP 408、504；明确的超时异常 | `TIMEOUT` | 稍后重试 |
| HTTP 5xx | `SERVER_ERROR` / `OVERLOADED` / `UNAVAILABLE` | 按厂商规则细分；否则提示厂商服务异常 |
| 没有 HTTP 响应的明确连接异常 | `NETWORK` | 检查网络和端点连通性 |
| 其他情况 | `UNKNOWN` | 检查错误码并查询厂商文档 |

DeepSeek 官方错误码页列出 400、401、402、422、429、500、503；这些首先是 **HTTP 状态码**，不能假定每个响应都另有 JSON 厂商代码。DeepSeek 的 Responses 流还可能以 `response.failed` 结束，事件内有 `error.code` 和 `error.message`；这类流内失败没有新的 HTTP 错误状态，需单独提取 `error.code`，按已知规则分类，否则归为 `unknown`。[DeepSeek 错误码](https://api-docs.deepseek.com/zh-cn/quick_start/error_codes/)、[DeepSeek Responses 流事件](https://api-docs.deepseek.com/zh-cn/guides/responses_api/)

## 数据流与显示

```text
主模型 SDK 异常 / 非流式 HTTP 错误 / 流内失败事件
  → 白名单提取 + 分类（主进程）
  → AgentRuntimeError 携带 ModelFailureInfo
  → CyreneAgent 生成安全文案并保留 ModelFailureInfo
  → AgUiBridge 首次运行失败结算
     └─ RUN_ERROR.metadata.cyreneModelFailure → 当前聊天轮次 + 当前会话错误项
  → ChatComposer 在输入框上方显示 shadcn Item 错误项
  → 点“查看详情”打开 shadcn Dialog
```

错误项只对应当前会话最近一次主模型失败，避免连续失败时在输入区堆叠多条。下一轮开始后收起；失败轮次仍留有安全摘要。组件宽度对齐 `cy-composer-stack`（居中态最大 770px，停靠态占满可用宽度），放在 `PendingQueueDock` 与 `cy-composer-shell` 之间。

直接使用 shadcn `Item` 组件：左侧媒体图标、中部标题和说明、右侧操作按钮；优先采用描边和紧凑尺寸。复用 Cyrene 当前主题色与间距，只用错误色标识图标或少量强调，不把整行铺成高饱和红底。点击“查看详情”用 shadcn `Dialog` 展示完整错误信息，维持同一套视觉语言。项目已有 shadcn 配置与基础依赖，只需把尚未安装到源码目录的 `Item`、`Dialog` 组件加入 `src/renderer/react/components/ui/`，再做少量主题适配。[Item 组件文档](https://ui.shadcn.com/docs/components/aria/item)

示例排版：

```text
!  错误提示                                      [查看详情]
   连接超时，暂时没有收到 DeepSeek 的响应。
```

标题保持统一“错误提示”；说明由分类器生成，例如“连接超时”“请求频率达到上限”“账户余额不足”。按钮命名为“查看详情”。用户点击后打开 shadcn Dialog，展示：错误类别、厂商与模型、HTTP 状态码、厂商错误码/类型、可用的请求标识、建议操作，以及已知厂商的官方错误文档入口。字段缺失时隐藏该行，不显示空值。弹窗只显示安全白名单字段，不展示原始响应体。

未知错误项示例：标题“错误提示”，说明“未知错误，请查看错误码并查询厂商文档”；详情区显示可用状态码和厂商错误码。若没有可展示的代码，则写明“厂商未返回可识别错误码”。

失败轮次中的过程消息保留简短分类和错误码，方便输入区错误项收起后回看。错误项用 `role="status"` 与 `aria-live="polite"` 播报，不抢夺输入焦点。弹窗可用 Escape 关闭，打开时将焦点移入弹窗，关闭后还给“查看详情”按钮。

## 落地步骤

1. **提取与归类。** 增加 `src/shared/model-failure.ts` 类型和 `src/main/orchestrator/vendors/model-failure.ts` 纯函数，分别从 OpenAI SDK 异常、Anthropic SDK 异常、非流式 `Response` 和流内失败事件提取安全字段并分类。厂商专属规则只取自[厂商错误码映射表](2026-09-27-main-model-provider-error-map.md)中已核对的条目。让 `sdk-stream/runtime.ts`、`chat-loop.ts` 和 `harness/harness-llm.ts` 的主模型请求调用它；`responses-normalizer.ts` 与 `anthropic-normalizer.ts` 的错误事件保留可识别的厂商码。非流式错误体解析失败时保留 HTTP 状态；辅助摘要函数不添加主模型错误标记。
2. **传递结构化失败。** 扩展 `AgentRuntimeError` 与 `classifyRunError` 的安全结果；`CyreneAgent` 不再把主模型错误降成只有文本的 `Error`。`AgUiBridge` 保持现有一次性终态闸门，在 `RUN_ERROR.metadata.cyreneModelFailure` 中发送白名单字段。其他运行失败仍走原有通用处理。
3. **显示与留痕。** 沿用 `components.json` 的现有配置，将 shadcn `Item` 与 `Dialog` 组件加入 UI 目录并适配 Cyrene 主题。`AgentRunController` 将当前会话最近一次主模型失败交给 `ChatPage`；`ChatPage` 传给 `ChatComposer`，在输入框上方显示 `Item`；按钮打开 `Dialog` 展示详情。聊天运行控制器继续把安全摘要写入失败轮次。补齐中英文界面文案。
4. **验收。** 用可控的 SDK 异常、非 JSON 的 HTTP 响应和流内失败事件检查分类与全链路传递；确认一次运行只弹一次，取消和非主模型失败不弹，未知码按未知显示，敏感响应内容不进入通知或聊天记录。

## 验收场景

| 输入 | 预期 |
| --- | --- |
| DeepSeek HTTP 429 | 输入框上方显示“请求频率达到上限”；详情显示状态码 429；失败轮次留痕 |
| DeepSeek HTTP 402 | 错误项说明余额不足；详情保留状态码；不建议反复立即重试 |
| 厂商 HTTP 429 且业务码表示额度耗尽 | 按该厂商映射归为 `QUOTA` 或 `BILLING`，不统一显示为频率限制 |
| HTTP 500/503 | 按厂商映射细分为 `SERVER_ERROR`、`OVERLOADED` 或 `UNAVAILABLE`；详情保留具体状态码 |
| HTTP 418 或厂商新代码 | 错误项显示未知错误；详情保留可用代码和文档查询提示 |
| 响应体为空或不是 JSON | HTTP 状态仍可识别，分类过程不再次抛错 |
| `response.failed` / Anthropic 流内错误 | 有代码则显示代码；无 HTTP 状态时不虚构状态码 |
| 网络断开、超时、用户取消 | 前两者分别归类；用户取消不弹错误窗 |
| 一次运行触发重复异常回调 | 终态闸门后只更新一条当前会话错误项 |
| 切换会话或开始下一轮 | 错误项始终对应当前会话；新一轮开始时收起旧项 |
| 原始错误含密钥、请求正文或长响应体 | 错误项、弹窗和聊天持久化内容均不包含这些原文 |

## 维护约定

厂商专属规则必须附官方文档链接和核对日期；没有证据的代码不预设含义。映射表同时记录厂商覆盖状态与已核对规则，文档更新时只改对应厂商规则，不改通用分类器。运行时不自动查询外部文档，因为在线文档可能不可达，且错误提示应立即显示。

参考：[DeepSeek 错误码](https://api-docs.deepseek.com/zh-cn/quick_start/error_codes/)、[DeepSeek Responses 流](https://api-docs.deepseek.com/zh-cn/guides/responses_api/)、[OpenAI Node SDK 错误对象](https://github.com/openai/openai-node/blob/main/docs/configuration.md)。厂商文档核对日期：2026-09-27。
