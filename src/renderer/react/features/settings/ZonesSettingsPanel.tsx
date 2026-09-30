// P9 T3 · 记忆区块（zones）设置页（React 重写）。
//
// 对应旧面板 `src/renderer/settings/zones/{panel,picker,manual-group}.ts`
// （H-07 保留的「里子」模块，只读参照）。
//
// 🔴 **不许漏的能力**：`addZoneManualGroup(zoneId, channel, chatId, senderName?)` ——
//    旧代码注释写明这是"新群还没产生会话时**唯一**能加白的入口"
//    （见 `src/preload/index.ts:631` 与 `src/shared/zone-group.ts` 开头）。P9 §四 4.3 点名要求。
//
// 校验规则**复用共享模块** `src/shared/zone-group.ts`（它在 tsconfig.renderer.json 的
// include 面内，且主进程与渲染进程共用同一份正则，正是为了避免口径漂移）。
//
// 🔴 **P9.5 修复（H-19）**：类名与 DOM **一律对齐旧面板的 `zone*`**：
//    `zone-card` → `zone-card__head/__title/__name/__badge/__actions/__note/__config/__members/__empty`、
//    `zone-member-row{,--readonly,.is-selected}` + `__check/__badge/__name/__id`。
//    样式在 `./ZonesPanel.css`（旧 settings.css 的 37 条选择器回收 + 令牌化）。
//    ⚠️ 旧 `.zone-member-row` 是**扁平 flex 行**（checkbox / badge / name / id / 按钮是**同一父节点的
//    直接子元素**），不要再包一层 `<div>`，否则 `margin-left: auto` 把「移出」推不到行尾
//    —— 那正是 P9 里"移出孤零零飘着"的成因（判据台账 J-32）。

import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Button, Empty, Input, Modal, Spin } from "antd";
import { Layers, Plus, RefreshCw, Trash2, UserPlus } from "lucide-react";
import type { Zone, ZoneConfig, ZoneExternalMember, ZoneMember, ZonesSnapshot } from "../../../settings/shared/types";
import {
  MANUAL_GROUP_CHANNELS,
  normalizeManualGroupChatId,
  normalizeManualGroupName,
  type ManualGroupChannel,
} from "../../../../shared/zone-group";
import { useTranslation } from "../../i18n";
import { SettingsSwitch } from "../../components/ui/SettingsControls";
import { Card } from "../../components/ui/Card";
import {
  canDeleteZone,
  canRenameZone,
  collectMemberPickEntries,
  findRootPrivateMember,
  isZoneConfigLocked,
  pickEntryToMember,
  resolveMemberDisplayName,
  zoneMemberCount,
  zoneMemberKey,
} from "./zones/rules";
import "./ZonesPanel.css";

type Feedback = { type: "success" | "error" | "info"; text: string } | null;

/** 手动加群的渠道选择（与 `MANUAL_GROUP_CHANNELS` 一一对应，避免两处各写一遍）。 */
const CHANNEL_LABEL: Record<ManualGroupChannel, string> = { qq: "QQ（群号）", qqbot: "QQ 机器人（group_openid）" };

function feedbackClass(feedback: Feedback): string {
  if (!feedback) return "zones-feedback";
  if (feedback.type === "success") return "zones-feedback zones-feedback--ok";
  if (feedback.type === "error") return "zones-feedback zones-feedback--err";
  return "zones-feedback";
}

