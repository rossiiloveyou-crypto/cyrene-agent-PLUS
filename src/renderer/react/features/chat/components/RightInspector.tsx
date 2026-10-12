// RightInspector — 统一的右侧挤出式面板容器。
// shadcn Tabs 承载多标签：每个标签可单独关闭，右上角按钮关闭当前活动标签；
// 活动标签关闭后的回退由上层 ChatPage 决定。

import type { ReactNode } from "react";
import { X } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../../components/ui/tabs";
import { useTranslation } from "../../../i18n";
import "./RightInspector.css";

export interface InspectorTab {
  id: string;
  label: string;
  icon?: ReactNode;
  /** 阶段色点 class（如 is-review / is-executing / is-completed），不传则不显示 */
  dotClass?: string;
  /** 是否允许关闭（chip 上的 × 和右上角按钮都受它控制）；不传默认可关 */
  closable?: boolean;
  content: ReactNode;
}

export function RightInspector({
  tabs,
  activeTabId,
  onTabChange,
  onCloseTab,
}: {
  tabs: InspectorTab[];
  /** 当前活动标签 ID，不在列表中时回退到第一个标签 */
  activeTabId: string | null;
  onTabChange: (id: string) => void;
  /** 关闭指定标签（chip 上的 × 和右上角按钮共用） */
  onCloseTab: (id: string) => void;
}) {
  const { t } = useTranslation();
  if (tabs.length === 0) return null;
  const active = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0];
  return (
    <aside className="cy-right-inspector" aria-label={t("rightInspector.panelAria")}>
      <Tabs value={active.id} onValueChange={onTabChange} className="cy-right-inspector__tabs">
        <div className="cy-right-inspector__tabbar">
          <TabsList className="cy-right-inspector__tablist" aria-label={t("rightInspector.panelAria")}>
            {tabs.map((tab) => (
              <div className="cy-right-inspector__tab" key={tab.id}>
                <TabsTrigger
                  value={tab.id}
                  className="cy-right-inspector__tab-trigger"
                  title={tab.label}
                >
                  {tab.icon && <span className="cy-right-inspector__tab-icon" aria-hidden="true">{tab.icon}</span>}
                  {tab.dotClass && <span className={`cy-right-inspector__dot ${tab.dotClass}`} aria-hidden="true" />}
                  <span className="cy-right-inspector__tab-label">{tab.label}</span>
                </TabsTrigger>
                {tab.closable !== false && (
                  <button
                    type="button"
                    className="cy-right-inspector__tab-close"
                    onClick={() => onCloseTab(tab.id)}
                    aria-label={`${t("common.close")} ${tab.label}`}
                    title={`${t("common.close")} ${tab.label}`}
                  ><X size={12} aria-hidden="true" /></button>
                )}
              </div>
            ))}
          </TabsList>
          {active.closable !== false && (
            <button
              type="button"
              className="cy-right-inspector__close"
              onClick={() => onCloseTab(active.id)}
              aria-label={t("common.close")}
              title={t("common.close")}
            ><X size={14} aria-hidden="true" /></button>
          )}
        </div>
        {tabs.map((tab) => (
          <TabsContent key={tab.id} value={tab.id} forceMount className="cy-right-inspector__content">
            <div className="cy-right-inspector__content-body">{tab.content}</div>
          </TabsContent>
        ))}
      </Tabs>
    </aside>
  );
}
