import { useEffect, useState } from "react";
import { Bug, Check, ChevronRight, Globe, Languages, Megaphone, Package, Palette, UserRound } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import packageJson from "../../../../../package.json";
import { normalizeUiThemeChoice, type UiThemeChoice } from "../../../../shared/ui-theme";
import { applyUiThemeChoice } from "../../../ui/theme";
import { useAppUpdate } from "../../hooks/useAppUpdate";
import { useNewsFeed } from "../../hooks/useNewsFeed";
import { useUserAvatar } from "../../hooks/useUserAvatar";
import { useUserNickname } from "../../hooks/useUserNickname";
import { setUiLocale, useTranslation } from "../../i18n";
import { normalizeUiLanguage, type UiLanguage } from "../../../../shared/ui-language";
import { resolveAppUpdateView, resolveVersionTitleKey, WEBSITE_URL } from "../../features/settings/app-update-view";
import { IssueReportDialog } from "./IssueReportDialog";
import { NewsDialog } from "./NewsDialog";
import { UserProfileDialog } from "./UserProfileDialog";
import "./UserAvatar.css";

interface UserAvatarProps {
  label?: string;
}

export function UserAvatar({ label }: UserAvatarProps) {
  const { t, locale } = useTranslation();
  const avatarUrl = useUserAvatar();
  const nickname = useUserNickname();
  const [profileOpen, setProfileOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [newsOpen, setNewsOpen] = useState(false);
  // 弹窗里要标出哪几条是新的，而 markRead 会立刻清掉未读，所以打开时先快照一份
  const [newsUnreadSnapshot, setNewsUnreadSnapshot] = useState<string[]>([]);
  const [theme, setTheme] = useState<UiThemeChoice>(() => normalizeUiThemeChoice(document.documentElement.dataset.uiTheme));
  const displayLabel = (label ?? nickname) || "User";
  const language = normalizeUiLanguage(locale);
  // 公告仓库只有中/英两份文件，日文界面降级看英文；仓库补上日文公告后删掉这行回退
  const news = useNewsFeed(language === "ja-JP" ? "en" : language);
  const languageLabel = (value: UiLanguage) =>
    value === "zh-CN" ? t("settingsPage.general.chinese") : value === "ja-JP" ? t("settingsPage.general.japanese") : "English";
  // 更新红点与版本行共用同一状态源；有待处理的更新（发现/下载中/已下载）就亮
  const updateState = useAppUpdate();
  const updateView = resolveAppUpdateView(updateState);
  const version = updateState.currentVersion || packageJson.version;
  // 版本称号（如 1.3.0 的"正式版"）随版本走，普通版本查不到就不显示
  const versionTitleKey = resolveVersionTitleKey(version);

  useEffect(() => {
    let active = true;
    const refreshThemeChoice = () => {
      void window.settings?.getGeneral().then((settings) => {
        if (active) setTheme(normalizeUiThemeChoice(
          settings && typeof settings === "object" ? (settings as Record<string, unknown>).uiTheme : undefined,
        ));
      }).catch(() => {});
    };
    refreshThemeChoice();
    const unsubscribe = window.cyreneTheme?.onChanged(refreshThemeChoice);
    return () => { active = false; unsubscribe?.(); };
  }, []);

  async function selectTheme(next: UiThemeChoice) {
    if (next === theme) return;
    const previous = theme;
    setTheme(next);
    applyUiThemeChoice(next);
    try {
      if (!window.settings) throw new Error("Settings API unavailable");
      await window.settings.saveGeneral({ uiTheme: next });
    } catch {
      setTheme(previous);
      applyUiThemeChoice(previous);
    }
  }

  async function selectLanguage(next: UiLanguage) {
    if (next === language) return;
    setUiLocale(next);
    try {
      if (!window.settings) throw new Error("Settings API unavailable");
      await window.settings.saveGeneral({ language: next });
    } catch {
      setUiLocale(language);
    }
  }

  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            className="cy-user-avatar cy-user-avatar__trigger"
            aria-label={t("ui.openUserMenu")}
          >
            <span className="cy-user-avatar-circle">
              {avatarUrl
                ? <img src={avatarUrl} alt={t("ui.userAlt")} draggable={false} />
                : <span>U</span>}
              {news.unreadCount > 0 && (
                <span className="cy-user-avatar-dot" aria-hidden="true">
                  {news.unreadCount > 1 ? news.unreadCount : ""}
                </span>
              )}
              {/* 更新提示点放左上角，避开右上角的公告未读点 */}
              {updateView.badge && (
                <span className="cy-user-avatar-dot cy-user-avatar-dot--update" aria-hidden="true" />
              )}
            </span>
            <span className="cy-user-avatar-label">{displayLabel}</span>
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content className="cy-user-menu" side="top" align="start" sideOffset={10} collisionPadding={12}>
            <DropdownMenu.Label className="cy-user-menu__identity">
              <span className="cy-user-menu__avatar">
                {avatarUrl
                  ? <img src={avatarUrl} alt="" draggable={false} />
                  : <span>{displayLabel.slice(0, 1).toUpperCase()}</span>}
              </span>
              <span className="cy-user-menu__identity-copy">
                <strong>{displayLabel}</strong>
              </span>
            </DropdownMenu.Label>
            <DropdownMenu.Separator className="cy-user-menu__separator" />
            <DropdownMenu.Item className="cy-user-menu__item" onSelect={() => setProfileOpen(true)}>
              <UserRound size={16} aria-hidden="true" />
              <span>{t("ui.profile.title")}</span>
            </DropdownMenu.Item>
            <DropdownMenu.Sub>
              <DropdownMenu.SubTrigger className="cy-user-menu__item">
                <Palette size={16} aria-hidden="true" />
                <span>{t("settingsPage.theme")}</span>
                <span className="cy-user-menu__value">{t(theme === "system" ? "settingsPage.themeSystem" : theme === "pearl-white" ? "settingsPage.themePearlWhite" : "settingsPage.themeCharcoalPink")}</span>
                <ChevronRight className="cy-user-menu__chevron" size={15} aria-hidden="true" />
              </DropdownMenu.SubTrigger>
              <DropdownMenu.Portal>
                <DropdownMenu.SubContent className="cy-user-menu cy-user-menu__submenu" sideOffset={6} collisionPadding={12}>
                  <DropdownMenu.RadioGroup value={theme} onValueChange={(value) => void selectTheme(value as UiThemeChoice)}>
                    <DropdownMenu.RadioItem className="cy-user-menu__item" value="system">
                      <DropdownMenu.ItemIndicator className="cy-user-menu__check"><Check size={14} aria-hidden="true" /></DropdownMenu.ItemIndicator>
                      <span>{t("settingsPage.themeSystem")}</span>
                    </DropdownMenu.RadioItem>
                    <DropdownMenu.RadioItem className="cy-user-menu__item" value="pearl-white">
                      <DropdownMenu.ItemIndicator className="cy-user-menu__check"><Check size={14} aria-hidden="true" /></DropdownMenu.ItemIndicator>
                      <span>{t("settingsPage.themePearlWhite")}</span>
                    </DropdownMenu.RadioItem>
                    <DropdownMenu.RadioItem className="cy-user-menu__item" value="charcoal-pink">
                      <DropdownMenu.ItemIndicator className="cy-user-menu__check"><Check size={14} aria-hidden="true" /></DropdownMenu.ItemIndicator>
                      <span>{t("settingsPage.themeCharcoalPink")}</span>
                    </DropdownMenu.RadioItem>
                  </DropdownMenu.RadioGroup>
                </DropdownMenu.SubContent>
              </DropdownMenu.Portal>
            </DropdownMenu.Sub>
            <DropdownMenu.Sub>
              <DropdownMenu.SubTrigger className="cy-user-menu__item">
                <Languages size={16} aria-hidden="true" />
                <span>{t("settingsPage.general.language")}</span>
                <span className="cy-user-menu__value">{languageLabel(language)}</span>
                <ChevronRight className="cy-user-menu__chevron" size={15} aria-hidden="true" />
              </DropdownMenu.SubTrigger>
              <DropdownMenu.Portal>
                <DropdownMenu.SubContent className="cy-user-menu cy-user-menu__submenu" sideOffset={6} collisionPadding={12}>
                  <DropdownMenu.RadioGroup value={language} onValueChange={(value) => void selectLanguage(value as UiLanguage)}>
                    <DropdownMenu.RadioItem className="cy-user-menu__item" value="zh-CN">
                      <DropdownMenu.ItemIndicator className="cy-user-menu__check"><Check size={14} aria-hidden="true" /></DropdownMenu.ItemIndicator>
                      <span>{t("settingsPage.general.chinese")}</span>
                    </DropdownMenu.RadioItem>
                    <DropdownMenu.RadioItem className="cy-user-menu__item" value="en">
                      <DropdownMenu.ItemIndicator className="cy-user-menu__check"><Check size={14} aria-hidden="true" /></DropdownMenu.ItemIndicator>
                      <span>English</span>
                    </DropdownMenu.RadioItem>
                    <DropdownMenu.RadioItem className="cy-user-menu__item" value="ja-JP">
                      <DropdownMenu.ItemIndicator className="cy-user-menu__check"><Check size={14} aria-hidden="true" /></DropdownMenu.ItemIndicator>
                      <span>{t("settingsPage.general.japanese")}</span>
                    </DropdownMenu.RadioItem>
                  </DropdownMenu.RadioGroup>
                </DropdownMenu.SubContent>
              </DropdownMenu.Portal>
            </DropdownMenu.Sub>
            <DropdownMenu.Separator className="cy-user-menu__separator" />
            <DropdownMenu.Item className="cy-user-menu__item" onSelect={() => setReportOpen(true)}>
              <Bug size={16} aria-hidden="true" />
              <span>{t("ui.reportIssue.menuEntry")}</span>
            </DropdownMenu.Item>
            {/* 版本行：点开跳到设置页"常规"的软件更新处 */}
            <DropdownMenu.Item
              className="cy-user-menu__item"
              onSelect={() => void window.settings?.openSection?.("general")}
            >
              <Package size={16} aria-hidden="true" />
              <span>{t("ui.version.menuEntry")}</span>
              <span className="cy-user-menu__value">
                v{version}
                {versionTitleKey && ` · ${t(versionTitleKey)}`}
              </span>
              {updateView.badge && <span className="cy-user-menu__dot" aria-hidden="true" />}
            </DropdownMenu.Item>
            {/* 官网入口：默认浏览器打开 */}
            <DropdownMenu.Item
              className="cy-user-menu__item"
              onSelect={() => void window.system?.openExternal(WEBSITE_URL)}
            >
              <Globe size={16} aria-hidden="true" />
              <span>{t("ui.website.menuEntry")}</span>
            </DropdownMenu.Item>
            <DropdownMenu.Item
              className="cy-user-menu__item"
              onSelect={() => {
                setNewsUnreadSnapshot(news.unreadIds);
                setNewsOpen(true);
                news.markRead();
              }}
            >
              <Megaphone size={16} aria-hidden="true" />
              <span>{t("ui.news.menuEntry")}</span>
              {news.unreadCount > 0 && (
                <span className="cy-user-menu__dot" aria-hidden="true">
                  {news.unreadCount}
                </span>
              )}
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      <UserProfileDialog open={profileOpen} onOpenChange={setProfileOpen} avatarUrl={avatarUrl} />
      <IssueReportDialog open={reportOpen} onOpenChange={setReportOpen} />
      <NewsDialog
        open={newsOpen}
        onOpenChange={setNewsOpen}
        items={news.items}
        unreadIds={newsUnreadSnapshot}
        loading={news.loading}
        failed={news.failed}
      />
    </>
  );
}
