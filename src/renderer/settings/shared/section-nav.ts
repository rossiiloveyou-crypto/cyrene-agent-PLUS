// 跨面板跳转薄壳。
//
// settings.ts 是入口模块：其它面板（channels 的「前往记忆区块」等）如果直接 import 它，
// 会和 settings.ts → 面板模块的静态导入形成循环。这里用一个注册钩子解耦：
// settings.ts 在 switchSection 定义之后调用 registerSectionSwitcher(switchSection)。

type SectionSwitcher = (section: string) => void;

let switcher: SectionSwitcher | null = null;

/** 由 settings.ts 注册真实实现（重复注册时覆盖，便于热更新）。 */
export function registerSectionSwitcher(fn: SectionSwitcher): void {
  switcher = fn;
}

/** 跳到指定设置分区；入口尚未注册时返回 false（调用方自行退化处理）。 */
export function switchToSection(section: string): boolean {
  if (!switcher) return false;
  switcher(section);
  return true;
}
