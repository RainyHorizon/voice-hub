import { useEffect, useState, type CSSProperties, type ComponentType } from "react";
import { PlayerBar } from "./audio/PlayerBar";
import { CommandPalette } from "./components/CommandPalette";
import { ConfirmProvider } from "./components/feedback/ConfirmProvider";
import { AppSidebar } from "./components/layout/AppSidebar";
import { MobileNav } from "./components/layout/MobileNav";
import { navItems } from "./components/layout/nav";
import { Toaster } from "./components/ui/sonner";
import { TooltipProvider } from "./components/ui/tooltip";
import { PlayerProvider, usePlayer } from "./context/PlayerContext";
import { StudioProvider, useStudio } from "./context/StudioContext";
import { ClonePage } from "./pages/ClonePage";
import { DesignPage } from "./pages/DesignPage";
import { GatewayPage } from "./pages/GatewayPage";
import { HistoryPage } from "./pages/HistoryPage";
import { SettingsPage } from "./pages/SettingsPage";
import { SynthesisPage } from "./pages/SynthesisPage";
import { VoicesPage } from "./pages/VoicesPage";
import { cn } from "./lib/utils";
import { titleFor } from "./utils";

const pages: Record<string, ComponentType> = {
  synthesize: SynthesisPage,
  voices: VoicesPage,
  clone: ClonePage,
  design: DesignPage,
  gateway: GatewayPage,
  history: HistoryPage,
  settings: SettingsPage,
};

function AppShell() {
  const { active, setActive, sidebarCollapsed, setSidebarCollapsed } = useStudio();
  const [visited, setVisited] = useState<Set<string>>(() => new Set([active]));
  const [commandOpen, setCommandOpen] = useState(false);
  const { track } = usePlayer();

  useEffect(() => {
    setVisited((current) => {
      if (current.has(active)) return current;
      const next = new Set(current);
      next.add(active);
      return next;
    });
  }, [active]);

  return (
    <div
      className="flex min-h-dvh flex-col md:flex-row"
      style={{ "--sidebar-width": sidebarCollapsed ? "76px" : "248px" } as CSSProperties}
    >
      <AppSidebar
        active={active}
        collapsed={sidebarCollapsed}
        onSelect={setActive}
        onToggleCollapsed={() => setSidebarCollapsed((value) => !value)}
        onOpenCommand={() => setCommandOpen(true)}
      />
      <MobileNav active={active} onSelect={setActive} onOpenCommand={() => setCommandOpen(true)} />
      <main className="min-w-0 flex-1">
        <h1 className="sr-only">{titleFor(active)}</h1>
        <div
          className={cn(
            "mx-auto w-full max-w-[1400px] px-4 pt-6 pb-16 sm:px-6 md:px-8 md:pt-10 xl:px-12",
            track && "pb-36 md:pb-40",
          )}
        >
          {navItems.map((item) => {
            if (!visited.has(item.id) && active !== item.id) return null;
            const Page = pages[item.id];
            const current = active === item.id;
            return (
              <div key={item.id} hidden={!current} className={current ? "animate-page-in" : undefined}>
                <Page />
              </div>
            );
          })}
        </div>
      </main>
      <PlayerBar />
      <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} onNavigate={setActive} />
    </div>
  );
}

export default function App() {
  return (
    <ConfirmProvider>
      <StudioProvider>
        <PlayerProvider>
          <TooltipProvider delayDuration={300}>
            <AppShell />
            <Toaster position="top-center" />
          </TooltipProvider>
        </PlayerProvider>
      </StudioProvider>
    </ConfirmProvider>
  );
}
