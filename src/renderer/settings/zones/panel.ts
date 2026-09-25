// Zones（记忆区块）面板业务逻辑：加载 / 渲染 / 事件绑定。
//
// 服务端校验规则（主进程 zone-store 强制，这里只给友好提示，不绕过）：
//   - root 不可删除、不可改名；root 的 injectOwnerProfile 恒为开（关闭请求会被主进程忽略）
//   - root 最多 1 个私聊映射，超限时后端返回 { ok:false, error:"root 区块只能有一个私聊映射" }
//   - 一个会话同一时刻只属于一个区块：加进新区块会自动从旧区块移出
//   - kind:"desktop" 只允许出现在 root，且 root 自动包含全部桌面对话 → 这里只读展示

import { zonesState } from "./state";
import {
  zonesCreateBtn, zonesBatchBar, zonesBatchCount,
  zonesBatchMoveBtn, zonesBatchRemoveBtn, zonesList,
} from "./dom";
import {
  closeZonePicker, collectMemberPickEntries, openZonePicker,
  pickEntryToMember, zoneMemberKey, type ZonePickerItem,
} from "./picker";
import {
  MANUAL_GROUP_CHANNEL_OPTIONS, checkManualGroupInput, manualGroupAddedKey,
  manualGroupErrorKey, resolveMemberDisplayName,
} from "./manual-group";
import { escapeHtml } from "../shared/format";
import { showInputModal, showModal } from "../shared/modal";
import { t } from "../i18n";
import type { Zone, ZoneExternalMember, ZoneMember, ZonesSnapshot } from "../shared/types";

type FeedbackKind = "ok" | "err";

let feedbackTimer: number | null = null;

/** 面板内的即时反馈（加成员 / 移动 / 后端校验失败都在这里说清楚）。 */
function setZonesFeedback(kind: FeedbackKind, message: string): void {
  const el = document.getElementById("zones-feedback");
  if (!el) return;
  el.textContent = message;
  el.className = "zones-feedback";
  el.classList.add(kind === "ok" ? "zones-feedback--ok" : "zones-feedback--err");
  if (feedbackTimer != null) window.clearTimeout(feedbackTimer);
  // 错误留在页面上直到下次操作；成功提示 4 秒后自动消失
  if (kind === "ok") {
    feedbackTimer = window.setTimeout(() => {
      el.textContent = "";
      el.className = "zones-feedback";
    }, 4000);
  }
}

function clearZonesFeedback(): void {
  if (feedbackTimer != null) window.clearTimeout(feedbackTimer);
  feedbackTimer = null;
  const el = document.getElementById("zones-feedback");
  if (!el) return;
  el.textContent = "";
  el.className = "zones-feedback";
}

function zoneDisplayName(zone: Zone): string {
  // root 名字固定为 desktop（主进程也会忽略由 UI 发起的改名）
  return zone.isRoot ? "desktop" : zone.zoneName;
}

function memberBadgeLabel(member: ZoneMember): string {
  if (member.kind === "desktop") return t("settings.panel.zones.badge.desktop");
  return member.chatType === "group"
    ? t("settings.panel.zones.badge.group")
    : t("settings.panel.zones.badge.private");
}

/** 成员数量：root 还要算上自动包含的桌面对话（它们不是显式成员）。 */
export function zoneMemberCount(zone: Zone, snapshot: ZonesSnapshot): number {
  return zone.members.length + (zone.isRoot ? snapshot.conversations.length : 0);
}

/**
 * root 的「私聊映射」说明：只显示这个私聊成员自己。
 *
 * 历史：这里曾经显示「昵称 → 桌面对话（↔ 桌面双向镜像）」，因为私聊可以绑定
 * 一个桌面对话做双向镜像。镜像功能已删除，所以现在只说"这个私聊归在 root 里"，
 * 不再指向任何桌面对话；没有私聊成员时显示「未绑定」。
 */
