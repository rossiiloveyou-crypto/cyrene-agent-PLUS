# Cyrene — Vendor Error Knowledge Base

> Last verified: 2026-09-27  
> Scope: direct vendor APIs / official compatibility endpoints. Third-party gateways are intentionally excluded.  
> Goal: normalize heterogeneous provider failures into stable Cyrene categories. This folder records vendor signals and source evidence; Cyrene-specific display and data-handling rules are defined in [`docs/specs/2026-09-27-main-model-provider-error-map.md`](../../specs/2026-09-27-main-model-provider-error-map.md).

## Recommended normalization order

Do **not** classify only by HTTP status. Use the following precedence:

1. Transport/runtime error (`DNS`, TLS, connection reset, client timeout, abort)
2. Exact vendor business code / `error.type` / `error.code`
3. HTTP status
4. Structured vendor message fields
5. Conservative message keyword fallback
6. `UNKNOWN`

Why: the same HTTP status can mean different things. For example, a `429` can represent transient rate limiting, permanent/long-lived quota exhaustion, billing limits, or service overload depending on the provider and inner code.

## Cyrene normalized categories

| Category | Meaning | Typical retry behavior |
|---|---|---|
| `AUTH` | API key/token/authentication failure | No, fix credentials |
| `PERMISSION` | Account/model/region/workspace access denied | No, fix access/config |
| `BILLING` | Balance, spend cap, subscription/payment problem | No, fix billing |
| `INVALID_REQUEST` | Invalid/missing parameters, malformed body, wrong endpoint mode | No, fix request |
| `NOT_FOUND` | Model/resource/endpoint not found | No, fix resource/config |
| `CONTENT_POLICY` | Safety/content policy filtering | Usually no automatic retry |
| `RATE_LIMIT` | RPM/TPM/concurrency/burst throttling | Yes, backoff and honor `Retry-After` |
| `QUOTA` | Usage allowance exhausted | Conditional; usually wait/reset/upgrade |
| `CONTEXT_LIMIT` | Context/max-token limit exceeded | No, shrink request |
| `PAYLOAD_TOO_LARGE` | Request/file/body exceeds size limit | No, reduce payload |
| `CONFLICT` | Conflicting/duplicate request state | Conditional |
| `TIMEOUT` | Provider-side deadline/timeout | Yes, bounded retry |
| `OVERLOADED` | Provider capacity overloaded | Yes, backoff/jitter |
| `SERVER_ERROR` | Provider internal failure | Yes, bounded retry |
| `NETWORK` | Transport/network failure | Yes, bounded retry |
| `UNAVAILABLE` | Service/model/endpoint temporarily unavailable | Yes, bounded retry |
| `CANCELLED` | Client/request cancelled | Usually no |
| `UNKNOWN` | Cannot classify safely | Conservative; show raw details |

## Canonical normalized object

```ts
export type CyreneErrorCategory =
  | "AUTH"
  | "PERMISSION"
  | "BILLING"
  | "INVALID_REQUEST"
  | "NOT_FOUND"
  | "CONTENT_POLICY"
  | "RATE_LIMIT"
  | "QUOTA"
  | "CONTEXT_LIMIT"
  | "PAYLOAD_TOO_LARGE"
  | "CONFLICT"
  | "TIMEOUT"
  | "OVERLOADED"
  | "SERVER_ERROR"
  | "NETWORK"
  | "UNAVAILABLE"
  | "CANCELLED"
  | "UNKNOWN";

export interface CyreneError {
  provider: string;
  category: CyreneErrorCategory;
  retryable: boolean | "conditional";
  severity: "info" | "warning" | "error" | "fatal";

  httpStatus?: number;
  vendorCode?: string;
  vendorType?: string;
  rawMessage?: string;
  requestId?: string;

  userTitle: string;
  userMessage: string;
  docsUrl?: string;
}
```

## Universal fallback

If no exact rule matches, preserve every diagnostic field and return:

```json
{
  "category": "UNKNOWN",
  "retryable": "conditional",
  "severity": "error",
  "userTitle": "未知厂商错误",
  "userMessage": "服务返回了尚未识别的错误。请检查错误码并查询厂商文档。"
}
```

Recommended UI details:

- Provider name
- HTTP status (if any)
- Vendor error code/type
- Raw vendor message
- Request/trace ID
- `复制诊断信息`
- `查看厂商文档`

The source material recommends retaining raw errors for diagnosis. In Cyrene, do not forward or display a whole raw error by default: it may contain prompts or other sensitive data. Follow the project mapping spec's safe-field allowlist and require a separate redaction design before adding copyable diagnostics.

## Files

- `minimax.md`
- `mimo.md`
- `doubao-seed.md`
- `glm.md`
- `kimi.md`
- `deepseek.md`
- `grok-xai.md`
- `openai-gpt.md`
- `claude-anthropic.md`
- `qwen.md`
- `gemini.md`

## Maintenance rule

Treat these maps as versioned knowledge. Store `last_verified_at` and source URLs, and allow vendor-specific overrides to be updated independently from the application release when possible.
