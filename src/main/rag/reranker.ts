// Reranker module — cross-encoder reranking for RAG
// 只支持 bge-reranker-base，不再提供 light 版本
import * as path from "path";
import * as os from "os";
import { getProjectModelBaseDir } from "./model-status";

// ── Types ──
export interface RerankerProvider {
  rerank(query: string, documents: string[]): Promise<Array<{ text: string; score: number }>>;
  readonly name: string;
}

// ── ESM import helper (same pattern as embedding.ts) ──
const importEsm = new Function("moduleName", "return import(moduleName)") as (moduleName: string) => Promise<any>;

// ── Cross-encoder 打分 ──
//
// 这里**不能**用 `pipeline("text-classification", model, ...)`：
//   1. @xenova/transformers 2.17.2 的 TextClassificationPipeline 只把 text 交给
//      `tokenizer(texts, { padding, truncation })`，不接受 `[query, doc]` 这类配对数组，
//      传进去会在 tokenizers.js 抛 "text.split is not a function"；
//   2. bge-reranker-base 是单标签回归（num_labels = 1，id2label 只有 LABEL_0），
//      pipeline 会对唯一的 logit 做 softmax，得分恒为 1.0 —— 即使调用成功也无法排序。
// 正确做法：`tokenizer(texts, { text_pair })` 组句对，再把模型原始 logits 当作相关性分数。
export interface RerankLogits {
  dims?: number[];
  data: ArrayLike<number>;
}

/**
 * 从 cross-encoder logits 中取出每个候选的相关性分数。
 * logits 形状为 [batch, numLabels]（row-major）；单标签模型取每行第 0 列原始 logit，
 * 多标签模型同样取第 0 列（对 bge-reranker 系列即相关性标签）。
 */
export function extractRerankScores(logits: RerankLogits): number[] {
  const dims = logits.dims ?? [];
  const batch = dims[0] ?? 0;
  const numLabels = dims[1] ?? 1;
  const scores: number[] = [];
  for (let i = 0; i < batch; i++) {
    scores.push(Number(logits.data[i * numLabels] ?? 0));
  }
  return scores;
}

interface RerankerRuntime {
  tokenizer: (texts: string[], options: Record<string, unknown>) => any;
  model: (inputs: any) => Promise<{ logits: RerankLogits }>;
}

// ── Runtime cache ──
let standardRuntime: RerankerRuntime | null = null;

async function loadRerankerRuntime(modelDir: string): Promise<RerankerRuntime> {
  const { AutoTokenizer, AutoModelForSequenceClassification, env } = await importEsm("@xenova/transformers");

  const originalPath = env.localModelPath;
  const modelsDir = getProjectModelBaseDir("reranker", "standard");
  if (!modelsDir) throw new Error("Local reranker model is not installed");
  env.localModelPath = modelsDir;
  env.allowLocalModels = true;
  env.allowRemoteModels = false;
  env.useBrowserCache = false;

  const options = {
    quantized: true,
    cache_dir: path.join(os.homedir(), ".cache", "huggingface"),
  };

  try {
    const tokenizer = await AutoTokenizer.from_pretrained(modelDir, options);
    const model = await AutoModelForSequenceClassification.from_pretrained(modelDir, options);
    console.log(`[Reranker] runtime "${modelDir}" loaded OK`);
    return { tokenizer, model };
  } finally {
    env.localModelPath = originalPath;
  }
}

// ── Standard reranker (bge-reranker-base, ~266MB 量化) ──
export async function createStandardReranker(): Promise<RerankerProvider> {
  if (!standardRuntime) {
    standardRuntime = await loadRerankerRuntime("bge-reranker-base");
  }

  return {
    name: "bge-reranker-base",

    async rerank(query: string, documents: string[]): Promise<Array<{ text: string; score: number }>> {
      if (documents.length === 0) return [];
      if (!standardRuntime) throw new Error("Standard reranker not initialized");

      const start = Date.now();

      // cross-encoder 的输入是句对：text = 重复的 query，text_pair = 候选文档
      const inputs = standardRuntime.tokenizer(
        documents.map(() => query),
        { text_pair: documents, padding: true, truncation: true },
      );
      const outputs = await standardRuntime.model(inputs);
      const scores = extractRerankScores(outputs.logits);

      const results = documents.map((text, i) => ({
        text,
        score: scores[i] ?? 0,
      }));

      results.sort((a, b) => b.score - a.score);

      console.log(`[Reranker] standard: ${documents.length} docs reranked in ${Date.now() - start}ms`);
      return results;
    },
  };
}

// ── Reranker manager ──
let currentReranker: RerankerProvider | null = null;
let currentRerankerMode: "standard" | "none" = "none";

function checkRerankerModelInstalled(): boolean {
  return getProjectModelBaseDir("reranker", "standard") !== null;
}

export function getRerankerInstallStatus(): { standard: boolean } {
  return { standard: checkRerankerModelInstalled() };
}

export async function initReranker(mode: "standard" | "none"): Promise<void> {
  currentRerankerMode = mode;

  if (mode === "none") {
    currentReranker = null;
    console.log("[Reranker] disabled");
    return;
  }

  if (!checkRerankerModelInstalled()) {
    console.warn(`[Reranker] bge-reranker-base 未找到 (models/bge-reranker-base/onnx/model_quantized.onnx)，自动降级为 none。`);
    currentRerankerMode = "none";
    currentReranker = null;
    return;
  }

  console.log("[Reranker] initializing standard mode (bge-reranker-base)...");
  currentReranker = await createStandardReranker();
  console.log(`[Reranker] standard mode ready: ${currentReranker.name}`);
}

export function getReranker(): RerankerProvider | null {
  return currentReranker;
}

export function getRerankerMode(): "standard" | "none" {
  return currentRerankerMode;
}

export function resetReranker(): void {
  currentReranker = null;
  currentRerankerMode = "none";
  standardRuntime = null;
}
