# Cyrene Error Map — Xiaomi MiMo

> Last verified: 2026-09-27  
> Evidence: **official Xiaomi MiMo API documentation**  
> Scope: MiMo direct API / documented compatibility endpoints.

## Parsing priority

1. Transport/runtime failure
2. HTTP status
3. Structured vendor error payload/message
4. `UNKNOWN`

## Official error mapping

| HTTP | Meaning | Cyrene category | Retryable | Suggested user message |
|---:|---|---|---|---|
| `400` | Invalid request format/parameters/model/message/multimodal input | `INVALID_REQUEST` | No | 请求格式或参数无效，请检查模型、消息结构和字段取值。 |
| `401` | Missing/invalid API Key or wrong auth/base URL/key type | `AUTH` | No | MiMo 认证失败，请检查 API Key、Authorization 和所使用的 Base URL。 |
| `402` | Insufficient balance | `BILLING` | No | MiMo 账户余额不足，请检查计费状态。 |
| `403` | Region unavailable or key risk-control/access restriction | `PERMISSION` | No | 当前账户、区域或 API Key 无权访问该服务。 |
| `404` | Resource/endpoint/model capability not found | `NOT_FOUND` | No | 请求的资源、接口或模型能力不存在。 |
| `421` | Content moderation/filtering | `CONTENT_POLICY` | No | 请求或生成内容触发了内容安全限制。 |
| `429` | Too frequent or Token Plan quota exhausted | `RATE_LIMIT` / `QUOTA` | Conditional | 请求过于频繁或套餐额度已耗尽，请检查限额后重试。 |
| `500` | Internal server error | `SERVER_ERROR` | Yes | MiMo 服务发生内部错误，请稍后重试。 |
| `503` | Server overloaded | `OVERLOADED` | Yes | MiMo 当前负载较高，请稍后重试。 |

## Important 429 handling

Do not hard-map every `429` to `RATE_LIMIT`. Inspect the vendor message:

- frequency/concurrency language → `RATE_LIMIT`, retry with backoff
- Token Plan quota exhausted / allowance exhausted → `QUOTA`, wait for reset/upgrade/switch billing

## JSON-ready map

```json
{
  "provider": "mimo",
  "http": {
    "400": {"category": "INVALID_REQUEST", "retryable": false},
    "401": {"category": "AUTH", "retryable": false},
    "402": {"category": "BILLING", "retryable": false},
    "403": {"category": "PERMISSION", "retryable": false},
    "404": {"category": "NOT_FOUND", "retryable": false},
    "421": {"category": "CONTENT_POLICY", "retryable": false},
    "429": {"category": "RATE_LIMIT", "retryable": "conditional"},
    "500": {"category": "SERVER_ERROR", "retryable": true},
    "503": {"category": "OVERLOADED", "retryable": true}
  },
  "message_overrides": [
    {"contains": ["quota", "额度", "Token Plan"], "category": "QUOTA", "retryable": false}
  ]
}
```

## MiMo-specific implementation note

MiMo documents both OpenAI- and Anthropic-compatible usage. If Cyrene supports multiple compatibility modes, capture the mode/base URL in diagnostic metadata because using the wrong key type or base URL can surface as authentication failures.

## Unknown fallback

`未知 MiMo 错误。请保留 HTTP 状态、原始错误信息和请求 ID，并查询 MiMo 官方文档。`

## Sources

- https://mimo.mi.com/docs/zh-CN/api/guidance/error-codes
- https://mimo.mi.com/docs/en-US/api/quick-start/error-codes
