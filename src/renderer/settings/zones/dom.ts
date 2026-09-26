// Zones（记忆区块）面板 DOM 引用
// 与其它面板一致：ESM 静态导入保证查询在 settings.ts 顶层代码之前执行。
// 面板内部的卡片 / 成员行是动态渲染的，这里只放静态骨架元素。

export const zonesCreateBtn = document.getElementById("zones-create-btn") as HTMLButtonElement | null;
export const zonesBatchBar = document.getElementById("zones-batch-bar") as HTMLElement | null;
export const zonesBatchCount = document.getElementById("zones-batch-count") as HTMLElement | null;
export const zonesBatchMoveBtn = document.getElementById("zones-batch-move-btn") as HTMLButtonElement | null;
export const zonesBatchRemoveBtn = document.getElementById("zones-batch-remove-btn") as HTMLButtonElement | null;
export const zonesList = document.getElementById("zones-list") as HTMLElement | null;
