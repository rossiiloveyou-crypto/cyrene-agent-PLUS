# Cyrene Error Map — Qwen / Alibaba Cloud Model Studio

> Last verified: 2026-09-27  
> Evidence: **official Alibaba Cloud Model Studio documentation**  
> Scope: Qwen through Model Studio / DashScope and documented compatibility APIs.

## Parsing priority

1. Transport/runtime failure
2. Exact `code` / `Code`
3. HTTP status
4. `message`
5. `UNKNOWN`

Qwen/Model Studio has a large business-code surface. The business code is substantially more useful than HTTP status, especially for `429` and `500`.

## Authentication / permission / resource

| HTTP | Code | Cyrene category | Retryable |
|---:|---|---|---|
| `401` | `InvalidApiKey` / `invalid_api_key` | `AUTH` | No |
| `403` | `AccessDenied` / `access_denied` | `PERMISSION` | No |
| `403` | `AccessDenied.Unpurchased` | `BILLING` / `PERMISSION` | No |
| `403` | `Model.AccessDenied` | `PERMISSION` | No |
| `403` | `App.AccessDenied` | `PERMISSION` | No |
| `403` | `Workspace.AccessDenied` | `PERMISSION` | No |
| `403` | `Endpoint.AccessDenied` | `PERMISSION` | No |
| `403` | `AllocationQuota.FreeTierOnly` | `QUOTA` | No |
| `404` | `ModelNotFound` / `model_not_found` | `NOT_FOUND` | No |
| `404` | `model_not_supported` | `INVALID_REQUEST` | No |
| `404` | `WorkSpaceNotFound` / `NotFound` | `NOT_FOUND` | No |
| `409` | `Conflict` | `CONFLICT` | Conditional |

## 429 — must inspect exact code

| Code | Meaning | Cyrene category | Retryable |
|---|---|---|---|
| `Throttling` | Generic throttling | `RATE_LIMIT` | Yes |
| `Throttling.RateQuota` | Rate quota | `RATE_LIMIT` | Yes |
| `LimitRequests` / `limit_requests` | Request-rate limit | `RATE_LIMIT` | Yes |
| `Throttling.BurstRate` / `limit_burst_rate` | Burst/ramp limit | `RATE_LIMIT` | Yes |
| `Throttling.Concurrency` | Concurrency limit | `RATE_LIMIT` | Yes |
| `Throttling.ServiceOverloaded` | Service overloaded | `OVERLOADED` | Yes |
| `ResourceExhausted` / `Throttling.ResourceExhausted` | Resource quota exhausted | `QUOTA` / `RATE_LIMIT` | Conditional |
| `Throttling.AllocationQuota` / `insufficient_quota` | Allocation/free/TPM/TPS quota exhausted | `QUOTA` | Conditional |
| `CommodityNotPurchased` | Product not purchased | `BILLING` | No |
| `PrepaidBillOverdue` | Prepaid billing overdue | `BILLING` | No |

## 500 / 503 / 504 families

| Code | Cyrene category | Retryable |
|---|---|---|
| `InternalError.Timeout` | `TIMEOUT` | Yes |
| `InternalError.Configuration` | `SERVER_ERROR` | Yes |
| `InternalError.DataInspection` | `SERVER_ERROR` / `CONTENT_POLICY` depending body | Conditional |
| `InternalError.TranslationFailed` | `SERVER_ERROR` | Yes |
| `SystemError` | `SERVER_ERROR` | Yes |
| `ModelServiceFailed` | `SERVER_ERROR` | Yes |
| `RequestTimeOut` / `ResponseTimeout` | `TIMEOUT` | Yes |
| `ServiceUnavailable` | `UNAVAILABLE` | Yes |
| `ModelUnavailable` | `UNAVAILABLE` | Yes |
| `GatewayTimeout.InputDownload` | `TIMEOUT` | Yes |

Also map `BadRequest.TooLarge` to `PAYLOAD_TOO_LARGE`.

## JSON-ready map (core subset)

```json
{
  "provider": "qwen",
  "codes": {
    "InvalidApiKey": {"category": "AUTH", "retryable": false},
    "invalid_api_key": {"category": "AUTH", "retryable": false},
    "AccessDenied": {"category": "PERMISSION", "retryable": false},
    "ModelNotFound": {"category": "NOT_FOUND", "retryable": false},
    "Throttling.RateQuota": {"category": "RATE_LIMIT", "retryable": true},
    "Throttling.BurstRate": {"category": "RATE_LIMIT", "retryable": true},
    "Throttling.Concurrency": {"category": "RATE_LIMIT", "retryable": true},
    "Throttling.ServiceOverloaded": {"category": "OVERLOADED", "retryable": true},
    "Throttling.AllocationQuota": {"category": "QUOTA", "retryable": "conditional"},
    "insufficient_quota": {"category": "QUOTA", "retryable": "conditional"},
    "CommodityNotPurchased": {"category": "BILLING", "retryable": false},
    "PrepaidBillOverdue": {"category": "BILLING", "retryable": false},
    "InternalError.Timeout": {"category": "TIMEOUT", "retryable": true},
    "ServiceUnavailable": {"category": "UNAVAILABLE", "retryable": true},
    "ModelUnavailable": {"category": "UNAVAILABLE", "retryable": true},
    "BadRequest.TooLarge": {"category": "PAYLOAD_TOO_LARGE", "retryable": false}
  }
}
```

## Configuration traps worth surfacing

- API keys/base URLs can be region- or product-specific.
- OpenAI-compatible and native DashScope modes may return different envelope shapes.
- A model/deployment name mismatch can resemble a generic `404`.

Preserve `request_id`/request ID whenever available.

## Unknown fallback

`未知 Qwen/Model Studio 错误。请检查业务错误码、HTTP 状态、request_id 并查询阿里云 Model Studio 错误码文档。`

## Sources

- https://help.aliyun.com/zh/model-studio/error-code
