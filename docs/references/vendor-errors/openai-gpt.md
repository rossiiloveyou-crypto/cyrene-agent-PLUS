# Cyrene Error Map — OpenAI GPT

> Last verified: 2026-09-27  
> Evidence: **official OpenAI developer documentation**  
> Scope: OpenAI API, including SDK error classes and documented API error codes.

## Parsing priority

1. SDK/transport exception (`APIConnectionError`, `APITimeoutError`, etc.)
2. Exact `error.code` / `error.type`
3. HTTP status
4. `error.message`
5. `UNKNOWN`

Do not classify every `429` as a transient rate limit: OpenAI documents billing/spend-limit and usage-limit variants under 429 as well.

## High-value exact mappings

| HTTP | Inner signal | Cyrene category | Retryable | Notes |
|---:|---|---|---|---|
| `400` | invalid request / invalid `service_tier` | `INVALID_REQUEST` | No | Fix request/project configuration |
| `401` | invalid authentication / incorrect API key | `AUTH` | No | Fix credentials |
| `401` | org membership required / IP not authorized | `PERMISSION` | No | Fix org/IP access |
| `403` | unsupported country/region | `PERMISSION` | No | Region access restriction |
| `404` | SDK `NotFoundError` | `NOT_FOUND` | No | Resource/model endpoint issue |
| `409` | SDK `ConflictError` | `CONFLICT` | Conditional | State conflict |
| `429` | ordinary rate limit | `RATE_LIMIT` | Yes | Backoff |
| `429` | code `slow_down` | `RATE_LIMIT` | Yes | Ramp too quickly |
| `429` | `credit_balance_exhausted` | `BILLING` | No | Add credits/change billing |
| `429` | org/project spend limit exceeded | `BILLING` | No | Increase limit/change project |
| `429` | organization usage limit exceeded | `QUOTA` | Conditional | Wait/reset/raise limit |
| `500` | server/internal error | `SERVER_ERROR` | Yes | Bounded retry |
| `503` | `service_unavailable_error` / `server_is_overloaded` | `OVERLOADED` | Yes | Backoff |

## SDK exception mapping

| SDK class | Cyrene category |
|---|---|
| `APIConnectionError` | `NETWORK` |
| `APITimeoutError` | `TIMEOUT` |
| `AuthenticationError` | `AUTH` |
| `BadRequestError` | `INVALID_REQUEST` |
| `ConflictError` | `CONFLICT` |
| `InternalServerError` | `SERVER_ERROR` |
| `NotFoundError` | `NOT_FOUND` |
| `PermissionDeniedError` | `PERMISSION` |
| `RateLimitError` | inspect body: `RATE_LIMIT` / `BILLING` / `QUOTA` |

## JSON-ready map

```json
{
  "provider": "openai",
  "codes": {
    "credit_balance_exhausted": {"category": "BILLING", "retryable": false},
    "slow_down": {"category": "RATE_LIMIT", "retryable": true},
    "organization_spend_limit_exceeded": {"category": "BILLING", "retryable": false},
    "project_spend_limit_exceeded": {"category": "BILLING", "retryable": false},
    "organization_usage_limit_exceeded": {"category": "QUOTA", "retryable": "conditional"},
    "server_is_overloaded": {"category": "OVERLOADED", "retryable": true}
  },
  "http_fallback": {
    "400": "INVALID_REQUEST",
    "401": "AUTH",
    "403": "PERMISSION",
    "404": "NOT_FOUND",
    "409": "CONFLICT",
    "429": "RATE_LIMIT",
    "500": "SERVER_ERROR",
    "503": "UNAVAILABLE"
  }
}
```

## Retry policy

- Transient 429/5xx/connection errors: exponential backoff + jitter.
- Do **not** retry indefinitely on balance/spend/usage-limit codes.
- Preserve request IDs and structured error code/type.

## Unknown fallback

`未知 OpenAI 错误。请检查 HTTP 状态、error.type、error.code、request ID 并查询 OpenAI API 文档。`

## Sources

- https://developers.openai.com/api/docs/guides/error-codes
- https://help.openai.com/en/collections/3808446-api-error-codes-explained
