# 主模型厂商错误码映射表

本表对应[主模型厂商错误分类与输入区提示方案](2026-09-27-main-model-provider-error-notice.md)。本次以你提供的 11 家厂商资料为映射依据，并将资料副本收录在 [`docs/references/vendor-errors/`](../references/vendor-errors/README.md)，方便后续审阅和维护。每个厂商文件保留原始规则、请求协议范围、错误响应结构和来源链接；本表统一 Cyrene 的大类、匹配顺序和项目内厂商标识。

## 覆盖范围与厂商标识

范围是 Cyrene 主模型直接调用厂商 API 或其官方兼容接口。自定义端点、第三方聚合网关不套用专属厂商规则，只使用安全的通用分类。运行时必须使用当前适配器的 `providerId` 和协议模式，不可从 URL 或模型名猜厂商。

| 厂商资料 | Cyrene `providerId` | 常见协议/格式 | 匹配入口 | 证据状态 | 详细规则 |
| --- | --- | --- | --- | --- | --- |
| DeepSeek | `deepseek` | OpenAI 兼容；Responses 流内事件 | HTTP 状态；流内 `error.code` | HTTP 表有官方依据；流内代码只保留，未定义语义不猜测 | [deepseek.md](../references/vendor-errors/deepseek.md) |
| MiniMax | `minimax` | Anthropic 兼容；其他兼容接口按实际模式 | 响应体业务码 | 部分代码来自厂商自有界面的观察，不等同于公开 API 保证 | [minimax.md](../references/vendor-errors/minimax.md) |
| 豆包 / 火山方舟 | `doubao` | Ark / OpenAI 兼容 | Ark `Code`，其次 HTTP 状态 | 资料指向官方火山方舟文档；该页面本次仅返回 JavaScript 壳，具体代码未能在线复核，实施前再核对 | [doubao-seed.md](../references/vendor-errors/doubao-seed.md) |
| GLM / 智谱 | `glm` | OpenAI 兼容 | 数字业务码 | 混合证据：资料注明通过阿里云百炼 GLM 文档交叉核对；须再对照智谱当前官方 API 文档 | [glm.md](../references/vendor-errors/glm.md) |
| Kimi / Moonshot | `kimi` | OpenAI 兼容 | `error.type`，其次 HTTP 状态 | 厂商 API 错误类型；部分 429/403 需结合类型或语义 | [kimi.md](../references/vendor-errors/kimi.md) |
| Qwen / 阿里云百炼 | `qwen` | OpenAI 兼容及百炼原生错误结构 | 精确 `Code`，其次 HTTP 状态 | 官方错误码；429 下多个限流、额度、欠费原因须细分 | [qwen.md](../references/vendor-errors/qwen.md) |
| OpenAI / GPT | `chatgpt` | Responses；SDK 异常对象 | 结构化 `error.code` / `error.type`，其次 HTTP 状态 | 官方错误指南；429 可代表限流、账单或额度问题 | [openai-gpt.md](../references/vendor-errors/openai-gpt.md) |
| Claude / Anthropic | `claude` | Anthropic Messages | `error.type`，其次 HTTP 状态 | 官方错误类型；400/429 可能与消费上限有关 | [claude-anthropic.md](../references/vendor-errors/claude-anthropic.md) |
| MiMo / 小米 | `mimo` | OpenAI 与 Anthropic 兼容 | HTTP 状态；结合兼容模式与明确额度信号 | 官方状态表；429 需区分频率限制和套餐额度 | [mimo.md](../references/vendor-errors/mimo.md) |
| Grok / xAI | `grok` | OpenAI 兼容 | 结构化错误码、HTTP 状态 | 官方错误指南；400 对认证与请求语义有歧义，不凭状态码误判 | [grok-xai.md](../references/vendor-errors/grok-xai.md) |
| Gemini / Google | `gemini` | 项目适配器实际使用的 Gemini API 模式 | 结构化 `error.code` / 状态；生成阻止原因另行映射 | 官方标准错误码；GenerateContent 与 Interactions 信号需按模式解析 | [gemini.md](../references/vendor-errors/gemini.md) |

资料中的 provider 名称和 Cyrene 的 `providerId` 不完全相同，实施时按上表交叉映射：`openai`→`chatgpt`、`anthropic`→`claude`、`doubao_seed`→`doubao`、`xai_grok`→`grok`。MiMo 支持多种兼容协议，不能因为协议相同就复用其他厂商的代码表。

## 统一分类

保留厂商资料里的细分类别，界面可以将其归并成少量用户可理解的大类。分类枚举采用 `docs/references/vendor-errors/README.md` 定义的规范名称；如果内部代码继续沿用另一套枚举，必须在单一转换函数里显式映射，不能把未支持的类别静默丢掉。

