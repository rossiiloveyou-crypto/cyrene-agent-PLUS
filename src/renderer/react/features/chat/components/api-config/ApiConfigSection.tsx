/**
 * 聊天窗口「模型」面板里的 API 配置区（原设置窗口「API 设置」面板的 React 复刻）。
 *
 * 功能对齐 src/renderer/settings/settings.ts 里的这一组行为：
 *   loadConfig / renderProfileList / editProfile / startNewDraft / applyPreset /
 *   updateEndpointPreview / applyCustomEndpointUI / validateActiveCustomEndpoint /
 *   测试连接 / 测试视觉模型 / 保存与删除档案。
 *
 * 设计要点：
 *   - 这是唯一入口（设置面板随后会被删除），所以表单、列表、视觉模型、覆盖选项都在这里；
 *   - 全局项（视觉模型 / thinkingOverride / disableMaxToken）只在「保存档案」时随 saveConfig 一起落盘，
 *     与档案级字段（上下文窗口 / 多模态 / 协议 / URL）分开，跟原实现一致；
 *   - 档案保存成功后广播 window 事件，让上方的模型列表立即刷新。
 */
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "../../../../i18n";
import {
  CUSTOM_ENDPOINT_PROVIDERS,
  DEFAULT_CONTEXT_WINDOW_TOKENS,
  DEFAULT_PROVIDER_NAME,
  LOCAL_ENDPOINT_AUTH_FALLBACK,
  MIN_CONTEXT_WINDOW_TOKENS,
  MODEL_PRESETS,
  defaultEndpointSuffix,
  findPreset,
  getCustomEndpointMode,
  getCustomEndpointPresentation,
  getCustomEndpointProvider,
  resolveApiEndpoint,
  validateCustomEndpointConfig,
  type ApiTransport,
  type CustomEndpointMode,
  type ModelProfilePayload,
  type SavedProfileLite,
} from "./presets";
import "./ApiConfigSection.css";

/** 档案变化广播事件名；上方的模型列表监听它来刷新。 */
export const MODEL_PROFILES_CHANGED_EVENT = "cyrene:model-profiles-changed";

interface ApiConfigSnapshot {
  provider: string;
  model: string;
  apiKey: string;
  baseUrl: string;
  displayName?: string;
  explicitTransport?: ApiTransport;
  multimodal?: boolean;
  contextWindowTokens?: number;
  thinkingOverride?: 0 | 1 | -1;
  disableMaxToken?: boolean;
  vision?: { baseUrl: string; apiKey: string; model: string };
}

interface ApiConfigTestResult {
  ok: boolean;
  // 主进程 vendor adapter 返回的是 latency；这里容错兼容 latencyMs 命名。
  latency?: number;
  latencyMs?: number;
  error?: string;
  sample?: string;
}

interface ApiConfigApi {
  getConfig?: () => Promise<ApiConfigSnapshot>;
  listModelProfiles?: () => Promise<{ profiles: SavedProfileLite[]; defaultModelProfileId?: string }>;
  saveModelProfile?: (
    profile: ModelProfilePayload,
  ) => Promise<{ added?: boolean; profiles: SavedProfileLite[] } | null | undefined>;
  deleteModelProfile?: (id: string) => Promise<unknown>;
  setDefaultModelProfile?: (id: string) => Promise<unknown>;
  testConnection?: (cfg: {
    provider: string;
    baseUrl: string;
    model: string;
    apiKey: string;
    explicitTransport?: ApiTransport;
    reasoning?: unknown;
  }) => Promise<ApiConfigTestResult>;
  testVision?: (cfg: { baseUrl: string; apiKey: string; model: string }) => Promise<ApiConfigTestResult>;
  saveConfig?: (patch: unknown) => Promise<unknown>;
}

interface FormState {
  /** 写入档案的 provider（厂商全名，或自定义端点常量）。 */
  activeProvider: string;
  displayName: string;
  apiKey: string;
  baseUrl: string;
  transport: ApiTransport;
  model: string;
  /** 输入框原值（空 = 保存时按 256000 兜底）。 */
  contextWindow: string;
  multimodal: boolean;
}

interface VisionState {
  baseUrl: string;
  apiKey: string;
  model: string;
}

type StatusKind = "" | "ok" | "error";

interface StatusState {
  text: string;
  kind: StatusKind;
}

interface PresetFormOptions {
  preferredModel?: string;
  preferredApiKey?: string;
  preferredBaseUrl?: string;
  preferredDisplayName?: string;
  preferredExplicitTransport?: ApiTransport;
  preferredMultimodal?: boolean;
}

const TRANSPORT_OPTIONS: Array<{ value: ApiTransport; labelKey: string; icon: string }> = [
  { value: "openai", labelKey: "apiConfig.transport.openai", icon: "../icons/providers/openai.svg" },
  { value: "anthropic", labelKey: "apiConfig.transport.anthropic", icon: "../icons/providers/claude.svg" },
  { value: "responses", labelKey: "apiConfig.transport.responses", icon: "../icons/providers/openai.svg" },
];

function api(): ApiConfigApi | undefined {
  return (window as typeof window & { settings?: ApiConfigApi }).settings;
}