export function ZonesSettingsPanel() {
  const { t } = useTranslation();
  const api = window.memoryPanel;

  const [snapshot, setSnapshot] = useState<ZonesSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [renameTarget, setRenameTarget] = useState<Zone | null>(null);
  const [renameName, setRenameName] = useState("");
  const [pickerZone, setPickerZone] = useState<Zone | null>(null);
  const [manualZone, setManualZone] = useState<Zone | null>(null);
  const [manualChannel, setManualChannel] = useState<ManualGroupChannel>("qq");
  const [manualChatId, setManualChatId] = useState("");
  const [manualName, setManualName] = useState("");

  const load = useCallback(async () => {
    if (!api) { setLoading(false); return; }
    setLoading(true);
    try {
      const next = await api.getZoneSnapshot();
      setSnapshot(next);
      const alive = new Set((next?.zones ?? []).flatMap((zone) => zone.members.map(zoneMemberKey)));
      setSelected((current) => current.filter((key) => alive.has(key)));
    } catch (error) {
      setFeedback({ type: "error", text: t("settingsPage.zones.loadFailed", { error: error instanceof Error ? error.message : String(error) }) });
    } finally { setLoading(false); }
  }, [api, t]);

  useEffect(() => { void load(); }, [load]);

  const zones = snapshot?.zones ?? [];
  const selectedMembers = useMemo<ZoneMember[]>(() => {
    if (!snapshot) return [];
    const all = snapshot.zones.flatMap((zone) => zone.members);
    return all.filter((member) => selected.includes(zoneMemberKey(member)));
  }, [snapshot, selected]);

  async function createZone() {
    const name = createName.trim();
    if (!api || !name) return;
    setBusy("create");
    try {
      await api.createZone(name);
      setCreateOpen(false);
      setCreateName("");
      setFeedback({ type: "success", text: t("settingsPage.zones.created") });
      await load();
    } catch (error) {
      setFeedback({ type: "error", text: t("settingsPage.zones.actionFailed", { error: error instanceof Error ? error.message : String(error) }) });
    } finally { setBusy(""); }
  }

  async function renameZone() {
    const name = renameName.trim();
    if (!api || !renameTarget || !name || !canRenameZone(renameTarget)) return;
    setBusy("rename");
    try {
      await api.renameZone(renameTarget.zoneId, name);
      setRenameTarget(null);
      setFeedback({ type: "success", text: t("settingsPage.zones.renamed") });
      await load();
    } catch (error) {
      setFeedback({ type: "error", text: t("settingsPage.zones.actionFailed", { error: error instanceof Error ? error.message : String(error) }) });
    } finally { setBusy(""); }
  }

  function deleteZone(zone: Zone) {
    if (!api || !canDeleteZone(zone)) return;
    Modal.confirm({
      title: t("settingsPage.zones.deleteTitle"),
      content: t("settingsPage.zones.deleteMessage", { name: zone.zoneName }),
      okText: t("settingsPage.zones.delete"),
      okButtonProps: { danger: true },
      cancelText: t("settingsPage.zones.cancel"),
      onOk: async () => {
        try {
          await api.deleteZone(zone.zoneId);
          setFeedback({ type: "success", text: t("settingsPage.zones.deleted") });
          await load();
        } catch (error) {
          setFeedback({ type: "error", text: t("settingsPage.zones.actionFailed", { error: error instanceof Error ? error.message : String(error) }) });
        }
      },
    });
  }

  async function updateConfig(zone: Zone, patch: Partial<ZoneConfig>) {
    if (!api) return;
    try {
      await api.updateZoneConfig(zone.zoneId, patch);
      await load();
    } catch (error) {
      setFeedback({ type: "error", text: t("settingsPage.zones.actionFailed", { error: error instanceof Error ? error.message : String(error) }) });
    }
  }

  async function addMember(zone: Zone, key: string) {
    if (!api || !snapshot) return;
    const member = pickEntryToMember(snapshot, key);
    if (!member) return;
    setPickerZone(null);
    try {
      const result = await api.addZoneMember(zone.zoneId, member);
      setFeedback(result.ok
        ? { type: "success", text: t("settingsPage.zones.memberAdded") }
        : { type: "error", text: t("settingsPage.zones.actionFailed", { error: result.error }) });
      await load();
    } catch (error) {
      setFeedback({ type: "error", text: t("settingsPage.zones.actionFailed", { error: error instanceof Error ? error.message : String(error) }) });
    }
  }

  /** 🔴 新群还没产生会话时**唯一**能加白的入口 —— 不要漏。 */
  async function addManualGroup() {
    if (!api || !manualZone) return;
    const chatId = normalizeManualGroupChatId(manualChannel, manualChatId);
    if (!chatId) {
      setFeedback({ type: "error", text: t(manualChatId.trim() ? "settingsPage.zones.manualGroup.errorFormat" : "settingsPage.zones.manualGroup.errorEmpty") });
      return;
    }
    setBusy("manual");
    try {
      const result = await api.addZoneManualGroup(manualZone.zoneId, manualChannel, chatId, normalizeManualGroupName(manualName));
      if (!result.ok) {
        setFeedback({ type: "error", text: t("settingsPage.zones.actionFailed", { error: result.error }) });
        return;
      }
      // movedFrom 非空说明该群原本在别的区块里 —— 必须说出来，避免用户以为"两个区块同时拥有它"
      setFeedback({
        type: "success",
        text: result.movedFrom
          ? t("settingsPage.zones.manualGroup.addedMoved", { name: result.movedFrom.zoneName })
          : t("settingsPage.zones.manualGroup.added"),
      });
      setManualZone(null);
      setManualChatId("");
      setManualName("");
      await load();
    } catch (error) {
      setFeedback({ type: "error", text: t("settingsPage.zones.actionFailed", { error: error instanceof Error ? error.message : String(error) }) });
    } finally { setBusy(""); }
  }

  async function removeMember(zone: Zone, member: ZoneMember) {
    if (!api) return;
    try {
      await api.removeZoneMember(zone.zoneId, member);
      setSelected((current) => current.filter((key) => key !== zoneMemberKey(member)));
      setFeedback({ type: "success", text: t("settingsPage.zones.memberRemoved") });
      await load();
    } catch (error) {
      setFeedback({ type: "error", text: t("settingsPage.zones.actionFailed", { error: error instanceof Error ? error.message : String(error) }) });
    }
  }

  async function moveSelected(targetZoneId: string) {
    if (!api || selectedMembers.length === 0) return;
    setBusy("move");
    try {
      const result = await api.moveZoneMembers(targetZoneId, selectedMembers);
      setSelected([]);
      setFeedback(result.errors.length > 0
        ? { type: "error", text: t("settingsPage.zones.movePartial", { moved: result.moved, errors: result.errors.join("；") }) }
        : { type: "success", text: t("settingsPage.zones.moved", { moved: result.moved }) });
      await load();
    } catch (error) {
      setFeedback({ type: "error", text: t("settingsPage.zones.actionFailed", { error: error instanceof Error ? error.message : String(error) }) });
    } finally { setBusy(""); }
  }

  if (!api) {
    return <section className="cy-settings-section">
      <div className="cy-settings-section__heading"><h2><Layers size={18} />{t("settingsPage.zones.title")}</h2></div>
      <Card className="cy-memory-card"><Alert type="error" showIcon message={t("settingsPage.memory.unavailable")} /></Card>
    </section>;
  }

  const pickEntries = snapshot && pickerZone ? collectMemberPickEntries(snapshot, pickerZone.zoneId) : [];

  return <>
    <h1>{t("settingsPage.zones.title")}</h1>
    <p className="cy-settings-intro">{t("settingsPage.zones.description")}</p>
    {loading ? <div className="cy-settings-loading"><Spin /></div> : !snapshot ? null : <>
      <section className="cy-settings-section">
        <div className="cy-settings-section__heading">
          <h2><Layers size={18} />{t("settingsPage.zones.listTitle")}</h2>
          <p>{t("settingsPage.zones.listDescription")}</p>
        </div>

        {/* 工具栏（旧 `zones-toolbar`）：新建 + 刷新 + 反馈行 */}
        <div className="zones-toolbar">
          <Button type="primary" icon={<Plus size={14} />} onClick={() => { setCreateName(""); setCreateOpen(true); }}>{t("settingsPage.zones.create")}</Button>
          <Button icon={<RefreshCw size={14} />} loading={loading} onClick={() => void load()}>{t("settingsPage.zones.refresh")}</Button>
          {selectedMembers.length > 0 && <span className="zones-batch-actions">
            <span>{t("settingsPage.zones.selectedCount", { count: selectedMembers.length })}</span>
            {zones.map((zone) => <Button key={zone.zoneId} size="small" loading={busy === "move"} onClick={() => void moveSelected(zone.zoneId)}>
              {t("settingsPage.zones.moveTo", { name: zone.isRoot ? t("settingsPage.zones.rootName") : zone.zoneName })}
            </Button>)}
          </span>}
          <p className={feedbackClass(feedback)} role="status">{feedback?.text ?? ""}</p>
        </div>

        {zones.length === 0
          ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("settingsPage.zones.empty")} />
          : <div className="zones-list">
            {zones.map((zone) => {
              const privateMember = zone.isRoot ? findRootPrivateMember(zone) : null;
              const externalMembers = zone.members.filter((member): member is ZoneExternalMember => member.kind === "external");
              return <article className={`zone-card${zone.isRoot ? " zone-card--root" : ""}`} key={zone.zoneId}>
                <div className="zone-card__head">
                  <div className="zone-card__title">
                    <h3 className="zone-card__name">{zone.isRoot ? t("settingsPage.zones.rootName") : zone.zoneName}</h3>
                    <span className="zone-card__badge">{t("settingsPage.zones.memberCount", { count: zoneMemberCount(zone, snapshot) })}</span>
                  </div>
                  <div className="zone-card__actions">
                    {canRenameZone(zone) && <Button type="text" onClick={() => { setRenameTarget(zone); setRenameName(zone.zoneName); }}>{t("settingsPage.zones.rename")}</Button>}
                    {canDeleteZone(zone) && <Button type="text" danger icon={<Trash2 size={14} />} onClick={() => deleteZone(zone)}>{t("settingsPage.zones.delete")}</Button>}
                  </div>
                </div>

                {zone.isRoot && <p className="zone-card__note">{t("settingsPage.zones.rootHint")}</p>}

                <div className="zone-card__members">
                  {/* root 自动包含全部桌面对话 → 只读展示，不可勾选、不可移出 */}
                  {zone.isRoot && (snapshot.conversations ?? []).map((conversation) => <div className="zone-member-row zone-member-row--readonly" key={conversation.id}>
                    <span className="zone-member-row__badge">{t("settingsPage.zones.badgeDesktop")}</span>
                    <span className="zone-member-row__name">{conversation.title || t("settingsPage.zones.untitledConversation")}</span>
                    <span className="zone-member-row__id">{conversation.id}</span>
                  </div>)}

                  {externalMembers.map((member) => {
                    const key = zoneMemberKey(member);
                    const knownName = snapshot.externalChats.find((chat) => chat.sessionId === member.sessionId)?.senderName;
                    return <div className={`zone-member-row${selected.includes(key) ? " is-selected" : ""}`} key={key}>
                      <label className="zone-member-row__check">
                        <input
                          type="checkbox"
                          checked={selected.includes(key)}
                          aria-label={t("settingsPage.zones.selectMember")}
                          onChange={(event) => setSelected((current) => event.target.checked ? [...current, key] : current.filter((x) => x !== key))}
                        />
                      </label>
                      <span className="zone-member-row__badge">{t(member.chatType === "group" ? "settingsPage.zones.badgeGroup" : "settingsPage.zones.badgePrivate")}</span>
                      <span className="zone-member-row__name">{resolveMemberDisplayName(member, knownName)}</span>
                      <span className="zone-member-row__id">{member.channel} · {member.chatId}</span>
                      <Button className="zone-member-row__remove" type="text" danger onClick={() => void removeMember(zone, member)}>{t("settingsPage.zones.removeMember")}</Button>
                    </div>;
                  })}

                  {externalMembers.length === 0 && !zone.isRoot && <p className="zone-card__empty">{t("settingsPage.zones.noMembers")}</p>}
                </div>

                <div className="zone-card__actions">
                  <Button icon={<UserPlus size={14} />} onClick={() => setPickerZone(zone)}>{t("settingsPage.zones.addMember")}</Button>
                  {/* 🔴 手动按群号加白：新群还没产生会话时唯一入口 */}
                  <Button onClick={() => { setManualZone(zone); setManualChannel(MANUAL_GROUP_CHANNELS[0]); setManualChatId(""); setManualName(""); }}>
                    {t("settingsPage.zones.manualGroup.button")}
                  </Button>
                </div>

                {/* 两个开关同一行（旧 `zone-card__config` 的 flex 行） */}
                <div className="zone-card__config">
                  <label className="zone-card__switch">
                    <SettingsSwitch
                      ariaLabel={t("settingsPage.zones.observeTitle")}
                      checked={zone.config.observeGroupMessages}
                      disabled={isZoneConfigLocked(zone, "observeGroupMessages")}
                      onChange={(checked) => void updateConfig(zone, { observeGroupMessages: checked })}
                    />
                    <span>{t("settingsPage.zones.observeTitle")}</span>
                  </label>
                  <label className="zone-card__switch">
                    <SettingsSwitch
                      ariaLabel={t("settingsPage.zones.injectTitle")}
                      checked={zone.config.injectOwnerProfile}
                      disabled={isZoneConfigLocked(zone, "injectOwnerProfile")}
                      onChange={(checked) => void updateConfig(zone, { injectOwnerProfile: checked })}
                    />
                    <span>{t("settingsPage.zones.injectTitle")}</span>
                  </label>
                </div>
                <p className="zone-card__note">{t("settingsPage.zones.observeDescription")}</p>
                <p className="zone-card__note">{t("settingsPage.zones.injectDescription")}</p>

                {zone.isRoot && <p className="zone-card__note">{privateMember
                  ? t("settingsPage.zones.privateMapping", { name: resolveMemberDisplayName(privateMember) })
                  : t("settingsPage.zones.privateMappingNone")}</p>}
              </article>;
            })}
          </div>}
      </section>
    </>}

    {/* 建区块 */}
    <Modal
      className="cy-settings-theme-modal"
      open={createOpen}
      title={t("settingsPage.zones.createTitle")}
      okText={t("settingsPage.zones.create")}
      okButtonProps={{ disabled: !createName.trim(), loading: busy === "create" }}
      cancelText={t("settingsPage.zones.cancel")}
      onCancel={() => setCreateOpen(false)}
      onOk={() => void createZone()}
    >
      <Input value={createName} placeholder={t("settingsPage.zones.namePlaceholder")} onChange={(event) => setCreateName(event.target.value)} />
    </Modal>

    {/* 改名（root 不提供：主进程也会忽略） */}
    <Modal
      className="cy-settings-theme-modal"
      open={Boolean(renameTarget)}
      title={t("settingsPage.zones.renameTitle")}
      okText={t("settingsPage.zones.rename")}
      okButtonProps={{ disabled: !renameName.trim(), loading: busy === "rename" }}
      cancelText={t("settingsPage.zones.cancel")}
      onCancel={() => setRenameTarget(null)}
      onOk={() => void renameZone()}
    >
      <Input value={renameName} placeholder={t("settingsPage.zones.namePlaceholder")} onChange={(event) => setRenameName(event.target.value)} />
    </Modal>

    {/* 成员选择器：只列 externalChats；已在目标区块的置灰，已在别处的标注来源 */}
    <Modal
      className="cy-settings-theme-modal zones-picker"
      open={Boolean(pickerZone)}
      title={t("settingsPage.zones.pickerTitle", { name: pickerZone?.zoneName ?? "" })}
      footer={null}
      onCancel={() => setPickerZone(null)}
    >
      <p className="cy-settings-intro">{t("settingsPage.zones.pickerDescription")}</p>
      {pickEntries.length === 0
        ? <p className="zones-picker__empty">{t("settingsPage.zones.pickerEmpty")}</p>
        : <div className="zones-picker__list">
          {pickEntries.map((entry) => <button
            type="button"
            className={`zones-picker__item${entry.disabled ? " is-disabled" : ""}`}
            key={entry.key}
            disabled={entry.disabled}
            onClick={() => pickerZone && void addMember(pickerZone, entry.key)}
          >
            <span className="zones-picker__label">{entry.label}</span>
            <span className="zones-picker__note">{entry.note}</span>
          </button>)}
        </div>}
    </Modal>

    {/* 🔴 手动按群号加白：新群还没产生会话时唯一入口 */}
    <Modal
      className="cy-settings-theme-modal"
      open={Boolean(manualZone)}
      title={t("settingsPage.zones.manualGroup.title", { name: manualZone?.zoneName ?? "" })}
      okText={t("settingsPage.zones.manualGroup.confirm")}
      okButtonProps={{ loading: busy === "manual", disabled: !manualChatId.trim() }}
      cancelText={t("settingsPage.zones.cancel")}
      onCancel={() => setManualZone(null)}
      onOk={() => void addManualGroup()}
    >
      <p className="cy-settings-intro">{t("settingsPage.zones.manualGroup.description")}</p>
      <div className="cy-settings-button-group">
        {MANUAL_GROUP_CHANNELS.map((channel) => <Button
          key={channel}
          type={manualChannel === channel ? "primary" : "default"}
          aria-pressed={manualChannel === channel}
          onClick={() => { setManualChannel(channel); setManualChatId(""); }}
        >{CHANNEL_LABEL[channel]}</Button>)}
      </div>
      <Input
        value={manualChatId}
        placeholder={t(manualChannel === "qq" ? "settingsPage.zones.manualGroup.placeholderQq" : "settingsPage.zones.manualGroup.placeholderQqbot")}
        onChange={(event) => setManualChatId(event.target.value)}
      />
      <Input
        value={manualName}
        placeholder={t("settingsPage.zones.manualGroup.namePlaceholder")}
        onChange={(event) => setManualName(event.target.value)}
      />
      <p className="cy-settings-intro">{t("settingsPage.zones.manualGroup.hint")}</p>
    </Modal>
  </>;
}
