# Cyrene Error Map — Google Gemini

> Last verified: 2026-09-27  
> Evidence: **official Google AI for Developers documentation**  
> Scope: Gemini API; notes distinguish newer Interactions-style codes from legacy GenerateContent error envelopes.

## Parsing priority

1. Transport/runtime failure
2. Structured `error.code` (Interactions) or `error.status` / error details (GenerateContent)
3. HTTP status
4. `error.message`
5. `UNKNOWN`

## Interactions-style standard error codes

| `error.code` | HTTP | Cyrene category | Retryable |
|---|---:|---|---|
| `invalid_request` | `400` | `INVALID_REQUEST` | No |
| `failed_precondition` | `400` | `INVALID_REQUEST` | No |
| `parameter_unknown` | `400` | `INVALID_REQUEST` | No |
| `authentication` | `401` | `AUTH` | No |
| `payment_required` | `402` | `BILLING` | No |
| `permission_denied` | `403` | `PERMISSION` | No |
| `not_found` | `404` | `NOT_FOUND` | No |
| `model_not_found` | `404` | `NOT_FOUND` | No |
| `out_of_range` | `416` | `INVALID_REQUEST` | No |
| `already_exists` | `409` | `CONFLICT` | Conditional |
| `aborted` | `409` | `CONFLICT` | Conditional |
| `rate_limit_exceeded` | `429` | `RATE_LIMIT` | Yes |
| `quota_exceeded` | `429` | `QUOTA` | Conditional |
| `too_many_requests` | `429` | `RATE_LIMIT` | Yes |
| `cancelled` | `499` | `CANCELLED` | No |
| `api_error` | `500` | `SERVER_ERROR` | Yes |
| `unimplemented` | `501` | `INVALID_REQUEST` / `UNAVAILABLE` | No |
| `service_unavailable` | `503` | `UNAVAILABLE` | Yes |
| `deadline_exceeded` | `504` | `TIMEOUT` | Yes |

## Generation blocked / generation error signals

When explicitly returned by the API, map these to more specific categories instead of generic 4xx/5xx:

### Content-policy family → `CONTENT_POLICY`

- `safety`
- `recitation`
- `language`
- `prohibited_content`
- `spii`
- `blocklist`
- `image_safety`
- `image_prohibited_content`
- `image_recitation`
- `image_other`
- `content_blocked`

### Request/tool-output family → `INVALID_REQUEST`

- `malformed_function_call`
- `malformed_tool_call`
- `unexpected_tool_call`
- `no_image`
- `too_many_tool_calls`
- `missing_thought_signature`

## Legacy GenerateContent note

Legacy Google-style errors can expose:

- numeric `error.code` (often HTTP-like),
- enum `error.status` such as `INVALID_ARGUMENT`,
- `error.message`,
- structured `details` such as `ErrorInfo.reason` (for example invalid API key reasons).

Prefer the most specific structured reason over the numeric status.

## JSON-ready map

```json
{
  "provider": "gemini",
  "codes": {
    "invalid_request": {"category": "INVALID_REQUEST", "retryable": false},
    "failed_precondition": {"category": "INVALID_REQUEST", "retryable": false},
    "authentication": {"category": "AUTH", "retryable": false},
    "payment_required": {"category": "BILLING", "retryable": false},
    "permission_denied": {"category": "PERMISSION", "retryable": false},
    "not_found": {"category": "NOT_FOUND", "retryable": false},
    "model_not_found": {"category": "NOT_FOUND", "retryable": false},
    "rate_limit_exceeded": {"category": "RATE_LIMIT", "retryable": true},
    "quota_exceeded": {"category": "QUOTA", "retryable": "conditional"},
    "too_many_requests": {"category": "RATE_LIMIT", "retryable": true},
    "cancelled": {"category": "CANCELLED", "retryable": false},
    "api_error": {"category": "SERVER_ERROR", "retryable": true},
    "service_unavailable": {"category": "UNAVAILABLE", "retryable": true},
    "deadline_exceeded": {"category": "TIMEOUT", "retryable": true}
  }
}
```

## Retry policy

Google recommends retrying transient `429`, `503`, and similar temporary failures with exponential backoff/jitter. Do not auto-retry persistent `400/402/403` until the request/account condition changes.

## Unknown fallback

`未知 Gemini 错误。请检查 error.code、error.status、details、HTTP 状态并查询 Gemini API 文档。`

## Sources

- https://ai.google.dev/gemini-api/docs/api-errors
- https://ai.google.dev/gemini-api/docs/generate-content/api-errors
- https://ai.google.dev/gemini-api/docs/troubleshooting