export function describePrivateMapping(snapshot: ZonesSnapshot, zone: Zone): string {
  const privateMember = zone.members.find(
    (member): member is ZoneExternalMember => member.kind === "external" && member.chatType === "private",
  );
  if (!privateMember) return t("settings.panel.zones.privateMappingNone");
  const chat = snapshot.externalChats.find((item) => item.sessionId === privateMember.sessionId);
  return t("settings.panel.zones.privateMapping", {
    name: privateMember.senderName || chat?.senderName || privateMember.chatId,
  });
}

/** root 自动包含的桌面对话：只读一行，不可勾选、不可移出。 */
function renderDesktopRow(conversation: { id: string; title: string }): string {
  return [
    '<div class="zone-member-row zone-member-row--readonly">',
    '  <span class="zone-member-row__check"></span>',
    `  <span class="zone-member-row__badge">${escapeHtml(t("settings.panel.zones.badge.desktop"))}</span>`,
    `  <span class="zone-member-row__name">${escapeHtml(conversation.title || t("settings.panel.zones.untitledConversation"))}</span>`,
    `  <span class="zone-member-row__id">${escapeHtml(conversation.id)}</span>`,
    '</div>',
  ].join("\n");
}

function renderExternalRow(member: ZoneExternalMember, zoneId: string, snapshot: ZonesSnapshot): string {
  const key = zoneMemberKey(member);
  const selected = zonesState.selectedKeys.has(key);
  // 手动加群时只有群号没有昵称；群里说过话后 context-bindings 会补齐群名，这里顺带用上
  const knownName = snapshot.externalChats.find((chat) => chat.sessionId === member.sessionId)?.senderName;
  return [
    `<div class="zone-member-row${selected ? " is-selected" : ""}" data-member-key="${escapeHtml(key)}">`,
    `  <label class="zone-member-row__check"><input type="checkbox" data-zone-member="1"`,
    ` data-member-key="${escapeHtml(key)}"${selected ? " checked" : ""}`,
    ` aria-label="${escapeHtml(t("settings.panel.zones.selectMember"))}" /></label>`,
    `  <span class="zone-member-row__badge">${escapeHtml(memberBadgeLabel(member))}</span>`,
    `  <span class="zone-member-row__name">${escapeHtml(resolveMemberDisplayName(member, knownName))}</span>`,
    `  <span class="zone-member-row__id">${escapeHtml(`${member.channel} · ${member.chatId}`)}</span>`,
    `  <button type="button" class="ghost-btn ghost-btn--danger" data-zone-action="remove-member"`,
    ` data-zone-id="${escapeHtml(zoneId)}" data-member-key="${escapeHtml(key)}">`,
    `${escapeHtml(t("settings.panel.zones.removeMember"))}</button>`,
    '</div>',
  ].join("");
}

function renderConfigRow(input: {
  zoneId: string;
  key: "observeGroupMessages" | "injectOwnerProfile";
  label: string;
  checked: boolean;
  disabled?: boolean;
}): string {
  return [
    '<label class="zone-card__switch">',
    `<input type="checkbox" data-zone-config="${input.key}" data-zone-id="${escapeHtml(input.zoneId)}"`,
    `${input.checked ? " checked" : ""}${input.disabled ? " disabled" : ""} />`,
    `<span>${escapeHtml(input.label)}</span>`,
    '</label>',
  ].join("");
}

