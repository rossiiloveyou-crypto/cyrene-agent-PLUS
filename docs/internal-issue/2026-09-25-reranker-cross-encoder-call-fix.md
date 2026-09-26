# Reranker 交叉编码器调用修复报告（bge-reranker-base 装了却不生效）（2026-09-25）

> 范围：`src/main/rag/reranker.ts`（打分链路）、`src/main/rag/retriever.ts`（调用方与静默降级）、
> `src/main/rag/model-status.ts`（模型识别）；依赖 `@xenova/transformers@2.17.2`。
> 触发场景：设置 → RAG / 文档导入 → Rerank 重排序选 `bge-reranker-base`，且 `models/bge-reranker-base/` 已装好。
> 结论：**两处缺陷叠加**，standard 模式的 reranker 必然静默失效（既不报错也不重排）。
> 已修复并在本机真实模型上实跑通过。

## TL;DR

| # | 缺陷 | 后果 | 修复 |
| --- | --- | --- | --- |
| 1 | 把 `[query, doc]` 配对数组直接喂给 `pipeline("text-classification")`，而该 pipeline 只接受字符串/字符串数组 | 每次精排抛 `TypeError: text.split is not a function`，被 `retriever.ts` 的 try/catch 吞掉 → 静默回退 hybrid 分数 | 改用 `AutoTokenizer(texts, { text_pair })` + `AutoModelForSequenceClassification` |
| 2 | 即使调用成功，pipeline 也会对唯一 logit 做 softmax | bge-reranker-base 是单标签回归（`num_labels=1`），softmax 结果恒为 `1.0` → 所有候选同分，排序不变 | 直接用模型原始 logits 作为相关性分数 |

两处缺陷互为叠加：**缺陷 1 让 reranker 永远抛错，缺陷 2 让"修好缺陷 1、继续用 pipeline"这条路也拿不到分数。**

---

## 1. 现象

用户在「设置 → RAG / 文档导入」里把 Rerank 切到 `bge-reranker-base`（界面显示「已下载 · 约 279MB」），
但检索结果与「关闭」时完全一致，控制台只有一行被捕获后的警告：

```text
[HybridRetriever] reranker failed, using hybrid scores: TypeError: text.split is not a function
    at Function._encode_text (node_modules/@xenova/transformers/src/tokenizers.js:2840:57)
    at Function._encode_plus (.../tokenizers.js:2894:29)
    at .../pipelines.js:284:35
```

因为 [retriever.ts](../../src/main/rag/retriever.ts) 的 `try { ... } catch (err) { console.warn(...) }` 只降级、不重抛，
所以 UI 侧没有任何可见失败——「装好了」和「没装」表现一模一样。

---

## 2. 根因

### 2.1 缺陷 1：配对输入用错了 API（必然抛错）

- `TextClassificationPipeline._call(texts, { topk })` 只把 `texts` 原样交给 tokenizer，
  **不透传任何 `text_pair` 之类的配对选项**（`node_modules/@xenova/transformers/src/pipelines.js` L279–L287）：

  ```js
  async _call(texts, { topk = 1 } = {}) {
      const model_inputs = this.tokenizer(texts, { padding: true, truncation: true });
      ...
  ```

- 句对（cross-encoder）的正确入口是 tokenizer 的 `text_pair` 选项
  （`node_modules/@xenova/transformers/src/tokenizers.js` L2666、L2701–L2715）：

  ```js
  text_pair = null, ...                       // L2666 文档注释
  encodedTokens = text.map((t, i) => this._encode_plus(t, text_pair[i], {...})); // L2709
  // text_pair 为 null 时：
  encodedTokens = text.map(x => this._encode_plus(x, null, {...}));             // L2714 → 这里炸
  ```

- 旧实现把 `[query, doc]` 数组当 `texts` 传进去，于是 `_encode_text` 收到的是数组而不是字符串，
  在 `text.split(...)` 处抛错（`tokenizers.js` L2840）。

### 2.2 缺陷 2：pipeline 的分数在单标签模型上恒为 1.0（即使不抛错也没用）

- `bge-reranker-base` 的 `config.json` 里 `num_labels = 1`、`id2label` 只有 `LABEL_0`。
- pipeline 走单标签分类分支对 logits 做 softmax（`pipelines.js` L293–L296）：

  ```js
  const function_to_apply =
      this.model.config.problem_type === 'multi_label_classification'
          ? batch => batch.sigmoid().data
          : batch => softmax(batch.data);   // 单标签：长度为 1 的向量 softmax([x]) === [1.0]
  ```

- softmax 对单元素向量恒等于 1.0，于是每个候选的 `score` 都是 `1.0`，
  `results.sort(...)` 变成空操作 → 「精排」等于没排。

---

## 3. 修复

改动集中在 [reranker.ts](../../src/main/rag/reranker.ts)：不再用 pipeline，改为直接持有
`tokenizer + model`，并用原始 logits 打分。

### 3.1 加载（before → after）

```ts
// before
const pipe = await pipeline("text-classification", modelDir, { quantized: true, cache_dir });

// after
const tokenizer = await AutoTokenizer.from_pretrained(modelDir, options);
const model = await AutoModelForSequenceClassification.from_pretrained(modelDir, options);
return { tokenizer, model };
```

`env.localModelPath` 的保存/恢复、`allowLocalModels = true`、`allowRemoteModels = false`、
`useBrowserCache = false`、`quantized: true`、`cache_dir` 全部保持不变——**加载路径与原来一致，只是拿到手的对象不同**。

### 3.2 打分（before → after）

