import type { ReactNode } from "react";
import { Megaphone, X } from "lucide-react";
import { Dialog } from "radix-ui";
import { Streamdown, defaultRehypePlugins, type Components } from "streamdown";
import type { PluggableList } from "unified";
import type { NewsItem } from "../../../../shared/news-types";
import { useTranslation } from "../../i18n";
import "./NewsDialog.css";

/** 公告链接一律交给系统浏览器打开，避免整窗口被导航走 */
function NewsAnchor({ href, children }: { href?: string; children?: ReactNode }) {
  return (
    <a
      href={href}
      onClick={(event) => {
        event.preventDefault();
        if (href) void window.system?.openExternal(href);
      }}
    >
      {children}
    </a>
  );
}

const newsComponents: Components = {
  a: (props) => <NewsAnchor {...props} />,
};

/**
 * 远端文本不可信（仓库账号一旦被盗就等于往客户端塞内容），
 * 所以强制走 Streamdown 的 sanitize + harden，只保留安全的 Markdown 结构。
 */
const newsRehypePlugins: PluggableList = [
  defaultRehypePlugins.raw,
  defaultRehypePlugins.sanitize,
  defaultRehypePlugins.harden,
];

export function NewsDialog({
  open,
  onOpenChange,
  items,
  unreadIds,
  loading,
  failed,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: NewsItem[];
  /** 未读条目 id，用于在卡片上标出来 */
  unreadIds: string[];
  loading: boolean;
  failed: boolean;
}) {
  const { t } = useTranslation();
  const empty = !loading && !failed && items.length === 0;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="cy-news__overlay" />
        <Dialog.Content className="cy-news" aria-describedby="cy-news-description">
          <header className="cy-news__header">
            <div>
              <Dialog.Title className="cy-news__title">
                <Megaphone size={17} aria-hidden="true" />
                {t("ui.news.title")}
              </Dialog.Title>
              <Dialog.Description id="cy-news-description" className="cy-news__description">
                {t("ui.news.description")}
              </Dialog.Description>
            </div>
            <Dialog.Close className="cy-news__close" aria-label={t("ui.news.close")}>
              <X size={16} aria-hidden="true" />
            </Dialog.Close>
          </header>
          <div className="cy-news__body">
            {loading && <p className="cy-news__placeholder">{t("ui.news.loading")}</p>}
            {failed && <p className="cy-news__placeholder">{t("ui.news.failed")}</p>}
            {empty && <p className="cy-news__placeholder">{t("ui.news.empty")}</p>}
            {!loading &&
              !failed &&
              items.map((item) => (
                <article
                  key={item.id}
                  className="cy-news__item"
                  data-unread={unreadIds.includes(item.id) ? "true" : undefined}
                >
                  {(item.date || item.title) && (
                    <header className="cy-news__item-head">
                      {item.date && <time className="cy-news__item-date">{item.date}</time>}
                      {item.title && <h3 className="cy-news__item-title">{item.title}</h3>}
                    </header>
                  )}
                  <Streamdown
                    mode="static"
                    plugins={{}}
                    components={newsComponents}
                    rehypePlugins={newsRehypePlugins}
                    controls={{ table: false }}
                    className="cy-news__markdown"
                  >
                    {item.body}
                  </Streamdown>
                </article>
              ))}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}