import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** shadcn/ui 标准类名合并工具：clsx 条件拼接 + tailwind-merge 冲突去重。 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