```ts
// before：配对数组直投 pipeline
const inputs = documents.map((doc) => [query, doc]);
const outputs = await standardPipeline(inputs);
const results = documents.map((text, i) => ({ text, score: outputs[i]?.score ?? 0 }));
```

```ts
// after：句对交给 tokenizer，原始 logit 当分数
const inputs = standardRuntime.tokenizer(
  documents.map(() => query),
  { text_pair: documents, padding: true, truncation: true },
);
const outputs = await standardRuntime.model(inputs);
const scores = extractRerankScores(outputs.logits);
const results = documents.map((text, i) => ({ text, score: scores[i] ?? 0 }));
```

### 3.3 新增可单测的纯函数

`extractRerankScores(logits)`：把形状 `[batch, numLabels]`（row-major）的 logits 还原成
「每个候选一个分数」，取每行第 0 列；`dims` 缺失时返回空数组而不是臆测形状。

```ts
export function extractRerankScores(logits: RerankLogits): number[] {
  const dims = logits.dims ?? [];
  const batch = dims[0] ?? 0;
  const numLabels = dims[1] ?? 1;
  const scores: number[] = [];
  for (let i = 0; i < batch; i++) scores.push(Number(logits.data[i * numLabels] ?? 0));
  return scores;
}
```

---

## 4. 验证

### 4.1 真实模型端到端（`tsc` 产物，与 Electron 主进程同一代码路径）

`npm run build:main` 后直接跑 `dist/main/main/rag/reranker.js`，本机 `models/bge-reranker-base/`（266MB 量化 onnx）：

```text
[Reranker] runtime "bge-reranker-base" loaded OK
[Reranker] standard: 3 docs reranked in 26ms
E2E: [
  { "text": "本地 RAG 会把文档切片后写入向量库。", "score": 0.24129582941532135 },
  { "text": "今天天气不错，适合出门散步。",       "score": -10.177480697631836 },
  { "text": "贴纸收藏夹里可以放自定义表情。",     "score": -10.180500984191895 }
]
PASS: 相关文档排第一，分数有区分度
```

同一环境、同一模型下，**修复前**的调用形式（`pipe([[query, doc], ...])`）实跑结果为：

```text
B) app-style pipe(pairs) FAILED: text.split is not a function
```

### 4.2 单元测试

新增 [reranker.test.ts](../../src/main/rag/reranker.test.ts)（5 例，不依赖模型文件，CI 可跑）：
单标签形状 `[3,1]`、多标签形状 `[2,2]` 的行错位、空 batch、`dims` 缺失、以及真实一次推理的排序还原。

### 4.3 回归

```text
npx vitest run src/main/rag
Test Files  13 passed (13)
Tests       103 passed (103)
```

---

## 5. 影响面与注意事项

- **影响范围**：只有 reranker 精排路径。embedding（bge-m3）、BM25、向量库 `minScore = 0.3` 预过滤均未改动。
- **接口未变**：`RerankerProvider.rerank()` 仍返回按分数降序的 `[{ text, score }]`；`retriever.ts` 只做整体倒序替换与排序（[retriever.ts](../../src/main/rag/retriever.ts) L259–L277），无需改动。
- **分数语义变了**：以前是「恒 1.0 的伪概率」，现在是 cross-encoder 的**原始 logit**（可负、无 0–1 上界）。
  已确认下游只把它用于排序，没有二次阈值过滤；若将来想按分数做阈值或界面展示，需要按 logit 区间设计
  （例如需要概率时对 logit 做 sigmoid）。
- **已在验证过程中把 `dist/main` 重新编译过**（`npm run build:main`，该目录被 `.gitignore` 忽略），
  重启应用即加载到修复后的主进程代码。

---

## 6. 遗留项（本次未动，建议排期）

1. **模型安装脚本与识别规则不一致**：[scripts/install-bge-reranker.ps1](../../scripts/install-bge-reranker.ps1) 只下载
   `onnx/model_quantized.onnx`，而 [model-status.ts](../../src/main/rag/model-status.ts) L17 要求
   `tokenizer.json + config.json + onnx/model_quantized.onnx` 三件齐全——**照脚本装完仍会显示「未下载」**。
   建议脚本补齐 `config.json`、`tokenizer.json`、`tokenizer_config.json`、`special_tokens_map.json`、`sentencepiece.bpe.model`。
2. **UI 的「📖 模型安装说明」按钮 404**：[panel.ts](../../src/renderer/settings/rag/panel.ts) 打开的是
   `docs/local-models.md`，该文件在当前 master 上已不存在；「检查更新」也是纯占位实现。
   建议改指 Releases 的安装说明资产或补回文档。
3. **IPC 已有下载能力但无人调用**：`embedding:download`（[embedding-manager.ts](../../src/main/embedding-manager.ts)）已实现
   transformers.js 远程下载 + 进度回调 + 镜像源，但设置页没有任何按钮触发它。若不打算做在线安装，建议直接下线该 IPC 以免误导。
4. **`retriever.ts` 的静默降级**：reranker 失败只 `console.warn`，用户看不到「重排已失效」。
   建议首次失败时在设置页或日志面板给一次可见提示。

---

## 附：本次变更清单

| 文件 | 类型 |
| --- | --- |
| [src/main/rag/reranker.ts](../../src/main/rag/reranker.ts) | 修改（pipeline → tokenizer+model，新增 `extractRerankScores`） |
| [src/main/rag/reranker.test.ts](../../src/main/rag/reranker.test.ts) | 新增（5 例纯函数单测） |
| `docs/internal-issue/2026-09-25-reranker-cross-encoder-call-fix.md` | 新增（本文） |
| `models/bge-reranker-base/**` | 新增（运行所需模型文件，被 `models/.gitignore` 忽略，不会入库） |
