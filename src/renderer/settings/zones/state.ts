// Zones（记忆区块）面板内部状态
// panelCache：最近一次 getZoneSnapshot() 的结果；selectedKeys：勾选的成员 key 集合
// （格式见 picker.ts 的 zoneMemberKey，批量移动 / 移出都靠它定位成员）。

import type { ZonesSnapshot } from "../shared/types";

export const zonesState = {
  /** 最近一次快照（null = 还没加载过）。 */
  snapshot: null as ZonesSnapshot | null,
  /** 勾选的成员 key 集合。 */
  selectedKeys: new Set<string>(),
  /** 事件是否已绑定（loadZonesPanel 会被反复调用，绑定只做一次）。 */
  eventsBound: false,
  /** 是否正在请求（避免连点重复加载）。 */
  loading: false,
};