/** 单个区块卡片。root 卡片不渲染改名 / 删除按钮，并额外说明桌面对话与私聊映射。 */
export function renderZoneCard(zone: Zone, snapshot: ZonesSnapshot): string {
  const zoneId = escapeHtml(zone.zoneId);
  const desktopRows = zone.isRoot
    ? snapshot.conversations.map((conversation) => renderDesktopRow(conversation))
    : [];
  const externalRows = zone.members
    .filter((member): member is ZoneExternalMember => member.kind === "external")
    .map((member) => renderExternalRow(member, zone.zoneId, snapshot));
  const memberRows = [...desktopRows, ...externalRows];

  const actions = [
    `<button type="button" class="ghost-btn" data-zone-action="add-member" data-zone-id="${zoneId}">`
      + `${escapeHtml(t("settings.panel.zones.addMember"))}</button>`,
    `<button type="button" class="ghost-btn" data-zone-action="add-group-manual" data-zone-id="${zoneId}"`
      + ` title="${escapeHtml(t("settings.panel.zones.manualGroup.buttonHint"))}">`
      + `${escapeHtml(t("settings.panel.zones.manualGroup.button"))}</button>`,
  ];
  if (!zone.isRoot) {
    actions.push(
      `<button type="button" class="ghost-btn" data-zone-action="rename-zone" data-zone-id="${zoneId}">`
        + `${escapeHtml(t("settings.panel.zones.rename"))}</button>`,
      `<button type="button" class="ghost-btn ghost-btn--danger" data-zone-action="delete-zone" data-zone-id="${zoneId}">`
        + `${escapeHtml(t("settings.panel.zones.deleteZone"))}</button>`,
    );
  }

  const notes: string[] = [];
  if (zone.isRoot) {
    notes.push(`<p class="zone-card__note">${escapeHtml(t("settings.panel.zones.rootAutoDesktop"))}</p>`);
    notes.push(`<p class="zone-card__note">${escapeHtml(describePrivateMapping(snapshot, zone))}</p>`);
  }

  return [
    `<article class="zone-card${zone.isRoot ? " zone-card--root" : ""}" data-zone-id="${zoneId}">`,
    '  <div class="zone-card__head">',
    '    <div class="zone-card__title">',
    `      <h2 class="zone-card__name">${escapeHtml(zoneDisplayName(zone))}</h2>`,
    `      <span class="zone-card__badge">${escapeHtml(t("settings.panel.zones.memberCount", { count: zoneMemberCount(zone, snapshot) }))}</span>`,
    '    </div>',
    `    <div class="zone-card__actions">${actions.join("")}</div>`,
    '  </div>',
    ...notes.map((note) => `  ${note}`),
    '  <div class="zone-card__config">',
    `    ${renderConfigRow({
      zoneId: zone.zoneId,
      key: "observeGroupMessages",
      label: t("settings.panel.zones.observeGroupMessages"),
      checked: zone.config.observeGroupMessages,
    })}`,
    `    ${renderConfigRow({
      zoneId: zone.zoneId,
      key: "injectOwnerProfile",
      label: t("settings.panel.zones.injectOwnerProfile"),
      checked: zone.config.injectOwnerProfile,
      // root 恒为开：主进程会忽略关闭请求，所以这里直接禁用
      disabled: zone.isRoot,
    })}`,
    '  </div>',
    '  <div class="zone-card__members">',
    memberRows.length > 0
      ? memberRows.map((row) => `    ${row}`).join("\n")
      : `    <p class="zone-card__empty">${escapeHtml(t("settings.panel.zones.empty"))}</p>`,
    '  </div>',
    '</article>',
  ].join("\n");
}

/** 批量条：勾选成员后才出现。 */
export function renderBatchBar(): void {
  const count = zonesState.selectedKeys.size;
  zonesBatchBar?.classList.toggle("is-hidden", count === 0);
  if (zonesBatchCount) {
    zonesBatchCount.textContent = count > 0 ? t("settings.panel.zones.batchCount", { count }) : "";
  }
}

function renderZonesEmptyState(title: string, hint: string): void {
  if (!zonesList) return;
  zonesList.innerHTML = [
    '<div class="memory-list__empty">',
    '  <span>📭</span>',
    `  <p>${escapeHtml(title)}</p>`,
    `  <p class="memory-list__hint">${escapeHtml(hint)}</p>`,
    '</div>',
  ].join("\n");
}

