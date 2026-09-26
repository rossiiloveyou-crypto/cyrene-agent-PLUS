// Channels 面板 DOM 引用
// 从 settings.ts 抽离。ESM 静态导入保证查询在 settings.ts 顶层代码之前执行。

export const channelsWechatEnabledEl = document.getElementById("channels-wechat-enabled") as HTMLInputElement | null;
export const channelsFeishuEnabledEl = document.getElementById("channels-feishu-enabled") as HTMLInputElement | null;
export const channelsQqEnabledEl = document.getElementById("channels-qq-enabled") as HTMLInputElement | null;
export const channelsWechatStatusEl = document.getElementById("channels-wechat-status");
export const channelsFeishuStatusEl = document.getElementById("channels-feishu-status");
export const channelsQqStatusEl = document.getElementById("channels-qq-status");
export const channelsRateUserEl = document.getElementById("channels-rate-user") as HTMLInputElement | null;
export const channelsRateChannelEl = document.getElementById("channels-rate-channel") as HTMLInputElement | null;
export const channelsTtsEl = document.getElementById("channels-tts-enabled") as HTMLInputElement | null;
export const channelsStickerEl = document.getElementById("channels-sticker-enabled") as HTMLInputElement | null;
export const channelsToolSandboxOffEl = document.getElementById("channels-tool-sandbox-off") as HTMLInputElement | null;
export const channelsToolSandboxAllEl = document.getElementById("channels-tool-sandbox-all") as HTMLInputElement | null;
export const channelsFeishuAppIdEl = document.getElementById("channels-feishu-app-id") as HTMLInputElement | null;
export const channelsFeishuAppSecretEl = document.getElementById("channels-feishu-app-secret") as HTMLInputElement | null;
export const channelsFeishuAppSecretRevealBtn = document.getElementById("channels-feishu-app-secret-reveal");
export const channelsFeishuSaveBtn = document.getElementById("channels-feishu-save");
export const channelsWechatLoginBtn = document.getElementById("channels-wechat-login");
export const channelsWechatRestartBtn = document.getElementById("channels-wechat-restart");
export const channelsWechatFeedbackEl = document.getElementById("channels-wechat-feedback");
export const channelsFeishuFeedbackEl = document.getElementById("channels-feishu-feedback");
export const channelsQqListenModeEl = document.getElementById("channels-qq-listen-mode") as HTMLSelectElement | null;
export const channelsQqCustomHostEl = document.getElementById("channels-qq-custom-host") as HTMLInputElement | null;
export const channelsQqPortEl = document.getElementById("channels-qq-port") as HTMLInputElement | null;
export const channelsQqUrlEl = document.getElementById("channels-qq-url") as HTMLInputElement | null;
export const channelsQqUrlCopyBtn = document.getElementById("channels-qq-url-copy");
export const channelsQqTokenEl = document.getElementById("channels-qq-token") as HTMLInputElement | null;
export const channelsQqTokenGenerateBtn = document.getElementById("channels-qq-token-generate");
export const channelsQqTokenCopyBtn = document.getElementById("channels-qq-token-copy");
// 群白名单已迁到「记忆区块」：这里只剩跳转按钮（旧配置 allowedGroupIds 主进程仍兼容读取）
export const channelsQqZoneMigrationBtn = document.getElementById("channels-qq-zone-migration");
export const channelsQqSaveBtn = document.getElementById("channels-qq-save");
export const channelsQqTestBtn = document.getElementById("channels-qq-test");
export const channelsQqFeedbackEl = document.getElementById("channels-qq-feedback");
export const channelsQqBotEnabledEl = document.getElementById("channels-qqbot-enabled") as HTMLInputElement | null;
export const channelsQqBotStatusEl = document.getElementById("channels-qqbot-status");
export const channelsQqBotAppIdEl = document.getElementById("channels-qqbot-app-id") as HTMLInputElement | null;
export const channelsQqBotAppSecretEl = document.getElementById("channels-qqbot-app-secret") as HTMLInputElement | null;
export const channelsQqBotAllowAnyPrivateEl = document.getElementById("channels-qqbot-allow-any-private") as HTMLInputElement | null;
export const channelsQqBotUserAllowlistEl = document.getElementById("channels-qqbot-user-allowlist") as HTMLTextAreaElement | null;
// 群 openid 白名单同样迁到「记忆区块」（旧配置 allowedGroupOpenids 主进程仍兼容读取）
export const channelsQqBotZoneMigrationBtn = document.getElementById("channels-qqbot-zone-migration");
export const channelsQqBotSaveBtn = document.getElementById("channels-qqbot-save");
export const channelsQqBotTestBtn = document.getElementById("channels-qqbot-test");
export const channelsQqBotFeedbackEl = document.getElementById("channels-qqbot-feedback");
export const channelsLogListEl = document.getElementById("channels-log-list");
export const channelsLogRefreshBtn = document.getElementById("channels-log-refresh");
export const channelsLogClearBtn = document.getElementById("channels-log-clear");