| 规范类别 | 面向用户的大类 | 常见含义 |
| --- | --- | --- |
| `AUTH` | 认证失败 | API Key、令牌或认证头错误 |
| `PERMISSION` | 权限不足 | 账号、模型、区域、项目或工作区无访问权限 |
| `BILLING` | 计费问题 | 余额、欠费、订阅或消费上限 |
| `QUOTA` | 额度耗尽 | 套餐、日/月限额或可用量耗尽 |
| `RATE_LIMIT` | 请求过于频繁 | RPM/TPM、并发、突发流量限制 |
| `INVALID_REQUEST` | 请求无效 | 参数、消息格式、端点模式或字段错误 |
| `NOT_FOUND` | 资源不存在 | 模型、接口或资源不存在 |
| `CONTEXT_LIMIT` | 输入超出上下文 | 上下文长度或最大令牌数超限 |
| `PAYLOAD_TOO_LARGE` | 请求内容过大 | 请求体或文件大小超限 |
| `CONTENT_POLICY` | 内容安全限制 | 输入或生成内容被策略拦截 |
| `CONFLICT` | 请求状态冲突 | 重复请求或资源状态冲突 |
| `TIMEOUT` | 连接/请求超时 | 传输超时或厂商处理超时 |
| `NETWORK` | 网络连接失败 | DNS、TLS、断连等无 HTTP 响应的传输错误 |
| `OVERLOADED` | 厂商负载过高 | 厂商明确报告容量过载 |
| `SERVER_ERROR` | 厂商服务错误 | 厂商内部错误 |
| `UNAVAILABLE` | 服务暂不可用 | 接口、模型或上游暂不可用 |
| `CANCELLED` | 请求已取消 | 明确的客户端/服务端取消，不显示成厂商故障 |
| `UNKNOWN` | 未知错误 | 未命中安全、可证实的规则 |

界面标题可统一为“错误提示”，短说明使用对应大类文案；详情弹窗保留细分类别、厂商状态码/代码/类型和安全的请求标识。不要把“建议重试”当作确定结果：重试策略独立执行，遵循对应厂商规则、`Retry-After` 和有限重试预算。

## 规则匹配优先级

按以下顺序分类，命中高优先级的确定规则后不再被较宽泛的 HTTP 规则覆盖：

1. 用户取消：归为 `CANCELLED`，按现有取消交互处理，不展示厂商故障提示。
2. 无 HTTP 响应的传输/运行时异常：区分 `NETWORK`、`TIMEOUT`；未知运行时异常归为 `UNKNOWN`。
3. 厂商 + 当前协议模式 + 精确业务码、`error.type`、`error.code` 或流内失败码。
4. 厂商 + HTTP 状态的已核对规则。
5. 通用 HTTP 状态规则。
6. 仅在厂商文档明确含义且字段可控时，使用结构化消息信号补充分类；普通自由文本不作为精确映射键。
7. 未命中归为 `UNKNOWN`，提示“请检查错误码并查询厂商文档”。

不能仅凭相同 HTTP 状态推断跨厂商语义。典型情况：HTTP 429 可能是短时限流、额度耗尽、欠费或过载；必须优先解析业务码/类型。若厂商只给 HTTP 429 且文档没有进一步区分，就显示通用的“请求受限”，不假称已判断具体原因。

## 各厂商规则摘要

详细码表和逐厂商来源见上方资料链接。下表列出实现必须保留的区分点；同厂商中未列出的代码仍应按对应详细资料匹配，不得当作未支持代码覆盖掉。