export function renderZones(snapshot: ZonesSnapshot): void {
  if (!zonesList) return;
  if (snapshot.zones.length === 0) {
    renderZonesEmptyState(t("settings.panel.zones.empty"), t("settings.panel.zones.loadFailedHint"));
    return;
  }
  zonesList.innerHTML = snapshot.zones.map((zone) => renderZoneCard(zone, snapshot)).join("\n");
  renderBatchBar();
}

/** 丢弃快照里已不存在的勾选项（成员被移出 / 移走后不能留在批量条里）。 */
export function pruneSelection(snapshot: ZonesSnapshot): void {
  const alive = new Set<string>();
  for (const zone of snapshot.zones) {
    for (const member of zone.members) {
      if (member.kind === "external") alive.add(zoneMemberKey(member));
    }
  }
  for (const key of Array.from(zonesState.selectedKeys)) {
    if (!alive.has(key)) zonesState.selectedKeys.delete(key);
  }
}

function findMemberWithZone(
  snapshot: ZonesSnapshot,
  memberKey: string,
): { zone: Zone; member: ZoneMember } | null {
  for (const zone of snapshot.zones) {
    const member = zone.members.find((item) => zoneMemberKey(item) === memberKey);
    if (member) return { zone, member };
  }
  return null;
}

async function refreshZones(): Promise<void> {
  const snapshot = await window.memoryPanel?.getZoneSnapshot();
  if (!snapshot) return;
  zonesState.snapshot = snapshot;
  pruneSelection(snapshot);
  renderZones(snapshot);
}

/** 打开某个区块的「添加成员」选择器（只列外部会话，不提供桌面对话）。 */
export function openMemberPicker(zoneId: string): void {
  const snapshot = zonesState.snapshot;
  if (!snapshot) return;
  const zone = snapshot.zones.find((item) => item.zoneId === zoneId);
  if (!zone) return;
  const entries = collectMemberPickEntries(snapshot, zoneId);
  const items: ZonePickerItem[] = entries.map((entry) => ({
    key: entry.key,
    label: entry.label,
    note: entry.note,
    disabled: entry.disabled,
  }));
  openZonePicker({
    title: t("settings.panel.zones.pickMemberTitle"),
    description: t("settings.panel.zones.pickMemberDesc", { zone: zoneDisplayName(zone) }),
    items,
    emptyText: t("settings.panel.zones.pickMemberEmpty"),
    onPick: (key) => void addPickedMember(zoneId, key),
  });
}

async function addPickedMember(zoneId: string, key: string): Promise<void> {
  const snapshot = zonesState.snapshot;
  if (!snapshot) return;
  const member = pickEntryToMember(snapshot, key);
  if (!member) {
    setZonesFeedback("err", t("settings.panel.zones.actionFailed", { error: "成员信息无效" }));
    return;
  }
  try {
    const result = await window.memoryPanel!.addZoneMember(zoneId, member);
    if (!result) return;
    if (!result.ok) {
      // 后端校验失败（例如 root 私聊映射已满）原样展示
      setZonesFeedback("err", result.error);
      return;
    }
    setZonesFeedback("ok", t("settings.panel.zones.addedMember"));
    await refreshZones();
  } catch (err) {
    setZonesFeedback("err", t("settings.panel.zones.actionFailed", { error: errorText(err) }));
  }
}

/**
 * 「手动加群」第一步：选渠道。
 *
 * 这条路专治"群还没跟昔涟说过话"——它不在成员选择器的数据源（externalChats）里，
 * 只能靠手输群号。选完渠道再输群标识。
 */
export function openManualGroupChannelPicker(zoneId: string): void {
  const snapshot = zonesState.snapshot;
  if (!snapshot) return;
  const zone = snapshot.zones.find((item) => item.zoneId === zoneId);
  if (!zone) return;
  openZonePicker({
    title: t("settings.panel.zones.manualGroup.pickChannelTitle"),
    description: t("settings.panel.zones.manualGroup.pickChannelDesc", { zone: zoneDisplayName(zone) }),
    items: MANUAL_GROUP_CHANNEL_OPTIONS.map((option) => ({
      key: option.channel,
      label: t(option.labelKey),
      note: t(option.noteKey),
    })),
    emptyText: t("settings.panel.zones.manualGroup.pickChannelEmpty"),
    onPick: (channel) => void promptManualGroupChatId(zoneId, channel),
  });
}

