# Cyrene Error Map — DeepSeek

> Last verified: 2026-09-27  
> Evidence: **official DeepSeek API documentation**  
> Scope: DeepSeek direct API.

## Parsing priority

1. Transport/runtime failure
2. HTTP status
3. Structured response `error.code` / `error.message` when present
4. `UNKNOWN`

DeepSeek publishes a compact HTTP-level error table, so HTTP status is unusually useful here.

## Official error mapping

| Signal | Meaning | Cyrene category | Retryable | Suggested user message |
|---|---|---:|---:|---|
| HTTP `400` | Invalid request/body format | `INVALID_REQUEST` | No | 请求格式无效，请检查请求体。 |
| HTTP `401` | Authentication failed | `AUTH` | No | DeepSeek 认证失败，请检查 API Key。 |
| HTTP `402` | Insufficient balance | `BILLING` | No | DeepSeek 账户余额不足，请充值或检查计费账户。 |
| HTTP `422` | Invalid parameters | `INVALID_REQUEST` | No | 请求参数无效，请检查参数名称、类型和取值。 |
| HTTP `429` | Rate limit reached | `RATE_LIMIT` | Yes | 请求过于频繁，请稍后重试。 |
| HTTP `500` | Server error | `SERVER_ERROR` | Yes | DeepSeek 服务发生内部错误，请稍后重试。 |
| HTTP `503` | Server overloaded | `OVERLOADED` | Yes | DeepSeek 当前负载较高，请稍后重试。 |

## Additional structured signals

For APIs that expose structured failure/incomplete state, preserve the nested code/message. In Responses-style flows, an incomplete reason such as `max_output_tokens` should be represented separately from transport errors; content filtering should map to `CONTENT_POLICY` when explicitly returned by the API.

## JSON-ready map

```json
{
  "provider": "deepseek",
  "http": {
    "400": {"category": "INVALID_REQUEST", "retryable": false},
    "401": {"category": "AUTH", "retryable": false},
    "402": {"category": "BILLING", "retryable": false},
    "422": {"category": "INVALID_REQUEST", "retryable": false},
    "429": {"category": "RATE_LIMIT", "retryable": true},
    "500": {"category": "SERVER_ERROR", "retryable": true},
    "503": {"category": "OVERLOADED", "retryable": true}
  }
}
```

## Retry policy

- `429`: exponential backoff + jitter; honor `Retry-After` if supplied.
- `500/503`: bounded retry.
- `400/401/402/422`: do not blindly retry; configuration/request must change.

## Unknown fallback

`未知 DeepSeek 错误。请检查错误码、原始错误信息并查询 DeepSeek 官方文档。`

## Sources

- https://api-docs.deepseek.com/quick_start/error_codes/
- https://api-docs.deepseek.com/zh-cn/quick_start/error_codes/
