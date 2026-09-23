/** 手機優先的原生 <select>（叫出系統選單），樣式與 ui/input.tsx 一致、高度 h-11 好點。 */
import type { ComponentProps } from "react";
import { ChevronDownIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export function FieldSelect({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <div className="relative w-full">
      <select
        className={cn(
          "h-11 w-full min-w-0 appearance-none rounded-lg border border-input bg-transparent py-1 pr-8 pl-2.5 text-base outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:bg-input/30",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDownIcon className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
    </div>
  );
}
