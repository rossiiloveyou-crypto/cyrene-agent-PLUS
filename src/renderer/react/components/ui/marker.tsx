import type { ComponentProps, ReactElement } from "react";
import { Slot } from "radix-ui";
import { cn } from "../../lib/utils";
import "./marker.css";

export type MarkerVariant = "default" | "border" | "separator";

/**
 * shadcn/ui Marker：会话流里的内联状态、系统提示与带标签分隔条。
 * 对标 https://ui.shadcn.com/docs/components/base/marker 的 API
 * （Marker / MarkerIcon / MarkerContent / markerVariants）。
 * 样式作用域见同目录 marker.css —— 沿用 StreamdownMessageContent.css 的
 * 局部 tailwind 策略，不引入全局 preflight。
 */
const markerVariantsMap: Record<MarkerVariant, string> = {
  default: "flex items-center gap-2 text-(--rb-text-secondary) text-xs",
  border: "flex items-center gap-2 text-(--rb-text-secondary) text-xs border-b border-(--rb-border-soft) pb-2",
  separator: "flex items-center justify-center gap-2 text-(--rb-text-secondary) text-xs",
};

export function markerVariants({ variant = "default" }: { variant?: MarkerVariant } = { variant: "default" }): string {
  return markerVariantsMap[variant] ?? markerVariantsMap.default!;
}

interface MarkerProps extends ComponentProps<"div"> {
  variant?: MarkerVariant;
  /** 多态根节点：传 <a /> / <button /> 等渲染为可交互元素（shadcn render 约定）。 */
  render?: ReactElement | ((props: Record<string, unknown>) => ReactElement);
}

export function Marker({ className, variant = "default", render, ...props }: MarkerProps) {
  const Comp = render ? Slot.Slot : "div";
  return (
    <Comp
      data-slot="marker"
      data-variant={variant}
      className={cn(markerVariants({ variant }), className)}
      {...props}
    />
  );
}

export function MarkerIcon({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      data-slot="marker-icon"
      aria-hidden="true"
      className={cn("inline-flex shrink-0 items-center justify-center [&_svg]:size-3.5", className)}
      {...props}
    />
  );
}

export function MarkerContent({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      data-slot="marker-content"
      className={cn("min-w-0 truncate", className)}
      {...props}
    />
  );
}
