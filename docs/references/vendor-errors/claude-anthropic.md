# Cyrene Error Map — Claude / Anthropic

> Last verified: 2026-09-27  
> Evidence: **official Anthropic/Claude API documentation**  
> Scope: Anthropic direct API.

## Parsing priority

1. Transport/runtime error
2. Nested `error.type`
3. HTTP status
4. `error.message`
5. `UNKNOWN`

Anthropic error responses include a top-level error envelope and a request ID. Preserve that request ID for diagnostics/support.

## Official mapping

| HTTP | `error.type` | Cyrene category | Retryable | Suggested user message |
|---:|---|---|---|---|
| `400` | `invalid_request_error` | `INVALID_REQUEST` | Usually no | 请求无效，请检查参数、消息内容或账户限制。 |
| `401` | `authentication_error` | `AUTH` | No | Anthropic 认证失败，请检查 API Key。 |
| `402` | `billing_error` | `BILLING` | No | Anthropic 计费状态异常，请检查余额或账单。 |
| `403` | `permission_error` | `PERMISSION` | No | 当前账户无权访问该资源或模型。 |
| `404` | `not_found_error` | `NOT_FOUND` | No | 请求的模型或资源不存在。 |
| `409` | `conflict_error` | `CONFLICT` | Conditional | 请求状态冲突，请检查当前资源状态后重试。 |
| `413` | `request_too_large` | `PAYLOAD_TOO_LARGE` | No | 请求体过大，请减少输入或文件大小。 |
| `429` | `rate_limit_error` | `RATE_LIMIT` / `QUOTA` / `BILLING` | Conditional | 已触发速率或用量限制，请检查 Retry-After 和账户限额。 |
| `500` | `api_error` | `SERVER_ERROR` | Yes | Anthropic 服务内部错误，请稍后重试。 |
| `504` | `timeout_error` | `TIMEOUT` | Yes | Anthropic 请求超时，请稍后重试。 |
| `529` | `overloaded_error` | `OVERLOADED` | Yes | Anthropic 当前负载较高，请稍后重试。 |

## Important 400/429 nuance

Anthropic documents that account/workspace spend limits can surface in 4xx responses, including `400` or `429` depending on context. Therefore:

- parse `error.message` and account-limit metadata before final classification;
- if the message clearly indicates a spend cap, classify as `BILLING`/`QUOTA`, not generic `INVALID_REQUEST`/`RATE_LIMIT`.

## JSON-ready map

```json
{
  "provider": "anthropic",
  "types": {
    "invalid_request_error": {"category": "INVALID_REQUEST", "retryable": false},
    "authentication_error": {"category": "AUTH", "retryable": false},
    "billing_error": {"category": "BILLING", "retryable": false},
    "permission_error": {"category": "PERMISSION", "retryable": false},
    "not_found_error": {"category": "NOT_FOUND", "retryable": false},
    "conflict_error": {"category": "CONFLICT", "retryable": "conditional"},
    "request_too_large": {"category": "PAYLOAD_TOO_LARGE", "retryable": false},
    "rate_limit_error": {"category": "RATE_LIMIT", "retryable": true},
    "api_error": {"category": "SERVER_ERROR", "retryable": true},
    "timeout_error": {"category": "TIMEOUT", "retryable": true},
    "overloaded_error": {"category": "OVERLOADED", "retryable": true}
  }
}
```

## Retry policy

Anthropic SDKs document automatic retry behavior for transient connection/rate/5xx classes. Cyrene should still impose a bounded retry budget and honor `Retry-After`.

## Unknown fallback

`未知 Anthropic 错误。请保留 error.type、原始 message 和 request_id，并查询 Anthropic API 文档。`

## Sources

- https://docs.anthropic.com/en/api/errors
