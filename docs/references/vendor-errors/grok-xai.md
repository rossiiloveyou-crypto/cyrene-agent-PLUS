# Cyrene Error Map — Grok / xAI

> Last verified: 2026-09-27  
> Evidence: **official xAI developer documentation**  
> Scope: xAI/Grok inference API; endpoint-specific notes are marked separately.

> The user-provided name `gork` is treated here as **Grok (xAI)**.

## Parsing priority

1. Transport/runtime failure
2. Structured error code/type if provided
3. HTTP status
4. Error message
5. `UNKNOWN`

## General xAI debugging mappings

| HTTP | Meaning | Cyrene category | Retryable |
|---:|---|---|---|
| `400` | Bad request; malformed body/URL parameter; xAI notes an incorrect API key can also surface here | `INVALID_REQUEST` / `AUTH` | No |
| `401` | Missing/invalid authentication token | `AUTH` | No |
| `403` | No permission / blocked team or key | `PERMISSION` | No |
| `404` | Model/resource/endpoint not found | `NOT_FOUND` | No |
| `405` | Method not allowed | `INVALID_REQUEST` | No |
| `415` | Unsupported media type / missing content type / empty body | `INVALID_REQUEST` | No |
| `422` | Field/value cannot be processed | `INVALID_REQUEST` | No |
| `429` | Rate limit | `RATE_LIMIT` | Yes |

## Endpoint-specific server failures

Some xAI endpoint docs also document:

| HTTP | Example endpoint behavior | Cyrene category | Retryable |
|---:|---|---|---|
| `413` | Payload too large (e.g. transcription) | `PAYLOAD_TOO_LARGE` | No |
| `500` | Server error | `SERVER_ERROR` | Yes |
| `502` | Upstream/bad-gateway style failure | `UNAVAILABLE` | Yes |
| `503` | Service/backend unavailable | `UNAVAILABLE` | Yes |

For asynchronous video generation, xAI documents structured failure codes including `invalid_argument`, `permission_denied`, `failed_precondition`, `service_unavailable`, and `internal_error`; map these before falling back to HTTP.

## Special 400 auth heuristic

Because xAI explicitly notes that a wrong API key can sometimes present as `400`, Cyrene should not blindly label all xAI 400 responses as `INVALID_REQUEST`. If the body clearly mentions API key/auth/token, override to `AUTH`.

## JSON-ready map

```json
{
  "provider": "xai_grok",
  "http": {
    "401": {"category": "AUTH", "retryable": false},
    "403": {"category": "PERMISSION", "retryable": false},
    "404": {"category": "NOT_FOUND", "retryable": false},
    "405": {"category": "INVALID_REQUEST", "retryable": false},
    "413": {"category": "PAYLOAD_TOO_LARGE", "retryable": false},
    "415": {"category": "INVALID_REQUEST", "retryable": false},
    "422": {"category": "INVALID_REQUEST", "retryable": false},
    "429": {"category": "RATE_LIMIT", "retryable": true},
    "500": {"category": "SERVER_ERROR", "retryable": true},
    "502": {"category": "UNAVAILABLE", "retryable": true},
    "503": {"category": "UNAVAILABLE", "retryable": true}
  },
  "structured_codes": {
    "invalid_argument": "INVALID_REQUEST",
    "permission_denied": "PERMISSION",
    "failed_precondition": "INVALID_REQUEST",
    "service_unavailable": "UNAVAILABLE",
    "internal_error": "SERVER_ERROR"
  }
}
```

## Unknown fallback

`未知 xAI/Grok 错误。请检查 HTTP 状态、原始错误体和请求 ID，并查询 xAI 官方文档。`

## Sources

- https://docs.x.ai/developers/debugging
- https://docs.x.ai/developers/model-capabilities/audio/text-to-speech
- https://docs.x.ai/developers/model-capabilities/audio/speech-to-text
- https://docs.x.ai/developers/model-capabilities/video/generation
