import { useEffect, useState } from "react";
import { Alert, Button, Empty, Input, Modal, Radio, Spin } from "antd";
import { BookOpen, Pencil, RefreshCw, ShieldAlert, Trash2 } from "lucide-react";
import type {
  WikiClaim,
  WikiConflict,
  WikiPageDetail,
  WikiPageSummary,
  WikiTag,
} from "../../../../shared/wiki-memory-types";
import { formatDateTime } from "../../../settings/shared/format";
import { Card } from "../../components/ui/Card";
import { useTranslation } from "../../i18n";

const PAGE_SIZE = 30;
type TagFilter = WikiTag | "all";

export function WikiKnowledgePanel() {
  const { t } = useTranslation();
  const [tag, setTag] = useState<TagFilter>("all");
  const [searchText, setSearchText] = useState("");
  const [query, setQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const [pages, setPages] = useState<WikiPageSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [conflicts, setConflicts] = useState<WikiConflict[]>([]);
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [detail, setDetail] = useState<WikiPageDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [detailFailed, setDetailFailed] = useState(false);
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [correction, setCorrection] = useState<WikiClaim | null>(null);
  const [correctedValue, setCorrectedValue] = useState("");
  const [correctionNote, setCorrectionNote] = useState("");
  const [deletion, setDeletion] = useState<WikiClaim | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    const api = window.memoryPanel;
    if (!api) {
      setLoadFailed(true);
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadFailed(false);
    const request = { tag: tag === "all" ? undefined : tag, offset, limit: PAGE_SIZE };
    const listPromise = query ? api.searchWiki({ ...request, query }) : api.listWikiPages(request);
    void Promise.allSettled([listPromise, api.listWikiConflicts()]).then(([pagesResult, conflictsResult]) => {
      if (!active) return;
      if (pagesResult.status === "fulfilled") {
        setPages(pagesResult.value.items);
        setTotal(pagesResult.value.total);
      } else {
        setPages([]);
        setTotal(0);
        setLoadFailed(true);
      }
      if (conflictsResult.status === "fulfilled") setConflicts(conflictsResult.value);
      else setLoadFailed(true);
      setLoading(false);
    });
    return () => { active = false; };
  }, [tag, query, offset, refreshVersion]);

  useEffect(() => {
    let active = true;
    if (!selectedPageId) {
      setDetail(null);
      setDetailFailed(false);
      return;
    }
    const api = window.memoryPanel;
    if (!api) {
      setDetailFailed(true);
      return;
    }
    setDetail(null);
    setDetailLoading(true);
    setDetailFailed(false);
    void api.readWikiPage(selectedPageId).then((page) => {
      if (!active) return;
      setDetail(page);
      setDetailFailed(page === null);
    }).catch(() => {
      if (active) setDetailFailed(true);
    }).finally(() => {
      if (active) setDetailLoading(false);
    });
    return () => { active = false; };
  }, [selectedPageId, refreshVersion]);

  function selectTag(next: TagFilter) {
    setTag(next);
    setOffset(0);
  }

  function search(value: string) {
    setQuery(value.trim());
    setOffset(0);
  }

  function refresh() {
    setRefreshVersion((value) => value + 1);
  }

  function startCorrection(claim: WikiClaim) {
    setCorrection(claim);
    setCorrectedValue(claim.value);
    setCorrectionNote("");
    setNotice(null);
  }

  async function saveCorrection() {
    const value = correctedValue.trim();
    if (!correction || !selectedPageId || !value || saving) return;
    const api = window.memoryPanel;
    if (!api) return;
    setSaving(true);
    try {
      const result = await api.correctWikiClaim({ pageId: selectedPageId, claimId: correction.id, value, note: correctionNote.trim() || undefined });
      if (!result.ok) throw new Error(result.error ?? "Correction failed");
      setCorrection(null);
      setNotice({ type: "success", text: t("settingsPage.memory.wiki.corrected") });
      refresh();
    } catch {
      setNotice({ type: "error", text: t("settingsPage.memory.wiki.saveFailed") });
    } finally {
      setSaving(false);
    }
  }

  async function deleteClaim() {
    if (!deletion || !selectedPageId || saving) return;
    const api = window.memoryPanel;
    if (!api) return;
    setSaving(true);
    try {
      const result = await api.deleteWikiClaim({ pageId: selectedPageId, claimId: deletion.id });
      if (!result.ok) throw new Error(result.error ?? "Deletion failed");
      setDeletion(null);
      setNotice({ type: "success", text: t("settingsPage.memory.wiki.deleted") });
      refresh();
    } catch {
      setNotice({ type: "error", text: t("settingsPage.memory.wiki.saveFailed") });
    } finally {
      setSaving(false);
    }
  }

  const wiki = "settingsPage.memory.wiki";

  return <section className="cy-settings-section">
    <div className="cy-settings-section__heading"><h2><BookOpen size={18} />{t(`${wiki}.title`)}</h2><p>{t(`${wiki}.description`)}</p></div>
    {notice && <Alert className="cy-settings-alert" showIcon type={notice.type} title={notice.text} closable onClose={() => setNotice(null)} />}
    <Card className="cy-memory-card">
      <div className="cy-settings-row cy-cyrene-radio-row">
        <div className="cy-settings-row__copy"><strong>{t(`${wiki}.browse`)}</strong><span>{t(`${wiki}.pageCount`, { count: total })}</span></div>
        <Button icon={<RefreshCw size={14} />} onClick={refresh} loading={loading}>{t(`${wiki}.refresh`)}</Button>
      </div>
      <div className="cy-settings-row cy-cyrene-radio-row">
        <div className="cy-settings-row__copy"><strong>{t(`${wiki}.tags`)}</strong></div>
        <Radio.Group value={tag} optionType="button" buttonStyle="solid" onChange={(event) => selectTag(event.target.value as TagFilter)}>
          <Radio.Button value="all">{t(`${wiki}.tag.all`)}</Radio.Button>
          <Radio.Button value="chat">{t(`${wiki}.tag.chat`)}</Radio.Button>
          <Radio.Button value="learn">{t(`${wiki}.tag.learn`)}</Radio.Button>
          <Radio.Button value="work">{t(`${wiki}.tag.work`)}</Radio.Button>
          <Radio.Button value="code">{t(`${wiki}.tag.code`)}</Radio.Button>
        </Radio.Group>
      </div>
      <Input.Search value={searchText} onChange={(event) => setSearchText(event.target.value)} onSearch={search} placeholder={t(`${wiki}.searchPlaceholder`)} enterButton={t(`${wiki}.search`)} allowClear />
      {loadFailed && <Alert className="cy-settings-alert" showIcon type="error" title={t(`${wiki}.loadFailed`)} />}
      {loading ? <div className="cy-settings-loading"><Spin /></div> : pages.length ? <div className="cy-memory-list">
        {pages.map((page) => <article className="cy-memory-record" key={page.id}>
          <Button type="link" onClick={() => setSelectedPageId(page.id)}>{page.title}</Button>
          <span>{page.excerpt}</span>
          <small>{page.tags.map((item) => t(`${wiki}.tag.${item}`)).join(" · ")} · {page.scope.kind === "workspace" ? page.scope.workspaceName || t(`${wiki}.workspaceScope`) : t(`${wiki}.globalScope`)} · {t(`${wiki}.claimCount`, { count: page.claimCount })} · {formatDateTime(page.updatedAt)}</small>
        </article>)}
      </div> : !loadFailed && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={query ? t(`${wiki}.noMatch`) : t(`${wiki}.empty`)} />}
      {total > PAGE_SIZE && <div className="cy-memory-vault-actions">
        <Button disabled={offset === 0 || loading} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>{t(`${wiki}.previous`)}</Button>
        <span>{t(`${wiki}.range`, { from: offset + 1, to: Math.min(offset + PAGE_SIZE, total), total })}</span>
        <Button disabled={offset + PAGE_SIZE >= total || loading} onClick={() => setOffset(offset + PAGE_SIZE)}>{t(`${wiki}.next`)}</Button>
      </div>}
    </Card>
    <div className="cy-settings-section__heading"><h2><ShieldAlert size={18} />{t(`${wiki}.conflictsTitle`)}</h2><p>{t(`${wiki}.conflictsDescription`)}</p></div>
    <Card className="cy-memory-list">{conflicts.length ? conflicts.map((item, index) => <article className="cy-memory-record" key={`${item.pageId}-${index}`}>
      <Button type="link" onClick={() => setSelectedPageId(item.pageId)}>{item.pageTitle}</Button>
      <span>{item.reason}</span>
    </article>) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t(`${wiki}.noConflicts`)} />}</Card>
    {selectedPageId && <section className="cy-settings-section">
      <div className="cy-settings-section__heading"><h2>{t(`${wiki}.detailTitle`)}</h2><Button onClick={() => setSelectedPageId(null)}>{t(`${wiki}.closeDetail`)}</Button></div>
      {detailLoading ? <div className="cy-settings-loading"><Spin /></div> : detailFailed ? <Card><Alert showIcon type="error" title={t(`${wiki}.detailFailed`)} /></Card> : detail && <Card className="cy-memory-card">
        <div className="cy-memory-card__top"><strong>{detail.title}</strong><span>{detail.scope.kind === "workspace" ? detail.scope.workspaceName || t(`${wiki}.workspaceScope`) : t(`${wiki}.globalScope`)}</span></div>
        <div className="cy-memory-card__top"><span>{detail.tags.map((item) => t(`${wiki}.tag.${item}`)).join(" · ")}</span><small>{formatDateTime(detail.updatedAt)}</small></div>
        {detail.claims.length ? <div className="cy-memory-list">{detail.claims.map((claim) => <article className="cy-memory-record" key={claim.id}>
          <strong>{claim.predicate}：{claim.value}</strong>
          <small>{t(`${wiki}.status.${claim.status}`)} · {t(`${wiki}.learnedAt`, { time: formatDateTime(claim.assertedAt) })}</small>
          {claim.sources.length > 0 && <div className="cy-memory-list">{claim.sources.map((source) => <div className="cy-memory-record" key={source.sourceId}>
            <small>{t(`${wiki}.source.${source.kind}`)} · {source.label || source.locator} · {formatDateTime(source.recordedAt)}</small>
            {source.quote && <span>“{source.quote}”</span>}
            {source.kind === "chat" && source.conversationId && <Button type="link" size="small" onClick={() => {
              const chatStore = (window as Window & { chatStore?: { openInReactChatWindow: (id: string) => Promise<unknown> } }).chatStore;
              void chatStore?.openInReactChatWindow(source.conversationId!).catch(() => undefined);
            }}>{t(`${wiki}.openSource`)}</Button>}
          </div>)}</div>}
          <div className="cy-memory-card__actions">
            <Button icon={<Pencil size={14} />} onClick={() => startCorrection(claim)}>{t(`${wiki}.correct`)}</Button>
            <Button danger icon={<Trash2 size={14} />} onClick={() => setDeletion(claim)}>{t(`${wiki}.delete`)}</Button>
          </div>
        </article>)}</div> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t(`${wiki}.noClaims`)} />}
        {detail.body && <><strong>{t(`${wiki}.bodyTitle`)}</strong><Input.TextArea readOnly autoSize={{ minRows: 3, maxRows: 14 }} value={detail.body} /></>}
        {detail.relatedPages.length > 0 && <div className="cy-memory-card__actions"><strong>{t(`${wiki}.relatedPages`)}</strong>{detail.relatedPages.map((related) => <Button type="link" key={related.id} onClick={() => setSelectedPageId(related.id)}>{related.title}</Button>)}</div>}
      </Card>}
    </section>}
    <Modal open={Boolean(correction)} title={t(`${wiki}.correctTitle`)} okText={t(`${wiki}.save`)} cancelText={t(`${wiki}.cancel`)} okButtonProps={{ disabled: !correctedValue.trim(), loading: saving }} onOk={() => void saveCorrection()} onCancel={() => setCorrection(null)} destroyOnHidden>
      <p>{correction?.predicate}</p>
      <Input.TextArea value={correctedValue} onChange={(event) => setCorrectedValue(event.target.value)} rows={3} aria-label={t(`${wiki}.newValue`)} />
      <Input value={correctionNote} onChange={(event) => setCorrectionNote(event.target.value)} placeholder={t(`${wiki}.correctionNote`)} aria-label={t(`${wiki}.correctionNote`)} />
    </Modal>
    <Modal open={Boolean(deletion)} title={t(`${wiki}.deleteTitle`)} okText={t(`${wiki}.delete`)} cancelText={t(`${wiki}.cancel`)} okButtonProps={{ danger: true, loading: saving }} onOk={() => void deleteClaim()} onCancel={() => setDeletion(null)} destroyOnHidden>
      <p>{t(`${wiki}.deleteConfirm`, { value: deletion?.value ?? "" })}</p>
    </Modal>
  </section>;
}
