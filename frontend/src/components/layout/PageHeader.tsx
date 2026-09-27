import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type PageHeaderProps = {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
};

/** 紧凑页头：标题 + 一行说明 + 右侧操作区，替代原来的大号 Hero。 */
export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    <header
      className={cn(
        "mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between md:mb-8",
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="mt-0 text-2xl font-bold tracking-tight text-foreground md:text-[28px]">{title}</h1>
        {description && (
          <p className="mt-1.5 mb-0 max-w-2xl text-sm leading-relaxed text-muted-foreground md:text-[15px]">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
