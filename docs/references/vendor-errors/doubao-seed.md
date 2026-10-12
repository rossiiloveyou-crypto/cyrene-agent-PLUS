# Cyrene Error Map — Doubao Seed / Volcengine Ark

> Last verified: 2026-09-27  
> Evidence: **official Volcengine Ark documentation**  
> Scope: Doubao Seed models through Ark direct API.

## Parsing priority

1. Transport/runtime failure
2. Exact Ark `Code`/error code
3. HTTP status
4. Message text
5. `UNKNOWN`

For Ark, the business code is more precise than HTTP status. In particular, multiple `429` codes mean different things.

## High-value Ark mappings

| HTTP | Ark code | Meaning | Cyrene category | Retryable |
|---:|---|---|---|---|
| `400` | `MissingParameter` | Required parameter missing | `INVALID_REQUEST` | No |
| `400` | `InvalidParameter` | Invalid parameter | `INVALID_REQUEST` | No |
| `400` | `InvalidEndpoint.ClosedEndpoint` | Endpoint closed/unavailable | `UNAVAILABLE` | Conditional |
| `400` | `InvalidSubscription` | Coding Plan not subscribed/expired | `BILLING` | No |
| `401` | `AuthenticationError` | Missing/invalid API key or AK/SK | `AUTH` | No |
| `429` | `QuotaExceeded` | Trial/task/usage quota exhausted | `QUOTA` | Conditional |
| `429` | `ServerOverloaded` | Service resource pressure / overload | `OVERLOADED` | Yes |
| `429` | `RequestBurstTooFast` | Burst traffic too fast (newer Seed traffic behavior) | `RATE_LIMIT` | Yes |

## Suggested user messages

- `MissingParameter` / `InvalidParameter`: `请求参数无效，请检查 Ark 请求参数。`
- `AuthenticationError`: `火山方舟认证失败，请检查 API Key 或 AK/SK。`
- `QuotaExceeded`: `当前 Ark 配额已耗尽，请检查额度或等待配额恢复。`
- `ServerOverloaded`: `Doubao Seed 当前服务负载较高，请稍后重试。`
- `RequestBurstTooFast`: `请求突发速度过快，请降低并发并逐步升流。`

## JSON-ready map

```json
{
  "provider": "doubao_seed",
  "codes": {
    "MissingParameter": {"category": "INVALID_REQUEST", "retryable": false},
    "InvalidParameter": {"category": "INVALID_REQUEST", "retryable": false},
    "InvalidEndpoint.ClosedEndpoint": {"category": "UNAVAILABLE", "retryable": "conditional"},
    "InvalidSubscription": {"category": "BILLING", "retryable": false},
    "AuthenticationError": {"category": "AUTH", "retryable": false},
    "QuotaExceeded": {"category": "QUOTA", "retryable": "conditional"},
    "ServerOverloaded": {"category": "OVERLOADED", "retryable": true},
    "RequestBurstTooFast": {"category": "RATE_LIMIT", "retryable": true}
  }
}
```

## Retry policy

- `ServerOverloaded` / `RequestBurstTooFast`: exponential backoff + jitter.
- `QuotaExceeded`: retry only if the quota can recover/reset; otherwise surface quota action.
- Parameter/auth/subscription problems: no automatic retry.

## Unknown fallback

`未知 Doubao Seed / Ark 错误。请检查 Ark 业务错误码和官方错误码文档。`

## Sources

- https://docs.volcengine.com/docs/ark/error-codes?lang=zh