| 厂商 | 明确规则示例 → 规范类别 | 必须保留的差异 |
| --- | --- | --- |
| DeepSeek | HTTP 400/422→`INVALID_REQUEST`；401→`AUTH`；402→`BILLING`；429→`RATE_LIMIT`；500→`SERVER_ERROR`；503→`OVERLOADED` | 当前官方表按 HTTP 状态定义；Responses 流的 `error.code` 可展示，但未定义代码不能猜义。 |
| MiniMax | 1008→`BILLING`；2013→`INVALID_REQUEST`（上下文超长时可为 `CONTEXT_LIMIT`）；2049→`AUTH`；2062→条件分类 | 资料注明这些代码来自厂商自有界面的观察。没有官方公开 API 保证前，作为低置信度兼容规则；2062 需结合订阅/权益信号，不能固定分成限流或计费。 |
| 豆包 | `MissingParameter`/`InvalidParameter`→`INVALID_REQUEST`；`InvalidSubscription`→`BILLING`；`QuotaExceeded`→`QUOTA`；`ServerOverloaded`→`OVERLOADED`；`RequestBurstTooFast`→`RATE_LIMIT` | 同为 HTTP 429 的业务码对应额度、负载、突发限流等不同类别；先读 Ark `Code`。 |
| GLM | 1000–1004→`AUTH`；1210→`INVALID_REQUEST`；1211→`NOT_FOUND`；1261→`CONTEXT_LIMIT`；1300/1301→`CONTENT_POLICY`；1302/1303/1305→`RATE_LIMIT`；1304/1308/1310→`QUOTA`；1312→`OVERLOADED` | 以精确数字码区分账号、请求、策略、流控与套餐问题；完整码表见厂商资料。 |
| Kimi | `invalid_authentication_error`→`AUTH`；`model_not_found`→`NOT_FOUND`；`engine_overloaded_error`→`OVERLOADED`；`rate_limit_reached_error`→`RATE_LIMIT`；`exceeded_current_quota_error`→额度/计费类；`content_filter`→`CONTENT_POLICY` | 429 检查 `error.type`；403 可能是权限或账单。499 按具体错误归 `CANCELLED` 或 `NETWORK`。 |
| Qwen | `InvalidApiKey`→`AUTH`；`ModelNotFound`→`NOT_FOUND`；`Throttling.RateQuota`/`Throttling.BurstRate`/`Throttling.Concurrency`→`RATE_LIMIT`；`Throttling.ServiceOverloaded`→`OVERLOADED`；`Throttling.AllocationQuota`→`QUOTA`；`CommodityNotPurchased`/`PrepaidBillOverdue`→`BILLING` | 必须读取精确 `Code`；HTTP 429、403 均不足以区分限流、额度、欠费和权限。 |
| OpenAI | `slow_down`→`RATE_LIMIT`；`credit_balance_exhausted`/组织或项目消费上限→`BILLING`；`organization_usage_limit_exceeded`→`QUOTA`；`server_is_overloaded`→`OVERLOADED` | SDK 异常类型可协助兜底，但不要只凭统一 `RateLimitError` 将 429 全归限流。 |
| Claude | `authentication_error`→`AUTH`；`billing_error`→`BILLING`；`permission_error`→`PERMISSION`；`rate_limit_error`→`RATE_LIMIT`；`timeout_error`→`TIMEOUT`；`overloaded_error`→`OVERLOADED` | 400 或 429 也可能涉及消费上限；有明确 spend cap 信号时优先归 `BILLING`/`QUOTA`。保留 request ID。 |
| MiMo | HTTP 400/401/402/403/404/421/500/503 分别按资料归类；429 先区分频率与 Token Plan 额度 | 同时保留使用的是 OpenAI 还是 Anthropic 兼容模式。自由文本额度关键词只作保守补充，不覆盖明确结构化码。 |
| Grok | 401→`AUTH`；403→`PERMISSION`；404→`NOT_FOUND`；405/415/422→`INVALID_REQUEST`；413→`PAYLOAD_TOO_LARGE`；429→`RATE_LIMIT`；500→`SERVER_ERROR`；502/503→`UNAVAILABLE` | 400 可表示请求格式，也可能表示 API Key 错误；仅在官方定义的结构化信号明确时覆写分类。 |
| Gemini | `authentication`→`AUTH`；`permission_denied`→`PERMISSION`；`rate_limit_exceeded`→`RATE_LIMIT`；`quota_exceeded`→`QUOTA`；`deadline_exceeded`→`TIMEOUT`；`service_unavailable`→`UNAVAILABLE` | Interactions 的标准错误码与 GenerateContent 的生成阻止/安全原因是不同信号，按实际适配器/API 模式分别解析。 |

## 数据结构与安全边界

每条分类结果至少区分以下概念，避免把状态码冒充厂商代码：

| 字段 | 来源与用途 |
| --- | --- |
| `providerId`、`protocolMode`、`model` | Cyrene 当前实际使用的适配器、协议模式和模型档案。 |
| `category` | 上述稳定规范类别；未知时为 `UNKNOWN`。 |
| `httpStatus` | HTTP 响应状态，不等于厂商业务错误码。 |
| `vendorCode`、`vendorType` | 从厂商结构化错误对象中按白名单提取的短码/类型。 |
| `requestId` | 厂商 SDK/响应中明确提供的请求标识，限制长度后用于诊断。 |
| `userMessage`、`suggestion`、`docsUrl` | 从本映射规则生成的 UI 内容及官方文档入口。 |
| `retryable` | 仅作提示元数据；自动重试必须由独立、有上限的执行策略决定。 |

原始错误消息可能回显用户提示词、文件内容、端点参数或其他敏感数据。不要把整个 raw response/raw message 默认跨进程、写入聊天历史或直接展示。若后续确实需要“复制诊断信息”，必须单独设计脱敏白名单与用户主动触发流程；当前错误提示只展示有限长度的安全字段、分类文案和请求 ID。

## 维护规则

1. 厂商专属规则须对应厂商、协议模式、精确匹配字段和值，并链接该厂商源文件中的官方来源和核对日期。
2. 标记为“观察到”或低置信度的代码（当前 MiniMax 部分规则）不得包装成官方保证；实现时可默认只作为诊断代码保留，除非产品明确接受启发式兼容规则。
3. 对结构化 `message` 的解释必须来自厂商文档且限定于明确语义。不可用宽泛关键词匹配用户/模型自由文本，也不可从字符串任意推断余额或权限。
4. 厂商文档未给出某个 HTTP 状态或业务码的语义时不预设专属结论，落到通用分类或 `UNKNOWN`。
5. 映射更新时修改对应 `docs/references/vendor-errors/<provider>.md` 与本索引；更新来源链接、核对时间，并在实现中为新增/变更的规则补充针对性覆盖。

> 资料包核对时间标注为 2026-09-27。本次按你提供的文档整理，保留其中的证据强弱说明；尚未对全部官方页面逐条重新在线核验。
