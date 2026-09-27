import { cn } from "@/lib/utils";
import { providerMeta } from "../utils";

const toneClass: Record<string, string> = {
  gray: "bg-slate-100 text-slate-600",
  gold: "bg-amber-100 text-amber-700",
  red: "bg-rose-100 text-rose-700",
  mint: "bg-emerald-100 text-emerald-700",
  blue: "bg-sky-100 text-sky-700",
};

/** 厂商字标：圆角色块 + 单字符，颜色沿用 providerMeta 的 tone。 */
export function ProviderMark({ provider, className }: { provider?: string; className?: string }) {
  const meta = provider ? providerMeta[provider] : undefined;
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-7 shrink-0 place-items-center rounded-sm text-xs font-bold",
        toneClass[meta?.tone ?? "gray"] ?? toneClass.gray,
        className,
      )}
    >
      {meta?.mark ?? "?"}
    </span>
  );
}

/** 生成中的跳动音柱，开启减少动效时静止。 */
export function EqualizerBars({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn("flex h-4 items-center gap-[3px]", className)}>
      {[0, 180, 360, 120].map((delay) => (
        <span
          key={delay}
          className="h-full w-[3px] origin-center animate-eq rounded-full bg-current"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </span>
  );
}