/**
 * 把预设/档案换算成表单值。
 * 与设置窗口 applyPreset 的取值顺序保持一致：
 *   - 协议优先用显式保存值，其次用预设默认值（永不按 URL 猜协议）；
 *   - Base URL 只在「预设自带的 URL + 协议配套」时做 anthropic / 非 anthropic 互换，
 *     用户自填 URL 永远不覆盖；
 *   - API Key 不继承上一个厂商（本地端点的占位令牌还原成空串）。
 */
function buildPresetForm(
  providerName: string,
  options: PresetFormOptions,
): { form: FormState; mode: CustomEndpointMode | null } {
  const preset = findPreset(providerName);
  const selectedTransport = options.preferredExplicitTransport ?? preset.transport;
  const restoredBaseUrl = options.preferredBaseUrl ?? preset.baseUrl;
  const baseUrl =
    selectedTransport === "anthropic" && restoredBaseUrl === preset.baseUrl && preset.anthropicBaseUrl
      ? preset.anthropicBaseUrl
      : (selectedTransport === "openai" || selectedTransport === "responses") &&
          preset.anthropicBaseUrl &&
          restoredBaseUrl === preset.anthropicBaseUrl
        ? preset.baseUrl
        : restoredBaseUrl;

  const mode = getCustomEndpointMode(preset.providerName);
  const apiKey =
    mode === "local" && options.preferredApiKey === LOCAL_ENDPOINT_AUTH_FALLBACK
      ? ""
      : (options.preferredApiKey ?? "");

  return {
    form: {
      activeProvider: preset.providerName,
      // 昵称默认填厂商短名（留空则档案卡显示 provider），用户可改可清。
      displayName: options.preferredDisplayName ?? preset.shortName,
      apiKey,
      baseUrl,
      transport: selectedTransport,
      model: options.preferredModel ?? preset.mainModels[0] ?? "",
      contextWindow: "",
      multimodal: options.preferredMultimodal ?? true,
    },
    mode,
  };
}

