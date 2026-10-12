# Cyrene Error Map — GLM / Zhipu AI

> Last verified: 2026-09-27  
> Evidence: **mixed**. Zhipu's standalone official error-code page was not reliably machine-indexable during this pass. The business-code table below was cross-checked against Alibaba Cloud Model Studio's official GLM-Zhipu provider documentation, which explicitly labels these as Zhipu-specific business codes.  
> Recommendation: revalidate against Zhipu's current official API docs before treating the map as immutable.

## Parsing priority

1. Transport/runtime failure
2. Exact business `error.code`
3. HTTP status
4. Error message
5. `UNKNOWN`

GLM has a useful business-code layer. Do not stop at HTTP status.

## Authentication codes

| Code | Meaning | Cyrene category | Retryable |
|---:|---|---|---|
| `1000` | Authentication failed | `AUTH` | No |
| `1001` | Authentication header missing | `AUTH` | No |
| `1002` | Authentication token invalid | `AUTH` | No |
| `1003` | Authentication token expired | `AUTH` | No |
| `1004` | Authentication token verification failed | `AUTH` | No |

## Account codes

| Code | Meaning | Cyrene category | Retryable |
|---:|---|---|---|
| `1100` | Account access/read-write issue family | `PERMISSION` | Conditional |
| `1110` | Account inactive | `PERMISSION` | No |
| `1111` | Account does not exist | `AUTH` / `PERMISSION` | No |
| `1112` | Account locked | `PERMISSION` | No |
| `1113` | Account overdue | `BILLING` | No |
| `1120` | Account access failure | `UNAVAILABLE` | Yes |
| `1121` | Account violation/locked | `PERMISSION` | No |

## API / request codes

| Code | Meaning | Cyrene category | Retryable |
|---:|---|---|---|
| `1200` | API call error family | `INVALID_REQUEST` | Conditional |
| `1210` | API parameter error | `INVALID_REQUEST` | No |
| `1211` | Model does not exist | `NOT_FOUND` | No |
| `1212` | Model does not support method | `INVALID_REQUEST` | No |
| `1213` | Required field missing | `INVALID_REQUEST` | No |
| `1214` | Field invalid | `INVALID_REQUEST` | No |
| `1215` | Mutually exclusive fields used together | `INVALID_REQUEST` | No |
| `1220` | No permission for API | `PERMISSION` | No |
| `1221` | API offline | `UNAVAILABLE` | Yes |
| `1222` | API does not exist | `NOT_FOUND` | No |
| `1230` | API call-flow error | `INVALID_REQUEST` | Conditional |
| `1231` | Duplicate existing request | `CONFLICT` | Conditional |
| `1234` | Network error | `NETWORK` | Yes |
| `1261` | Prompt/context too long | `CONTEXT_LIMIT` | No |

## Policy / limit / plan codes

| Code | Meaning | Cyrene category | Retryable |
|---:|---|---|---|
| `1300` | Blocked by policy | `CONTENT_POLICY` | No |
| `1301` | Unsafe/sensitive input or output | `CONTENT_POLICY` | No |
| `1302` | Concurrency too high | `RATE_LIMIT` | Yes |
| `1303` | Request frequency too high | `RATE_LIMIT` | Yes |
| `1304` | Daily call-count quota reached | `QUOTA` | Conditional |
| `1305` | Traffic limit | `RATE_LIMIT` | Yes |
| `1308` | Usage limit reached until reset | `QUOTA` | Conditional |
| `1309` | GLM Coding Plan expired | `BILLING` | No |
| `1310` | Weekly/monthly usage cap reached | `QUOTA` | Conditional |
| `1311` | Plan has no access to model | `PERMISSION` | No |
| `1312` | Model overloaded | `OVERLOADED` | Yes |
| `1313` | Fair-use restriction | `QUOTA` / `RATE_LIMIT` | Conditional |

`500` is also documented as an internal-error family and should map to `SERVER_ERROR` if no finer business code is available.

## JSON-ready map (core)

```json
{
  "provider": "glm",
  "codes": {
    "1000": {"category": "AUTH", "retryable": false},
    "1001": {"category": "AUTH", "retryable": false},
    "1002": {"category": "AUTH", "retryable": false},
    "1003": {"category": "AUTH", "retryable": false},
    "1004": {"category": "AUTH", "retryable": false},
    "1113": {"category": "BILLING", "retryable": false},
    "1210": {"category": "INVALID_REQUEST", "retryable": false},
    "1211": {"category": "NOT_FOUND", "retryable": false},
    "1220": {"category": "PERMISSION", "retryable": false},
    "1231": {"category": "CONFLICT", "retryable": "conditional"},
    "1234": {"category": "NETWORK", "retryable": true},
    "1261": {"category": "CONTEXT_LIMIT", "retryable": false},
    "1300": {"category": "CONTENT_POLICY", "retryable": false},
    "1301": {"category": "CONTENT_POLICY", "retryable": false},
    "1302": {"category": "RATE_LIMIT", "retryable": true},
    "1303": {"category": "RATE_LIMIT", "retryable": true},
    "1304": {"category": "QUOTA", "retryable": "conditional"},
    "1308": {"category": "QUOTA", "retryable": "conditional"},
    "1309": {"category": "BILLING", "retryable": false},
    "1310": {"category": "QUOTA", "retryable": "conditional"},
    "1311": {"category": "PERMISSION", "retryable": false},
    "1312": {"category": "OVERLOADED", "retryable": true}
  }
}
```

## Unknown fallback

`未知 GLM 错误。请检查业务 code、HTTP 状态、原始 message 和请求 ID，并查询智谱当前官方文档。`

## Sources

- Cross-check source: https://help.aliyun.com/zh/model-studio/glm-zhipu
- Vendor docs entry point: https://docs.bigmodel.cn/
