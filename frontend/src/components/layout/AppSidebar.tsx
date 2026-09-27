import { AudioLines, PanelLeftClose, PanelLeftOpen, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { navGroups } from "./nav";

type NavListProps = {
  active: string;
  collapsed?: boolean;
  onSelect: (id: string) => void;
};

export function BrandMark({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "grid size-9 shrink-0 place-items-center rounded-[12px] bg-gradient-to-br from-sky-400 to-sky-600 text-white shadow-[0_6px_16px_-6px_rgb(14_165_233/0.7)]",
        className,
      )}
    >
      <AudioLines className="size-[18px]" />
    </div>
  );
}

export function NavList({ active, collapsed = false, onSelect }: NavListProps) {
  return (
    <nav aria-label="主导航" className="flex flex-col gap-5">
      {navGroups.map((group) => (
        <div key={group.label} className="flex flex-col gap-1">
          <p
            className={cn(
              "px-3 pb-1 text-xs font-medium text-muted-foreground transition-opacity",
              collapsed && "sr-only",
            )}
          >
            {group.label}
          </p>
          {group.items.map((item) => {
            const Icon = item.icon;
            const selected = active === item.id;
            const button = (
              <button
                type="button"
                onClick={() => onSelect(item.id)}
                aria-current={selected ? "page" : undefined}
                aria-label={collapsed ? item.label : undefined}
                className={cn(
                  "group relative flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium text-soft transition-colors outline-none",
                  "hover:bg-white/70 hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50",
                  selected && "bg-white text-foreground shadow-island hover:bg-white",
                  collapsed && "justify-center px-0",
                )}
              >
                <Icon
                  className={cn(
                    "size-[18px] shrink-0 transition-colors",
                    selected ? "text-brand" : "text-muted-foreground group-hover:text-soft",
                  )}
                />
                {!collapsed && <span className="truncate">{item.label}</span>}
                {selected && !collapsed && (
                  <span aria-hidden className="ml-auto size-1.5 rounded-full bg-brand" />
                )}
              </button>
            );
            if (!collapsed) return <div key={item.id}>{button}</div>;
            return (
              <Tooltip key={item.id}>
                <TooltipTrigger asChild>{button}</TooltipTrigger>
                <TooltipContent side="right">{item.label}</TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

type AppSidebarProps = NavListProps & {
  onToggleCollapsed: () => void;
  onOpenCommand: () => void;
};

export function AppSidebar({
  active,
  collapsed = false,
  onSelect,
  onToggleCollapsed,
  onOpenCommand,
}: AppSidebarProps) {
  return (
    <aside
      className={cn(
        "glass sticky top-0 hidden h-dvh shrink-0 flex-col border-r px-3 pt-5 pb-4 transition-[width] duration-200 ease-out md:flex",
        collapsed ? "w-[76px]" : "w-[248px]",
      )}
    >
      <div className={cn("flex items-center gap-3 px-2 pb-6", collapsed && "flex-col px-0")}>
        <BrandMark />
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <strong className="block text-[15px] font-bold leading-tight">Voice Hub</strong>
            <span className="block text-xs text-muted-foreground">多厂商语音工作台</span>
          </div>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onToggleCollapsed}
              aria-label={collapsed ? "展开侧边栏" : "折叠侧边栏"}
              className="text-muted-foreground"
            >
              {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">{collapsed ? "展开侧边栏" : "折叠侧边栏"}</TooltipContent>
        </Tooltip>
      </div>

      <button
        type="button"
        onClick={onOpenCommand}
        aria-label="打开命令面板"
        className={cn(
          "mb-5 flex h-10 items-center gap-2.5 rounded-md border border-input bg-white/60 px-3 text-sm text-muted-foreground transition-colors outline-none",
          "hover:bg-white hover:text-soft focus-visible:ring-[3px] focus-visible:ring-ring/50",
          collapsed && "justify-center px-0",
        )}
      >
        <Search className="size-4 shrink-0" />
        {!collapsed && (
          <>
            <span className="flex-1 text-left">搜索或跳转</span>
            <kbd className="rounded-[6px] border bg-white px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
              Ctrl K
            </kbd>
          </>
        )}
      </button>

      <div className="-mx-1 flex-1 overflow-y-auto px-1">
        <NavList active={active} collapsed={collapsed} onSelect={onSelect} />
      </div>
    </aside>
  );
}
