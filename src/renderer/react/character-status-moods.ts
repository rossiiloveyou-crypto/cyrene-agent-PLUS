export type CharacterStatusMood = "连接中" | "思考中" | "工作中" | "提醒" | "已处理" | "已中断";

const statusMoodUrls = import.meta.glob<string>("./assets/characters/*/status-moods/*.png", {
  eager: true,
  query: "?url",
  import: "default",
});

/** 按委托使用的角色素材文件名和状态查找图片；未收录角色返回 null。 */
export function getCharacterStatusMoodUrl(assetFileName: string, mood: CharacterStatusMood): string | null {
  const characterName = assetFileName.replace(/\.png$/i, "");
  return statusMoodUrls[`./assets/characters/${characterName}/status-moods/${mood}.png`] ?? null;
}

/** 一次取齐角色状态图，方便给主消息渲染器复用。 */
export function getCharacterStatusMoodSet(assetFileName: string): Partial<Record<CharacterStatusMood, string>> {
  const characterName = assetFileName.replace(/\.png$/i, "");
  const moods: CharacterStatusMood[] = ["连接中", "思考中", "工作中", "提醒", "已处理", "已中断"];
  return Object.fromEntries(moods.flatMap((mood) => {
    const url = statusMoodUrls[`./assets/characters/${characterName}/status-moods/${mood}.png`];
    return url ? [[mood, url]] : [];
  })) as Partial<Record<CharacterStatusMood, string>>;
}
