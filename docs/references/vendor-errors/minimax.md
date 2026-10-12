# Cyrene Error Map — MiniMax

> Last verified: 2026-09-27  
> Evidence: **mixed-confidence**. MiniMax's currently indexed public docs do not expose a stable, complete canonical error-code table in this research pass. The exact codes below are supported by MiniMax-owned community surfaces and observed API responses; they should be versioned and periodically revalidated.  
> Scope: MiniMax direct/compatibility APIs.

## Parsing priority

1. Transport/runtime failure
2. Native `base_resp.status_code` / compatibility `error.type`
3. HTTP status
4. `base_resp.status_msg` / error message
5. `UNKNOWN`

MiniMax native responses can return HTTP success while carrying a non-zero business error in `base_resp.status_code`. Therefore **never treat HTTP 200 as proof of success**.

Example shape observed on MiniMax-owned surfaces:

```json
{
  "base_resp": {
    "status_code": 2049,
    "status_msg": "invalid api key"
  }
}
```

## Codes with strong observed support on MiniMax-owned surfaces

| Business code | Observed meaning | Cyrene category | Retryable | Confidence |
|---:|---|---|---|---|
| `0` | Success | — | — | High |
| `1008` | Insufficient balance | `BILLING` | No | High observed |
| `2013` | Invalid parameters / model/message/context validation | `INVALID_REQUEST` or `CONTEXT_LIMIT` | No | High observed |
| `2049` | Invalid API key | `AUTH` | No | High observed |
| `2062` | Request rejected / Token Plan traffic or entitlement state | `RATE_LIMIT` / `QUOTA` / `BILLING` | Conditional | High observed |

### `2013` nuance

`2013` is broad. MiniMax-owned community examples show it for:

- invalid message role,
- invalid/unsupported model parameters,
- context-window limit violations.

Therefore inspect `status_msg`:

- contains `context window`, `max tokens`, `context` → `CONTEXT_LIMIT`
- otherwise → `INVALID_REQUEST`

### `2062` nuance

`2062` has been observed for both traffic rejection and Token Plan entitlement/subscription state. Inspect message:

- traffic high / retry shortly → `RATE_LIMIT`, retry with backoff
- no active token plan / subscription/entitlement wording → `BILLING` or `QUOTA`, do not loop-retry

## Compatibility endpoint handling

When MiniMax is used through an OpenAI- or Anthropic-compatible endpoint, first parse the compatibility envelope (`error.type`, HTTP status), but still preserve any numeric MiniMax code embedded in the message (for example `(2013)`), because that code can be more diagnostic.

## JSON-ready map

```json
{
  "provider": "minimax",
  "business_codes": {
    "1008": {"category": "BILLING", "retryable": false, "confidence": "observed-minimax-owned"},
    "2013": {"category": "INVALID_REQUEST", "retryable": false, "confidence": "observed-minimax-owned"},
    "2049": {"category": "AUTH", "retryable": false, "confidence": "observed-minimax-owned"},
    "2062": {"category": "RATE_LIMIT", "retryable": "conditional", "confidence": "observed-minimax-owned"}
  },
  "message_overrides": [
    {"code": "2013", "contains": ["context", "max tokens"], "category": "CONTEXT_LIMIT"},
    {"code": "2062", "contains": ["no active token plan", "subscription", "entitlement"], "category": "BILLING", "retryable": false}
  ]
}
```

## Production recommendation

For MiniMax, make the mapping data remotely/version-updatable rather than compiled permanently into Cyrene. This provider is exactly where a confidence/source field is useful:

```json
{
  "code": "2013",
  "sourceConfidence": "observed-minimax-owned",
  "lastVerifiedAt": "2026-09-27"
}
```

## Unknown fallback

`未知 MiniMax 错误。请检查 base_resp.status_code、status_msg、HTTP 状态以及兼容层 error.type，并查询 MiniMax 当前文档。`

## Sources

MiniMax-owned surfaces used for cross-checking observed codes:

- https://www.minimax.io/community/m/1509790584766861322 — `2013` invalid params
- https://www.minimax.io/community/m/1511354088288288840 — `2062` request rejected / high traffic
- https://www.minimax.io/community/m/1526451464418099341 — `1008` insufficient balance
- https://www.minimax.io/community/m/1538700759024009366 — `2062` token-plan entitlement state
- MiniMax-owned Agent/API observation for `2049` invalid API key: https://agent.minimax.io/share/305327921160401
