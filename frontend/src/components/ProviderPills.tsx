import { cn } from "@/lib/utils";
import { ProviderMark } from "./ProviderMark";

export type ProviderPillOption = {
  id: string;
  label: string;
  /** 胶囊右侧的计数或简短说明。 */
  detail?: string;
};

/** 厂商胶囊选择器：单选，使用 role=group + aria-pressed 表达选中。 */
export function ProviderPills({
  options,
  value,
  onChange,
  label,
  className,
}: {
  options: ProviderPillOption[];
  value: string;
  onChange: (value: string) => void;
  label: string;
  className?: string;
}) {
  return (
    <div role="group" aria-label={label} className={cn("flex flex-wrap gap-2", className)}>
      {options.map((option) => {
        const selected = value === option.id;
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.id)}
            className={cn(
              "inline-flex h-9 items-center gap-2 rounded-full border py-1 pr-3.5 pl-1.5 text-sm font-medium transition-all outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 active:scale-[0.98]",
              selected
                ? "border-brand/40 bg-accent text-accent-foreground shadow-[0_4px_14px_-6px_rgb(14_165_233/0.45)]"
                : "border-border bg-card text-soft hover:border-brand/30 hover:text-foreground",
            )}
          >
            {option.id === "all" ? (
              <span aria-hidden className="grid size-6 place-items-center rounded-full bg-slate-100 text-[11px] font-bold text-slate-600">
                全
              </span>
            ) : (
              <ProviderMark provider={option.id} className="size-6 rounded-full text-[11px]" />
            )}
            {option.label}
            {option.detail && (
              <span className={cn("font-mono text-xs tabular-nums", selected ? "text-accent-foreground/70" : "text-muted-foreground")}>
                {option.detail}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