/** 「手动加群」第二步：输入群号 / 群 openid，提交后加入区块（= 加入白名单）。 */
async function promptManualGroupChatId(zoneId: string, channel: string): Promise<void> {
  const option = MANUAL_GROUP_CHANNEL_OPTIONS.find((item) => item.channel === channel);
  if (!option) return;
  const raw = await showInputModal({
    title: t("settings.panel.zones.manualGroup.promptTitle"),
    message: t(option.messageKey),
    placeholder: t(option.placeholderKey),
    confirmText: t("settings.panel.zones.manualGroup.confirm"),
    cancelText: t("settings.panel.zones.cancel"),
  });
  if (raw === null) return;

  const check = checkManualGroupInput(option.channel, raw);
  if (!check.ok) {
    setZonesFeedback("err", t(manualGroupErrorKey(check.reason)));
    return;
  }
  try {
    const result = await window.memoryPanel!.addZoneManualGroup(zoneId, option.channel, check.chatId);
    if (!result) return;
    if (!result.ok) {
      setZonesFeedback("err", result.error);
      return;
    }
    setZonesFeedback(
      "ok",
      t(manualGroupAddedKey(result.movedFrom), { chatId: check.chatId, from: result.movedFrom?.zoneName ?? "" }),
    );
    await refreshZones();
  } catch (err) {
    setZonesFeedback("err", t("settings.panel.zones.actionFailed", { error: errorText(err) }));
  }
}

async function renameZone(zoneId: string): Promise<void> {
  const zone = zonesState.snapshot?.zones.find((item) => item.zoneId === zoneId);
  if (!zone || zone.isRoot) return;
  const name = await showInputModal({
    title: t("settings.panel.zones.renamePrompt.title"),
    message: t("settings.panel.zones.renamePrompt.message"),
    defaultValue: zone.zoneName,
    confirmText: t("settings.panel.zones.renamePrompt.confirm"),
    cancelText: t("settings.panel.zones.cancel"),
  });
  if (name === null) return;
  try {
    const updated = await window.memoryPanel!.renameZone(zoneId, name);
    if (!updated) {
      setZonesFeedback("err", t("settings.panel.zones.actionFailed", { error: "区块不存在" }));
      return;
    }
    await refreshZones();
  } catch (err) {
    setZonesFeedback("err", t("settings.panel.zones.actionFailed", { error: errorText(err) }));
  }
}

async function deleteZone(zoneId: string): Promise<void> {
  const zone = zonesState.snapshot?.zones.find((item) => item.zoneId === zoneId);
  if (!zone || zone.isRoot) return;
  const confirmed = await showModal({
    title: t("settings.panel.zones.delete.title"),
    message: t("settings.panel.zones.delete.message", { name: zoneDisplayName(zone) }),
    icon: "⚠️",
    confirmText: t("settings.panel.zones.delete.confirm"),
    cancelText: t("settings.panel.zones.cancel"),
  });
  if (!confirmed) return;
  try {
    const ok = await window.memoryPanel!.deleteZone(zoneId);
    if (!ok) {
      setZonesFeedback("err", t("settings.panel.zones.actionFailed", { error: "区块不存在或不可删除" }));
      return;
    }
    await refreshZones();
  } catch (err) {
    setZonesFeedback("err", t("settings.panel.zones.actionFailed", { error: errorText(err) }));
  }
}

