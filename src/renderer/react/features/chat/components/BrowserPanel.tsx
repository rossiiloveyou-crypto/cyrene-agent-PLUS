import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, BookOpen, Globe, LoaderCircle, MousePointerClick, Plus, RotateCw, Square, X } from "lucide-react";
import { useTranslation } from "../../../i18n";
import { Tabs, TabsList, TabsTrigger } from "../../../components/ui/tabs";
import type { BrowserPanelState, BrowserPanelTabState } from "../../../../../shared/browser-panel-types";
import "./BrowserPanel.css";

const EMPTY_STATE: BrowserPanelState = {
  activeTabId: "",
  tabs: [],
};

const EMPTY_TAB: BrowserPanelTabState = {
  id: "",
  kind: "web",
  url: "",
  title: "",
  loading: false,
  canGoBack: false,
  canGoForward: false,
  crashed: false,
};

function BrowserTabIcon({ favicon, kind }: { favicon?: string; kind: "web" | "exam" }) {
  const [failedFavicon, setFailedFavicon] = useState("");
  useEffect(() => setFailedFavicon(""), [favicon]);
  const showFavicon = favicon && failedFavicon !== favicon;
  return kind === "exam"
    ? <BookOpen className="cy-browser-panel__tab-icon cy-browser-panel__tab-icon--fallback" size={14} aria-hidden="true" />
    : showFavicon
    ? <img className="cy-browser-panel__tab-icon" src={favicon} alt="" aria-hidden="true" onError={() => setFailedFavicon(favicon)} />
    : <Globe className="cy-browser-panel__tab-icon cy-browser-panel__tab-icon--fallback" size={14} aria-hidden="true" />;
}