export function ApiConfigSection() {
  const { t } = useTranslation();

  const [form, setForm] = useState<FormState>(() => buildPresetForm(DEFAULT_PROVIDER_NAME, {}).form);
  const [customEndpointMode, setCustomEndpointMode] = useState<CustomEndpointMode>("cloud");
  const [profiles, setProfiles] = useState<SavedProfileLite[]>([]);
  const [defaultProfileId, setDefaultProfileId] = useState<string | undefined>(undefined);
  const [editingProfileId, setEditingProfileId] = useState<string | undefined>(undefined);
  const [editingReasoning, setEditingReasoning] = useState<unknown>(undefined);
  const [vision, setVision] = useState<VisionState>({ baseUrl: "", apiKey: "", model: "" });
  const [thinkingOverride, setThinkingOverride] = useState<0 | 1 | -1>(0);
  const [disableMaxToken, setDisableMaxToken] = useState(false);
  const [status, setStatus] = useState<StatusState>({ text: "", kind: "" });
  const [visionStatus, setVisionStatus] = useState<StatusState>({ text: "", kind: "" });
  const [transportHintOverride, setTransportHintOverride] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [testingVision, setTestingVision] = useState(false);

  /** 删除档案后回到草稿态时，读最新的表单值避免闭包过期。 */
  const formRef = useRef(form);
  formRef.current = form;

  const preset = useMemo(() => findPreset(form.activeProvider), [form.activeProvider]);
  const customMode = getCustomEndpointMode(form.activeProvider);
  const customPresentation = customMode ? getCustomEndpointPresentation(customMode) : null;
  const isEditing = Boolean(editingProfileId);

  const setStatusText = useCallback((text: string, kind: StatusKind = "") => {
    setStatus({ text, kind });
  }, []);

  const markDirty = useCallback(() => {
    setStatusText(t("apiConfig.status.dirty"));
  }, [setStatusText, t]);

  const notifyProfilesChanged = useCallback(() => {
    try {
      window.dispatchEvent(new Event(MODEL_PROFILES_CHANGED_EVENT));
    } catch {
      // 事件广播失败不影响主流程
    }
  }, []);

  // ── 数据加载 ────────────────────────────────────────────────

  const fetchProfiles = useCallback(async () => {
    const catalog = await api()?.listModelProfiles?.();
    const nextProfiles = (catalog?.profiles ?? []) as SavedProfileLite[];
    const nextDefaultId = catalog?.defaultModelProfileId;
    setProfiles(nextProfiles);
    setDefaultProfileId(nextDefaultId);
    return { profiles: nextProfiles, defaultProfileId: nextDefaultId };
  }, []);

  /** 载入档案到编辑器（对应设置窗口 editProfile）。 */
  const loadProfile = useCallback(
    (profile: SavedProfileLite) => {
      const built = buildPresetForm(profile.provider, {
        preferredModel: profile.model,
        preferredApiKey: profile.apiKey,
        preferredBaseUrl: profile.baseUrl,
        preferredDisplayName: profile.displayName,
        preferredExplicitTransport: profile.explicitTransport,
      });
      setEditingProfileId(profile.id);
      setEditingReasoning(profile.reasoning);
      if (built.mode) setCustomEndpointMode(built.mode);
      setTransportHintOverride(null);
      setForm((prev) => ({
        ...built.form,
        contextWindow: profile.contextWindowTokens ? String(profile.contextWindowTokens) : "",
        // 档案级字段：未定义 = 老档案，回退全局值显示
        multimodal: profile.multimodal ?? prev.multimodal,
      }));
      setStatusText(t("apiConfig.status.editing", { name: profile.displayName || profile.model }));
    },
    [setStatusText, t],
  );

  /** 开始新建草稿（对应设置窗口 startNewDraft）。 */
  const startNewDraft = useCallback(
    (providerName: string) => {
      const built = buildPresetForm(providerName, { preferredMultimodal: true });
      setEditingProfileId(undefined);
      setEditingReasoning(undefined);
      if (built.mode) setCustomEndpointMode(built.mode);
      setTransportHintOverride(null);
      // 新建草稿默认开多模态；上下文窗口留空（保存时按 256000 兜底）
      setForm(built.form);
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const cfg = (await api()?.getConfig?.()) ?? null;
        if (cancelled) return;

        const providerName = cfg?.provider ?? DEFAULT_PROVIDER_NAME;
        const built = buildPresetForm(providerName, {
          preferredModel: cfg?.model,
          preferredApiKey: cfg?.apiKey,
          preferredBaseUrl: cfg?.baseUrl,
          preferredDisplayName: cfg?.displayName,
          preferredExplicitTransport: cfg?.explicitTransport,
          preferredMultimodal: cfg?.multimodal ?? true,
        });

        setForm({
          ...built.form,
          contextWindow: String(cfg?.contextWindowTokens ?? DEFAULT_CONTEXT_WINDOW_TOKENS),
        });
        if (built.mode) setCustomEndpointMode(built.mode);
        setThinkingOverride(cfg?.thinkingOverride === 1 ? 1 : cfg?.thinkingOverride === -1 ? -1 : 0);
        setDisableMaxToken(Boolean(cfg?.disableMaxToken));
        // 视觉三框是全局配置：有保存值用保存值，否则按当前厂商预设兜底
        setVision(
          cfg?.vision
            ? { baseUrl: cfg.vision.baseUrl, apiKey: cfg.vision.apiKey, model: cfg.vision.model }
            : {
                baseUrl: findPreset(providerName).visionBaseUrl ?? built.form.baseUrl,
                apiKey: built.form.apiKey,
                model: findPreset(providerName).defaultVisionModel ?? built.form.model,
              },
        );

        const catalog = await fetchProfiles();
        if (cancelled) return;
        // 默认进入默认档案的编辑态；没有档案时保留顶层镜像作为「新建草稿」起点。
        const defaultProfile =
          catalog.profiles.find((item) => item.id === catalog.defaultProfileId) ?? catalog.profiles[0];
        if (defaultProfile) {
          loadProfile(defaultProfile);
        } else {
          setEditingProfileId(undefined);
          setEditingReasoning(undefined);
        }
        setStatusText(t("apiConfig.status.waiting"));
      } catch (error) {
        console.warn("[ApiConfigSection] 读取配置失败:", error);
        if (cancelled) return;
        const built = buildPresetForm(DEFAULT_PROVIDER_NAME, {});
        setForm({
          ...built.form,
          contextWindow: String(DEFAULT_CONTEXT_WINDOW_TOKENS),
        });
        setStatusText(t("apiConfig.status.readFailed"), "error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
    // 仅首次挂载加载一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 预设 / 协议 / URL ───────────────────────────────────────

  const visiblePresets = useMemo(() => MODEL_PRESETS.filter((item) => !item.hiddenInPresetList), []);
  // 自定义端点云端/本地共用一张卡：选中态只看 cloud 那张
  const activeCardProvider = customMode ? CUSTOM_ENDPOINT_PROVIDERS.cloud : form.activeProvider;

  const handlePresetClick = useCallback(
    (providerName: string) => {
      const mode = getCustomEndpointMode(providerName);
      // 点自定义端点卡片 = 按当前云端/本地模式开始草稿（与设置窗口一致）
      const targetProvider = mode ? getCustomEndpointProvider(customEndpointMode) : providerName;
      startNewDraft(targetProvider);
      setStatusText(t("apiConfig.status.presetAppliedDraftHint"));
    },
    [customEndpointMode, setStatusText, startNewDraft, t],
  );

  const handleCustomModeSwitch = useCallback(
    (mode: CustomEndpointMode) => {
      if (mode === customEndpointMode) return;
      setCustomEndpointMode(mode);
      startNewDraft(getCustomEndpointProvider(mode));
      setStatusText(
        mode === "local" ? t("apiConfig.customEndpoint.draftHintLocal") : t("apiConfig.customEndpoint.draftHintCloud"),
      );
    },
    [customEndpointMode, setStatusText, startNewDraft, t],
  );

  const handleTransportChange = useCallback(
    (next: ApiTransport) => {
      const current = form.baseUrl.trim().replace(/\/$/, "");
      const knownPresetUrls = [preset.baseUrl, preset.anthropicBaseUrl]
        .filter((value): value is string => Boolean(value))
        .map((value) => value.replace(/\/$/, ""));
      let nextBaseUrl = form.baseUrl;
      if (knownPresetUrls.includes(current)) {
        if (next === "anthropic" && preset.anthropicBaseUrl) {
          nextBaseUrl = preset.anthropicBaseUrl;
        } else if (next === "openai" || next === "responses") {
          // responses 与 openai 共用同一 Base URL（后缀由 resolveApiEndpoint 追加）
          nextBaseUrl = preset.baseUrl;
        }
      }
      setForm((prev) => ({ ...prev, transport: next, baseUrl: nextBaseUrl }));
      setTransportHintOverride(
        next === "anthropic" && !preset.anthropicBaseUrl && preset.transport !== "anthropic"
          ? t("apiConfig.transport.anthropicHintMissing")
          : null,
      );
      markDirty();
    },
    [form.baseUrl, markDirty, preset, t],
  );

  const handleBaseUrlReset = useCallback(() => {
    const next = form.transport === "anthropic" && preset.anthropicBaseUrl ? preset.anthropicBaseUrl : preset.baseUrl;
    setForm((prev) => ({ ...prev, baseUrl: next }));
    setStatusText(t("apiConfig.status.baseUrlResetOk"), "ok");
  }, [form.transport, preset, setStatusText, t]);

  const endpointPreview = useMemo(() => {
    const baseUrl = form.baseUrl.trim();
    const suffix = defaultEndpointSuffix(form.transport);
    if (!baseUrl) return t("apiConfig.endpointPreview.default", { suffix });
    const endpoint = resolveApiEndpoint(baseUrl, form.transport);
    return endpoint.appendedSuffix
      ? t("apiConfig.endpointPreview.suffix", { suffix: endpoint.appendedSuffix, url: endpoint.url })
      : t("apiConfig.endpointPreview.full", { url: endpoint.url });
  }, [form.baseUrl, form.transport, t]);

  // 自定义端点相关的文案随云端/本地模式切换
  const apiKeyLabel = customPresentation?.apiKeyOptional
    ? t("apiConfig.customEndpoint.apiKeyOptional")
    : t("apiConfig.apiKey.label");
  const apiKeyHint = customMode
    ? customPresentation?.apiKeyOptional
      ? t("apiConfig.customEndpoint.apiKeyLocalHint")
      : t("apiConfig.customEndpoint.apiKeyProxyHint")
    : t("apiConfig.apiKey.hint");
  const apiKeyPlaceholder = customPresentation?.apiKeyOptional
    ? t("apiConfig.customEndpoint.apiKeyOptionalPlaceholder")
    : "sk-...";
  const baseUrlPlaceholder = customPresentation?.baseUrlPlaceholder ?? "https://api.deepseek.com";
  const modelPlaceholder = customMode ? t("apiConfig.customEndpoint.modelPlaceholder") : t("apiConfig.model.placeholder");
  const transportHint =
    transportHintOverride ??
    (customMode ? t("apiConfig.customEndpoint.transportHint") : t("apiConfig.transport.hint"));
  const baseUrlResetTitle = customMode
    ? t("apiConfig.customEndpoint.baseUrlResetTitle")
    : t("apiConfig.baseUrl.resetTitle");
  const noteText = customMode ? t("apiConfig.customEndpoint.note") : t("apiConfig.note");

  // ── 校验 / 取值 ─────────────────────────────────────────────

  const getApiKeyForRequest = useCallback(() => {
    const value = form.apiKey.trim();
    return getCustomEndpointMode(form.activeProvider) === "local" && !value
      ? LOCAL_ENDPOINT_AUTH_FALLBACK
      : value;
  }, [form.activeProvider, form.apiKey]);

  const validateActiveCustomEndpoint = useCallback((): string | null => {
    const mode = getCustomEndpointMode(form.activeProvider);
    if (!mode) return null;
    const key = validateCustomEndpointConfig(mode, {
      baseUrl: form.baseUrl,
      model: form.model,
      apiKey: form.apiKey,
    });
    return key ? t(key) : null;
  }, [form.activeProvider, form.apiKey, form.baseUrl, form.model, t]);

  // ── 测试连接 / 测试视觉 / 保存 / 删除 ─────────────────────────

  const handleTestConnection = useCallback(async () => {
    const customValidationError = validateActiveCustomEndpoint();
    if (customValidationError) {
      setStatusText(customValidationError, "error");
      return;
    }
    const model = form.model.trim();
    if (!form.baseUrl.trim()) {
      setStatusText(t("apiConfig.status.needUrlBeforeTest"), "error");
      return;
    }
    if (!model) {
      setStatusText(t("apiConfig.status.needModelBeforeTest"), "error");
      return;
    }

    setStatusText(t("apiConfig.status.testing"));
    setTesting(true);
    try {
      const result = await api()?.testConnection?.({
        provider: form.activeProvider,
        baseUrl: form.baseUrl,
        model,
        apiKey: getApiKeyForRequest(),
        explicitTransport: form.transport,
        reasoning: editingReasoning,
      });
      if (result?.ok) {
        setStatusText(
          t("apiConfig.status.testOk", {
            latency: result.latency ?? result.latencyMs ?? 0,
            sample: result.sample ?? "",
          }),
          "ok",
        );
      } else {
        setStatusText(
          t("apiConfig.status.testFailed", { error: result?.error ?? t("apiConfig.status.unknownError") }),
          "error",
        );
      }
    } catch (error) {
      setStatusText(
        t("apiConfig.status.testFailed", {
          error: error instanceof Error ? error.message : String(error),
        }),
        "error",
      );
    } finally {
      setTesting(false);
    }
  }, [
    editingReasoning,
    form.activeProvider,
    form.baseUrl,
    form.model,
    form.transport,
    getApiKeyForRequest,
    setStatusText,
    t,
    validateActiveCustomEndpoint,
  ]);

  const handleTestVision = useCallback(async () => {
    // 多模态 ON 时主模型就是视觉入口，直接用主表单的值测
    const synced = form.multimodal;
    const baseUrl = synced ? form.baseUrl : vision.baseUrl;
    const apiKey = synced ? form.apiKey : vision.apiKey;
    const model = synced ? form.model : vision.model;
    if (!baseUrl.trim()) {
      setVisionStatus({ text: t("apiConfig.vision.needUrl"), kind: "error" });
      return;
    }
    if (!model.trim()) {
      setVisionStatus({ text: t("apiConfig.vision.needModel"), kind: "error" });
      return;
    }

    setVisionStatus({ text: t("apiConfig.vision.testing"), kind: "" });
    setTestingVision(true);
    try {
      const result = await api()?.testVision?.({ baseUrl, apiKey, model });
      if (result?.ok) {
        setVisionStatus({
          text: t("apiConfig.vision.testOk", {
            latency: result.latency ?? result.latencyMs ?? 0,
            sample: result.sample ?? "",
          }),
          kind: "ok",
        });
      } else {
        setVisionStatus({
          text: t("apiConfig.vision.testFailed", {
            error: result?.error ?? t("apiConfig.status.unknownError"),
          }),
          kind: "error",
        });
      }
    } catch (error) {
      setVisionStatus({
        text: t("apiConfig.vision.testFailed", {
          error: error instanceof Error ? error.message : String(error),
        }),
        kind: "error",
      });
    } finally {
      setTestingVision(false);
    }
  }, [form.apiKey, form.baseUrl, form.model, form.multimodal, t, vision]);

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const customValidationError = validateActiveCustomEndpoint();
      if (customValidationError) {
        setStatusText(customValidationError, "error");
        return;
      }

      setStatusText(t("apiConfig.status.saving"));
      try {
        const isEditingProfile = Boolean(editingProfileId);
        // 上下文窗口与多模态跟随档案；留空/非法按 256000 兜底。
        const contextWindowTokens = Math.max(
          MIN_CONTEXT_WINDOW_TOKENS,
          parseInt(form.contextWindow, 10) || DEFAULT_CONTEXT_WINDOW_TOKENS,
        );
        const payload: ModelProfilePayload = {
          ...(editingProfileId ? { id: editingProfileId } : {}),
          provider: form.activeProvider,
          displayName: form.displayName.trim(),
          baseUrl: form.baseUrl.trim(),
          model: form.model.trim(),
          apiKey: getApiKeyForRequest(),
          explicitTransport: form.transport,
          reasoning: editingReasoning,
          contextWindowTokens,
          multimodal: form.multimodal,
        };
        const result = await api()?.saveModelProfile?.(payload);
        if (!result) throw new Error(t("apiConfig.status.listUnavailable"));

        // 全局选项（视觉模型 / 思考开关 / maxToken）不随档案走，单独保存
        await api()?.saveConfig?.({
          vision: {
            baseUrl: vision.baseUrl.trim(),
            apiKey: vision.apiKey.trim(),
            model: vision.model.trim(),
          },
          thinkingOverride,
          disableMaxToken,
        });

        if (isEditingProfile) {
          setStatusText(t("apiConfig.status.savedUpdated"), "ok");
        } else if (result.added) {
          setStatusText(t("apiConfig.status.savedAdded"), "ok");
          // 新建成功后切到编辑态，用户可直接再改再存
          const saved = result.profiles?.[result.profiles.length - 1];
          if (saved?.id) {
            setEditingProfileId(saved.id);
            setEditingReasoning(saved.reasoning);
          }
        } else {
          setStatusText(t("apiConfig.status.duplicate"), "error");
        }
        await fetchProfiles();
        notifyProfilesChanged();
      } catch (error) {
        console.warn("[ApiConfigSection] 保存档案失败:", error);
        setStatusText(t("apiConfig.status.saveFailed"), "error");
      }
    },
    [
      disableMaxToken,
      editingProfileId,
      editingReasoning,
      fetchProfiles,
      form,
      getApiKeyForRequest,
      notifyProfilesChanged,
      setStatusText,
      t,
      thinkingOverride,
      validateActiveCustomEndpoint,
      vision,
    ],
  );

  const handleDeleteProfile = useCallback(async () => {
    if (!editingProfileId) return;
    const profile = profiles.find((item) => item.id === editingProfileId);
    const name = profile?.displayName || profile?.model || t("apiConfig.status.fallbackName");
    try {
      await api()?.deleteModelProfile?.(editingProfileId);
      setStatusText(t("apiConfig.status.deleted", { name }), "ok");
      const catalog = await fetchProfiles();
      notifyProfilesChanged();
      // 删除后切到剩余的默认档案；没有档案则回到草稿态
      const next =
        catalog.profiles.find((item) => item.id === catalog.defaultProfileId) ?? catalog.profiles[0];
      if (next) {
        loadProfile(next);
      } else {
        startNewDraft(formRef.current.activeProvider || DEFAULT_PROVIDER_NAME);
      }
    } catch (error) {
      console.warn("[ApiConfigSection] 删除档案失败:", error);
      setStatusText(t("apiConfig.status.deleteFailed"), "error");
    }
  }, [editingProfileId, fetchProfiles, loadProfile, notifyProfilesChanged, profiles, setStatusText, startNewDraft, t]);

  // ── 渲染 ──────────────────────────────────────────────────

  if (loading) {
    return <section className="api-config api-config--loading">{t("common.loading")}</section>;
  }

  return (
    <section className="api-config">
      <header className="api-config__header">
        <h2 className="api-config__title">{t("apiConfig.title")}</h2>
        <p className="api-config__subtitle">{t("apiConfig.subtitle")}</p>
      </header>

      {/* 已保存档案 */}
      <div className="api-config__profiles">
        <div className="api-config__profiles-head">
          <div>
            <h3 className="api-config__section-title">{t("apiConfig.profileList.title")}</h3>
            <p className="api-config__section-desc">{t("apiConfig.profileList.subtitle")}</p>
          </div>
          <span className="api-config__profile-count">
            {profiles.length > 0 ? t("apiConfig.profileList.count", { count: profiles.length }) : ""}
          </span>
        </div>
        <div className="api-config__profile-list">
          {profiles.length === 0 ? (
            <div className="api-config__empty">{t("apiConfig.profileList.empty")}</div>
          ) : (
            profiles.map((profile) => {
              const isDefault = profile.id === defaultProfileId;
              const metaParts = [findPreset(profile.provider).shortName, profile.model];
              if (profile.contextWindowTokens) metaParts.push(`${Math.round(profile.contextWindowTokens / 1000)}k`);
              return (
                <button
                  key={profile.id}
                  type="button"
                  className={"api-config__profile-card" + (profile.id === editingProfileId ? " is-active" : "")}
                  onClick={() => loadProfile(profile)}
                >
                  <span className="api-config__profile-name">{profile.displayName || profile.provider}</span>
                  <span className="api-config__profile-meta">{metaParts.join(" · ")}</span>
                  <span className="api-config__profile-badges">
                    {isDefault && <span className="api-config__badge">{t("apiConfig.badge.default")}</span>}
                    {profile.multimodal === true && (
                      <span className="api-config__badge api-config__badge--vision">
                        {t("apiConfig.badge.multimodal")}
                      </span>
                    )}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* 厂商预设 = 新建草稿入口 */}
      <div className="api-config__field api-config__field--full">
        <span className="api-config__label">{t("apiConfig.presetRow.label")}</span>
        <div className="api-config__preset-cards">
          {visiblePresets.map((item) => (
            <button
              key={item.providerName}
              type="button"
              className={"api-config__preset-card" + (item.providerName === activeCardProvider ? " is-active" : "")}
              disabled={item.disabled === true}
              onClick={() => handlePresetClick(item.providerName)}
            >
              <span className="api-config__preset-logo">
                {item.iconUrl ? (
                  <img src={item.iconUrl} alt="" width={24} height={24} draggable={false} />
                ) : (
                  item.shortName.charAt(0)
                )}
              </span>
              <span className="api-config__preset-name">
                {item.shortName}
                {item.disabled ? t("apiConfig.preset.disabledSuffix") : ""}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* 自定义端点说明卡 + 云端/本地切换 */}
      {customMode && (
        <div className="api-config__custom-endpoint">
          <div className="api-config__custom-endpoint-copy">
            <div className="api-config__custom-endpoint-title">
              <strong>{t("apiConfig.customEndpoint.title")}</strong>
              <span className="api-config__badge">{t("apiConfig.customEndpoint.badge")}</span>
            </div>
            <p className="api-config__section-desc">
              {customMode === "local"
                ? t("apiConfig.customEndpoint.summaryLocal")
                : t("apiConfig.customEndpoint.summaryCloud")}
            </p>
          </div>
          <div
            className="api-config__custom-endpoint-mode"
            role="group"
            aria-label={t("apiConfig.customEndpoint.modeGroupLabel")}
          >
            <button
              type="button"
              className={"api-config__mode-btn" + (customMode === "cloud" ? " is-active" : "")}
              aria-pressed={customMode === "cloud"}
              onClick={() => handleCustomModeSwitch("cloud")}
            >
              {t("apiConfig.customEndpoint.modeCloud")}
            </button>
            <button
              type="button"
              className={"api-config__mode-btn" + (customMode === "local" ? " is-active" : "")}
              aria-pressed={customMode === "local"}
              onClick={() => handleCustomModeSwitch("local")}
            >
              {t("apiConfig.customEndpoint.modeLocal")}
            </button>
          </div>
        </div>
      )}

      <div className="api-config__editor-head">
        <h3 className="api-config__section-title">
          {isEditing ? t("apiConfig.editor.titleEdit") : t("apiConfig.editor.titleNew")}
        </h3>
        <p className="api-config__section-desc">{t("apiConfig.editor.subtitle")}</p>
      </div>

      <form className="api-config__form" onSubmit={handleSubmit}>
        <div className="api-config__grid">
          <label className="api-config__field">
            <span className="api-config__label">{t("apiConfig.nickname.label")}</span>
            <div className="api-config__row">
              <input
                className="api-config__input"
                type="text"
                autoComplete="off"
                placeholder={t("apiConfig.nickname.placeholder")}
                value={form.displayName}
                onChange={(event) => {
                  const value = event.target.value;
                  setForm((prev) => ({ ...prev, displayName: value }));
                  markDirty();
                }}
              />
              {preset.websiteUrl && (
                <a
                  className="api-config__website-link"
                  href={preset.websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={t("apiConfig.presetWebsite.title", { shortName: preset.shortName })}
                >
                  {t("apiConfig.presetWebsite.link")}
                </a>
              )}
            </div>
          </label>

          <label className="api-config__field">
            <span className="api-config__label">{apiKeyLabel}</span>
            <input
              className="api-config__input"
              type="password"
              autoComplete="off"
              placeholder={apiKeyPlaceholder}
              value={form.apiKey}
              onChange={(event) => {
                const value = event.target.value;
                setForm((prev) => ({ ...prev, apiKey: value }));
                markDirty();
              }}
            />
            <span className="api-config__hint">{apiKeyHint}</span>
          </label>

          <label className="api-config__field api-config__field--full">
            <span className="api-config__label">{t("apiConfig.baseUrl.label")}</span>
            <div className="api-config__row">
              <input
                className="api-config__input"
                type="url"
                autoComplete="off"
                placeholder={baseUrlPlaceholder}
                value={form.baseUrl}
                onChange={(event) => {
                  const value = event.target.value;
                  setForm((prev) => ({ ...prev, baseUrl: value }));
                  markDirty();
                }}
              />
              <button
                type="button"
                className="api-config__icon-btn"
                title={baseUrlResetTitle}
                aria-label={baseUrlResetTitle}
                onClick={handleBaseUrlReset}
              >
                ↻
              </button>
            </div>
            <span className="api-config__hint" aria-live="polite">
              {endpointPreview}
            </span>
          </label>

          <div className="api-config__field api-config__field--full">
            <span className="api-config__label">{t("apiConfig.transport.label")}</span>
            <div className="api-config__transport-cards" role="group" aria-label={t("apiConfig.transport.groupLabel")}>
              {TRANSPORT_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={"api-config__preset-card" + (form.transport === option.value ? " is-active" : "")}
                  aria-pressed={form.transport === option.value}
                  onClick={() => handleTransportChange(option.value)}
                >
                  <span className="api-config__preset-logo">
                    <img src={option.icon} alt="" width={24} height={24} draggable={false} />
                  </span>
                  <span className="api-config__preset-name">{t(option.labelKey)}</span>
                </button>
              ))}
            </div>
            <span className="api-config__hint">{transportHint}</span>
          </div>

          <label className="api-config__field api-config__field--full">
            <span className="api-config__label">{t("apiConfig.model.label")}</span>
            <input
              className="api-config__input"
              type="text"
              autoComplete="off"
              list="api-config-model-suggestions"
              placeholder={modelPlaceholder}
              value={form.model}
              onChange={(event) => {
                const value = event.target.value;
                setForm((prev) => ({ ...prev, model: value }));
                markDirty();
              }}
            />
            <datalist id="api-config-model-suggestions">
              {preset.mainModels.map((model) => (
                <option key={model} value={model} />
              ))}
            </datalist>
          </label>

          <label className="api-config__field">
            <span className="api-config__label">{t("apiConfig.model.contextWindow")}</span>
            <input
              className="api-config__input"
              type="number"
              min={MIN_CONTEXT_WINDOW_TOKENS}
              step={1}
              placeholder={String(DEFAULT_CONTEXT_WINDOW_TOKENS)}
              autoComplete="off"
              value={form.contextWindow}
              onChange={(event) => {
                const value = event.target.value;
                setForm((prev) => ({ ...prev, contextWindow: value }));
                markDirty();
              }}
            />
            <span className="api-config__hint">{t("apiConfig.model.contextWindowHint")}</span>
          </label>

          <label className="api-config__switch-row">
            <span className="api-config__switch-copy">
              <strong>{t("apiConfig.model.multimodalTitle")}</strong>
              <span className="api-config__hint">{t("apiConfig.model.multimodalDesc")}</span>
            </span>
            <input
              className="api-config__switch"
              type="checkbox"
              checked={form.multimodal}
              onChange={(event) => {
                const checked = event.target.checked;
                setForm((prev) => ({ ...prev, multimodal: checked }));
                markDirty();
              }}
            />
          </label>
        </div>

        <p className="api-config__note">{noteText}</p>

        {/* 自定义端点覆盖选项（全局项，仅保存档案时落盘） */}
        {customMode && (
          <div className="api-config__overrides">
            <h3 className="api-config__section-title">{t("apiConfig.customEndpoint.overrides.title")}</h3>
            <p className="api-config__section-desc">{t("apiConfig.customEndpoint.overrides.subtitle")}</p>
            <div className="api-config__overrides-list">
              <label className="api-config__switch-row">
                <span className="api-config__switch-copy">
                  <strong>{t("apiConfig.customEndpoint.overrides.disableMaxTokenTitle")}</strong>
                  <span className="api-config__hint">
                    {t("apiConfig.customEndpoint.overrides.disableMaxTokenDesc")}
                  </span>
                </span>
                <input
                  className="api-config__switch"
                  type="checkbox"
                  checked={disableMaxToken}
                  onChange={(event) => setDisableMaxToken(event.target.checked)}
                />
              </label>
              <label className="api-config__switch-row">
                <span className="api-config__switch-copy">
                  <strong>{t("apiConfig.customEndpoint.overrides.enableThinkingTitle")}</strong>
                  <span className="api-config__hint">
                    {t("apiConfig.customEndpoint.overrides.enableThinkingDesc")}
                  </span>
                </span>
                <input
                  className="api-config__switch"
                  type="checkbox"
                  checked={thinkingOverride === 1}
                  onChange={(event) => setThinkingOverride(event.target.checked ? 1 : 0)}
                />
              </label>
              <label className="api-config__switch-row">
                <span className="api-config__switch-copy">
                  <strong>{t("apiConfig.customEndpoint.overrides.disableThinkingTitle")}</strong>
                  <span className="api-config__hint">
                    {t("apiConfig.customEndpoint.overrides.disableThinkingDesc")}
                  </span>
                </span>
                <input
                  className="api-config__switch"
                  type="checkbox"
                  checked={thinkingOverride === -1}
                  onChange={(event) => setThinkingOverride(event.target.checked ? -1 : 0)}
                />
              </label>
            </div>
          </div>
        )}

        {/* 视觉模型（全局，不随档案走） */}
        <div className="api-config__vision">
          <h3 className="api-config__section-title">{t("apiConfig.vision.title")}</h3>
          <p className="api-config__section-desc">{t("apiConfig.vision.desc")}</p>
          {/* 多模态 ON 时主模型就是视觉入口，这三框隐藏（与原设置面板一致） */}
          {!form.multimodal && (
            <div className="api-config__vision-body">
              <div className="api-config__grid">
                <label className="api-config__field api-config__field--full">
                  <span className="api-config__label">{t("apiConfig.baseUrl.label")}</span>
                  <input
                    className="api-config__input"
                    type="url"
                    autoComplete="off"
                    placeholder="https://api.openai.com/v1"
                    value={vision.baseUrl}
                    onChange={(event) => {
                      const value = event.target.value;
                      setVision((prev) => ({ ...prev, baseUrl: value }));
                    }}
                  />
                </label>
                <label className="api-config__field">
                  <span className="api-config__label">{t("apiConfig.apiKey.label")}</span>
                  <input
                    className="api-config__input"
                    type="password"
                    autoComplete="off"
                    placeholder="sk-..."
                    value={vision.apiKey}
                    onChange={(event) => {
                      const value = event.target.value;
                      setVision((prev) => ({ ...prev, apiKey: value }));
                    }}
                  />
                </label>
                <label className="api-config__field">
                  <span className="api-config__label">{t("apiConfig.vision.modelLabel")}</span>
                  <input
                    className="api-config__input"
                    type="text"
                    autoComplete="off"
                    list="api-config-vision-model-suggestions"
                    placeholder="gpt-4o / glm-5v-turbo / qwen-vl-max"
                    value={vision.model}
                    onChange={(event) => {
                      const value = event.target.value;
                      setVision((prev) => ({ ...prev, model: value }));
                    }}
                  />
                  <datalist id="api-config-vision-model-suggestions">
                    {(preset.visionModels ?? []).map((model) => (
                      <option key={model} value={model} />
                    ))}
                  </datalist>
                </label>
              </div>
              <p className="api-config__hint">{t("apiConfig.vision.hint")}</p>
              <button
                type="button"
                className="api-config__action api-config__action--ghost"
                disabled={testingVision}
                onClick={() => void handleTestVision()}
              >
                {t("apiConfig.vision.testButton")}
              </button>
              {visionStatus.text && (
                <div className={"api-config__status" + statusClass(visionStatus.kind)}>{visionStatus.text}</div>
              )}
            </div>
          )}
        </div>

        <div className="api-config__actions">
          <div className={"api-config__status" + statusClass(status.kind)}>
            {status.text || t("apiConfig.status.waiting")}
          </div>
          {isEditing && (
            <button
              type="button"
              className="api-config__action api-config__action--danger"
              onClick={() => void handleDeleteProfile()}
            >
              {t("apiConfig.actions.deleteProfile")}
            </button>
          )}
          <button
            type="button"
            className="api-config__action api-config__action--ghost"
            disabled={testing}
            onClick={() => void handleTestConnection()}
          >
            {t("apiConfig.actions.testConnection")}
          </button>
          <button type="submit" className="api-config__action api-config__action--primary">
            {t("apiConfig.actions.save")}
          </button>
        </div>
      </form>
    </section>
  );
}

function statusClass(kind: StatusKind): string {
  if (kind === "ok") return " is-ok";
  if (kind === "error") return " is-error";
  return "";
}

export default ApiConfigSection;