async function removeMember(zoneId: string, memberKey: string): Promise<void> {
  const snapshot = zonesState.snapshot;
  if (!snapshot) return;
  const found = findMemberWithZone(snapshot, memberKey);
  if (!found) return;
  try {
    const result = await window.memoryPanel!.removeZoneMember(zoneId || found.zone.zoneId, found.member);
    if (!result) return;
    if (!result.ok) {
      setZonesFeedback("err", result.error);
      return;
    }
    setZonesFeedback("ok", t("settings.panel.zones.removedMember"));
    await refreshZones();
  } catch (err) {
    setZonesFeedback("err", t("settings.panel.zones.actionFailed", { error: errorText(err) }));
  }
}

async function updateZoneConfig(
  zoneId: string,
  patch: { observeGroupMessages?: boolean; injectOwnerProfile?: boolean },
): Promise<void> {
  try {
    const updated = await window.memoryPanel!.updateZoneConfig(zoneId, patch);
    if (!updated) {
      setZonesFeedback("err", t("settings.panel.zones.actionFailed", { error: "区块不存在" }));
      return;
    }
    zonesState.snapshot = zonesState.snapshot
      ? { ...zonesState.snapshot, zones: zonesState.snapshot.zones.map((z) => (z.zoneId === zoneId ? updated : z)) }
      : zonesState.snapshot;
    if (zonesState.snapshot) renderZones(zonesState.snapshot);
  } catch (err) {
    setZonesFeedback("err", t("settings.panel.zones.actionFailed", { error: errorText(err) }));
  }
}

/** 批量「移动到…」：先选目标区块，再调 moveZoneMembers。 */
export function openMoveTargetPicker(): void {
  const snapshot = zonesState.snapshot;
  if (!snapshot) return;
  const keys = Array.from(zonesState.selectedKeys);
  if (keys.length === 0) return;
  const items: ZonePickerItem[] = snapshot.zones.map((zone) => ({
    key: zone.zoneId,
    label: zoneDisplayName(zone),
    note: t("settings.panel.zones.memberCount", { count: zoneMemberCount(zone, snapshot) }),
  }));
  openZonePicker({
    title: t("settings.panel.zones.moveTitle"),
    description: t("settings.panel.zones.moveDesc", { count: keys.length }),
    items,
    emptyText: t("settings.panel.zones.empty"),
    onPick: (targetZoneId) => void moveSelectedMembers(targetZoneId, keys),
  });
}

async function moveSelectedMembers(targetZoneId: string, keys: string[]): Promise<void> {
  const snapshot = zonesState.snapshot;
  if (!snapshot) return;
  const members = keys
    .map((key) => pickEntryToMember(snapshot, key))
    .filter((member): member is ZoneExternalMember => member !== null);
  if (members.length === 0) return;
  try {
    const result = await window.memoryPanel!.moveZoneMembers(targetZoneId, members);
    if (result.errors.length > 0) {
      setZonesFeedback("err", t("settings.panel.zones.batchMoveFailed", { error: result.errors.join("；") }));
    } else {
      setZonesFeedback("ok", t("settings.panel.zones.batchMoveDone", { count: result.moved }));
    }
    zonesState.selectedKeys.clear();
    await refreshZones();
  } catch (err) {
    setZonesFeedback("err", t("settings.panel.zones.batchMoveFailed", { error: errorText(err) }));
  }
}

