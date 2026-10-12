# Cyrene Error Map — Kimi / Moonshot AI

> Last verified: 2026-09-27  
> Evidence: **official Kimi/Moonshot help documentation**  
> Scope: Kimi direct API (China and international endpoints).

## Parsing priority

1. Transport/runtime failure
2. Nested `error.type`
3. HTTP status
4. `error.message`
5. `UNKNOWN`

Typical error body:

```json
{
  "error": {
    "type": "error_type",
    "message": "error_message"
  }
}
```

## HTTP baseline

| HTTP | Default Cyrene category | Retryable |
|---:|---|---|
| `400` | `INVALID_REQUEST` | No |
| `401` | `AUTH` | No |
| `403` | `PERMISSION` / `BILLING` | No |
| `404` | `NOT_FOUND` | No |
| `429` | inspect `error.type` | Conditional |
| `499` | `CANCELLED` / `NETWORK` | Conditional |
| `500` | `SERVER_ERROR` | Yes |
| `503` | `UNAVAILABLE` | Yes |

## Important `error.type` mappings

| `error.type` | Meaning | Cyrene category | Retryable |
|---|---|---|---|
| `invalid_authentication_error` | Invalid auth / wrong regional key or endpoint | `AUTH` | No |
| `model_not_found` | Model/base URL mismatch or unavailable model | `NOT_FOUND` | No |
| `engine_overloaded_error` | Provider node overloaded | `OVERLOADED` | Yes |
| `rate_limit_reached_error` | Concurrency/RPM/TPM/TPD limit | `RATE_LIMIT` | Yes |
| `exceeded_current_quota_error` | Balance/overdue/voucher/usage quota | `BILLING` / `QUOTA` | No/Conditional |
| `content_filter` | Safety/content filtering | `CONTENT_POLICY` | Usually no |

## Regional endpoint trap

Kimi documents different China/international base URLs and keys are not interchangeable. A credential can therefore be valid but used against the wrong platform, producing an authentication-style failure. Record the configured base URL in diagnostics.

## JSON-ready map

```json
{
  "provider": "kimi",
  "types": {
    "invalid_authentication_error": {"category": "AUTH", "retryable": false},
    "model_not_found": {"category": "NOT_FOUND", "retryable": false},
    "engine_overloaded_error": {"category": "OVERLOADED", "retryable": true},
    "rate_limit_reached_error": {"category": "RATE_LIMIT", "retryable": true},
    "exceeded_current_quota_error": {"category": "QUOTA", "retryable": false},
    "content_filter": {"category": "CONTENT_POLICY", "retryable": false}
  }
}
```

## Retry policy

- Honor `Retry-After` when present.
- `engine_overloaded_error` and `rate_limit_reached_error`: exponential backoff + jitter.
- `exceeded_current_quota_error`: do not loop-retry; show balance/quota action.

## Unknown fallback

`未知 Kimi 错误。请保留 error.type、message、request_id 与 Base URL，并查询 Kimi API 文档。`

## Sources

- https://www.kimi.ai/help/kimi-api/api-error-codes
- https://www.kimi.ai/help/kimi-api/api-troubleshooting
