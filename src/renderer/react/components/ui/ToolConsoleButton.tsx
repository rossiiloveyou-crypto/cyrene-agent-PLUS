import { useTranslation } from "../../i18n";

interface ToolConsoleButtonProps {
  active?: boolean;
  onClick?: () => void;
}

/**
 * 「工具调用控制台」入口：与工具/技能/模型/插件按钮同列。
 * 复用 .cy-side-action 样式（见 NewTaskButton.css）。
 */
export function ToolConsoleButton({ active = false, onClick }: ToolConsoleButtonProps) {
  const { t } = useTranslation();
  return (
    <button
      className={`cy-side-action ${active ? "is-active" : ""}`}
      onClick={onClick}
      type="button"
      title={t("ui.toolConsole")}
      aria-pressed={active}
    >
      <span className="cy-side-action-icon">
        <svg width="22" height="22" viewBox="0 0 48 48" fill="none" aria-hidden="true">
          <path
            d="M24 5L41 12V23C41 33.2 33.9 41.6 24 44C14.1 41.6 7 33.2 7 23V12L24 5Z"
            stroke="currentColor"
            strokeWidth="3.5"
            strokeLinejoin="round"
          />
          <path
            d="M16.5 19.5L21.5 24L16.5 28.5"
            stroke="currentColor"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path d="M25 29H32" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
        </svg>
      </span>
      <span className="cy-side-action-label">{t("ui.toolConsole")}</span>
    </button>
  );
}