/** 批量「移出区块」：逐个调用 removeZoneMember（主进程没有批量移出接口）。 */
async function removeSelectedMembers(): Promise<void> {
  const snapshot = zonesState.snapshot;
  if (!snapshot) return;
  const keys = Array.from(zonesState.selectedKeys);
  if (keys.length === 0) return;
  let removed = 0;
  let failed = 0;
  for (const key of keys) {
    const found = findMemberWithZone(snapshot, key);
    if (!found) continue;
    try {
      const result = await window.memoryPanel!.removeZoneMember(found.zone.zoneId, found.member);
      if (result?.ok) removed += 1;
      else failed += 1;
    } catch {
      failed += 1;
    }
  }
  zonesState.selectedKeys.clear();
  if (failed > 0) {
    setZonesFeedback("err", t("settings.panel.zones.batchRemoveFailed", { error: `${failed} 个成员移出失败` }));
  } else {
    setZonesFeedback("ok", t("settings.panel.zones.batchRemoveDone", { count: removed }));
  }
  await refreshZones();
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function createZone(): Promise<void> {
  const name = await showInputModal({
    title: t("settings.panel.zones.create.title"),
    message: t("settings.panel.zones.create.message"),
    placeholder: t("settings.panel.zones.create.placeholder"),
    confirmText: t("settings.panel.zones.create.confirm"),
    cancelText: t("settings.panel.zones.cancel"),
  });
  if (name === null) return;
  try {
    await window.memoryPanel!.createZone(name);
    await refreshZones();
  } catch (err) {
    setZonesFeedback("err", t("settings.panel.zones.actionFailed", { error: errorText(err) }));
  }
}

/** 事件绑定只做一次（loadZonesPanel 会在每次进入面板时被调用）。 */
function bindZonesPanelEvents(): void {
  if (zonesState.eventsBound) return;
  zonesState.eventsBound = true;

  zonesCreateBtn?.addEventListener("click", () => void createZone());

  zonesList?.addEventListener("click", (event) => {
    const target = event.target as HTMLElement | null;
    const actionEl = target?.closest<HTMLElement>("[data-zone-action]");
    if (!actionEl) return;
    const action = actionEl.dataset.zoneAction ?? "";
    const zoneId = actionEl.dataset.zoneId ?? "";
    const memberKey = actionEl.dataset.memberKey ?? "";
    if (action === "add-member") openMemberPicker(zoneId);
    else if (action === "add-group-manual") openManualGroupChannelPicker(zoneId);
    else if (action === "rename-zone") void renameZone(zoneId);
    else if (action === "delete-zone") void deleteZone(zoneId);
    else if (action === "remove-member") void removeMember(zoneId, memberKey);
  });

  zonesList?.addEventListener("change", (event) => {
    const target = event.target as HTMLInputElement | null;
    if (!target) return;
    if (target.matches("[data-zone-member]")) {
      const key = target.dataset.memberKey ?? "";
      if (!key) return;
      if (target.checked) zonesState.selectedKeys.add(key);
      else zonesState.selectedKeys.delete(key);
      target.closest(".zone-member-row")?.classList.toggle("is-selected", target.checked);
      renderBatchBar();
      return;
    }
    if (target.matches("[data-zone-config]")) {
      const zoneId = target.dataset.zoneId ?? "";
      const configKey = target.dataset.zoneConfig;
      if (!zoneId) return;
      if (configKey === "observeGroupMessages") void updateZoneConfig(zoneId, { observeGroupMessages: target.checked });
      else if (configKey === "injectOwnerProfile") void updateZoneConfig(zoneId, { injectOwnerProfile: target.checked });
    }
  });

  zonesBatchMoveBtn?.addEventListener("click", () => openMoveTargetPicker());
  zonesBatchRemoveBtn?.addEventListener("click", () => void removeSelectedMembers());
}

export async function loadZonesPanel(): Promise<void> {
  bindZonesPanelEvents();
  if (!zonesList) return;
  if (!window.memoryPanel) {
    renderZonesEmptyState(t("settings.panel.zones.loadFailed"), t("settings.panel.zones.loadFailedHint"));
    return;
  }
  if (zonesState.loading) return;
  zonesState.loading = true;
  try {
    await refreshZones();
  } catch (err) {
    console.error("[settings] load zones panel failed", err);
    setZonesFeedback("err", t("settings.panel.zones.actionFailed", { error: errorText(err) }));
    renderZonesEmptyState(t("settings.panel.zones.loadFailed"), t("settings.panel.zones.loadFailedHint"));
  } finally {
    zonesState.loading = false;
  }
}

/** 离开面板：收起弹层、清空勾选与提示（下次进入会重新加载快照）。 */
export function disposeZonesPanel(): void {
  closeZonePicker();
  zonesState.selectedKeys.clear();
  clearZonesFeedback();
  renderBatchBar();
}