export function BrowserPanel({ active }: { active: boolean }) {
  const { t } = useTranslation();
  const hostRef = useRef<HTMLDivElement>(null);
  const lastAddressKeyRef = useRef("");
  const [state, setState] = useState(EMPTY_STATE);
  const [address, setAddress] = useState("");
  const [commandError, setCommandError] = useState("");

  useEffect(() => {
    const api = window.browserPanel;
    if (!api) return;
    let mounted = true;
    const unsubscribe = api.onStateChanged((next) => {
      if (!mounted) return;
      setState(next);
      const activeTab = next.tabs.find((tab) => tab.id === next.activeTabId);
      const addressKey = `${next.activeTabId}\n${activeTab?.url ?? ""}`;
      if (addressKey !== lastAddressKeyRef.current) {
        lastAddressKeyRef.current = addressKey;
        setAddress(activeTab?.url ?? "");
      }
    });
    void api.getState().then((next) => {
      if (mounted && next) {
        setState(next);
        const activeTab = next.tabs.find((tab) => tab.id === next.activeTabId);
        const addressKey = `${next.activeTabId}\n${activeTab?.url ?? ""}`;
        if (addressKey !== lastAddressKeyRef.current) {
          lastAddressKeyRef.current = addressKey;
          setAddress(activeTab?.url ?? "");
        }
      }
    });
    return () => {
      mounted = false;
      unsubscribe();
      void api.setBounds(null);
    };
  }, []);

  useLayoutEffect(() => {
    const api = window.browserPanel;
    const host = hostRef.current;
    if (!api || !host || !active) {
      if (api) void api.setBounds(null);
      return;
    }
    const update = () => {
      const rect = host.getBoundingClientRect();
      void api.setBounds({ x: rect.left, y: rect.top, width: rect.width, height: rect.height });
    };
    const inspector = host.closest(".cy-right-inspector");
    let frame = 0;
    const startedAt = performance.now();
    const trackEntranceAnimation = () => {
      update();
      if (performance.now() - startedAt < 260) frame = requestAnimationFrame(trackEntranceAnimation);
    };
    const onAnimationEnd = () => update();
    const observer = new ResizeObserver(update);
    observer.observe(host);
    inspector?.addEventListener("animationend", onAnimationEnd);
    window.addEventListener("resize", update);
    frame = requestAnimationFrame(trackEntranceAnimation);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      inspector?.removeEventListener("animationend", onAnimationEnd);
      window.removeEventListener("resize", update);
      void api.setBounds(null);
    };
  }, [active]);

  async function submitAddress(event: FormEvent) {
    event.preventDefault();
    setCommandError("");
    const result = await window.browserPanel?.navigate(address);
    if (!result?.ok) {
      setCommandError(result?.error === "unsupported_protocol"
        ? t("browserPanel.errors.unsupportedProtocol")
        : result?.error === "invalid_url"
          ? t("browserPanel.errors.invalidUrl")
          : t("browserPanel.errors.unavailable"));
    }
  }

  const activeTab = state.tabs.find((tab) => tab.id === state.activeTabId) ?? EMPTY_TAB;
  const activeTriggerId = activeTab.id ? `cy-browser-tab-${activeTab.id}` : undefined;
  const pageError = activeTab.error === "load_failed"
    ? t("browserPanel.errors.loadFailed")
    : activeTab.error === "renderer_crashed"
      ? t("browserPanel.errors.rendererCrashed")
      : activeTab.error === "unavailable"
        ? t("browserPanel.errors.unavailable")
        : activeTab.error;

  return (
    <section className="cy-browser-panel" aria-label={t("browserPanel.title")}>
      <Tabs
        value={state.activeTabId || undefined}
        onValueChange={(tabId) => void window.browserPanel?.activateTab(tabId)}
        className="cy-browser-panel__tabs-root"
      >
        <div className="cy-browser-panel__tabs-bar">
          <TabsList className="cy-browser-panel__tabs" aria-label={t("browserPanel.title")}>
            {state.tabs.map((tab) => {
              let label = tab.title || t("browserPanel.newTab");
              if (!tab.title && tab.url) {
                try { label = new URL(tab.url).hostname; } catch { label = tab.url; }
              }
              return (
                <div className="cy-browser-panel__tab" key={tab.id}>
                  <TabsTrigger
                    value={tab.id}
                    id={`cy-browser-tab-${tab.id}`}
                    aria-controls="cy-browser-active-panel"
                    className="cy-browser-panel__tab-select"
                    title={tab.title || tab.url || t("browserPanel.newTab")}
                  >
                    <BrowserTabIcon favicon={tab.favicon} kind={tab.kind} />
                    <span className="cy-browser-panel__tab-label">{label}</span>
                    {tab.loading && <LoaderCircle size={12} className="cy-browser-panel__spinner" aria-label={t("browserPanel.loading")} />}
                  </TabsTrigger>
                  <button
                    type="button"
                    className="cy-browser-panel__tab-close"
                    aria-label={t("browserPanel.closeTab", { title: label })}
                    title={t("browserPanel.closeTab", { title: label })}
                    onClick={() => void window.browserPanel?.closeTab(tab.id)}
                  ><X size={12} /></button>
                </div>
              );
            })}
          </TabsList>
          <button
            type="button"
            className="cy-browser-panel__new-tab"
            aria-label={t("browserPanel.newTab")}
            title={t("browserPanel.newTab")}
            onClick={() => void window.browserPanel?.newTab()}
          ><Plus size={15} /></button>
        </div>
        <div
          id="cy-browser-active-panel"
          role="tabpanel"
          aria-labelledby={activeTriggerId}
          className="cy-browser-panel__tab-panel"
          tabIndex={0}
        >
          <form className="cy-browser-panel__toolbar" onSubmit={(event) => void submitAddress(event)}>
            <button type="button" className="cy-browser-panel__icon" disabled={!activeTab.canGoBack} aria-label={t("browserPanel.back")} onClick={() => void window.browserPanel?.goBack()}><ArrowLeft size={15} /></button>
            <button type="button" className="cy-browser-panel__icon" disabled={!activeTab.canGoForward} aria-label={t("browserPanel.forward")} onClick={() => void window.browserPanel?.goForward()}><ArrowRight size={15} /></button>
            <button type="button" className="cy-browser-panel__icon" aria-label={activeTab.loading ? t("browserPanel.stop") : t("browserPanel.reload")} onClick={() => void (activeTab.loading ? window.browserPanel?.stop() : window.browserPanel?.reload())}>
              {activeTab.loading ? <Square size={13} /> : <RotateCw size={14} />}
            </button>
            <button
              type="button"
              className={`cy-browser-panel__icon${state.elementPickerActive ? " is-active" : ""}`}
              aria-label={state.elementPickerActive ? t("browserPanel.cancelElementPicker") : t("browserPanel.pickElement")}
              aria-pressed={state.elementPickerActive === true}
              title={state.elementPickerActive ? t("browserPanel.cancelElementPicker") : t("browserPanel.pickElement")}
              disabled={!activeTab.url || activeTab.loading}
              onClick={() => void (state.elementPickerActive
                ? window.browserPanel?.cancelElementPicker()
                : window.browserPanel?.startElementPicker())}
            ><MousePointerClick size={15} /></button>
            <input
              className="cy-browser-panel__address"
              aria-label={t("browserPanel.address")}
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              placeholder={t("browserPanel.addressPlaceholder")}
              spellCheck={false}
              autoComplete="off"
            />
            <button className="cy-browser-panel__go" type="submit">{t("browserPanel.go")}</button>
          </form>
          <div className="cy-browser-panel__page-meta">
            <span className="cy-browser-panel__page-title" title={activeTab.title || activeTab.url}>{activeTab.title || activeTab.url || t("browserPanel.emptyTitle")}</span>
            {state.controlTabId === activeTab.id && <span className="cy-browser-panel__control-state" role="status">
              {t("browserPanel.agentControl")}{state.controlAction && state.controlAction !== "active" ? ` · ${t(`browserPanel.actions.${state.controlAction}`)}` : ""}
            </span>}
            {activeTab.loading && <LoaderCircle size={13} className="cy-browser-panel__spinner" aria-label={t("browserPanel.loading")} />}
          </div>
          {pageError && <div className="cy-browser-panel__error" role="status"><span>{pageError}</span>{activeTab.crashed && <button type="button" onClick={() => void window.browserPanel?.reload()}>{t("browserPanel.reload")}</button>}</div>}
          {commandError && <div className="cy-browser-panel__error" role="alert">{commandError}<button type="button" aria-label={t("common.close")} onClick={() => setCommandError("")}><X size={13} /></button></div>}
          <div className="cy-browser-panel__webview" ref={hostRef}>
            {!activeTab.url && <div className="cy-browser-panel__empty">{t("browserPanel.emptyHint")}</div>}
          </div>
        </div>
      </Tabs>
    </section>
  );
}
