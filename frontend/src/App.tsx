import {
  AudioLines,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Code2,
  Library,
  Mic2,
  Settings2,
  WandSparkles,
} from "lucide-react";
import { useEffect, useState, type ComponentType } from "react";
import { Toaster } from "sonner";
import { ConfirmProvider } from "./components/feedback/ConfirmProvider";
import { StudioProvider, useStudio } from "./context/StudioContext";
import { ClonePage } from "./pages/ClonePage";
import { DesignPage } from "./pages/DesignPage";
import { GatewayPage } from "./pages/GatewayPage";
import { HistoryPage } from "./pages/HistoryPage";
import { SettingsPage } from "./pages/SettingsPage";
import { SynthesisPage } from "./pages/SynthesisPage";
import { VoicesPage } from "./pages/VoicesPage";
import { titleFor } from "./utils";

const nav = [
  { id: "synthesize", label: "语音合成", icon: AudioLines },
  { id: "voices", label: "音色库", icon: Library },
  { id: "clone", label: "语音克隆", icon: Mic2 },
  { id: "design", label: "语音设计", icon: WandSparkles },
  { id: "gateway", label: "API 网关", icon: Code2 },
  { id: "history", label: "任务历史", icon: Clock3 },
  { id: "settings", label: "设置", icon: Settings2 },
];

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
  const {
    active,
    setActive,
    sidebarCollapsed,
    setSidebarCollapsed,
  } = useStudio();
  const [visited, setVisited] = useState<Set<string>>(() => new Set([active]));

  useEffect(() => {
    setVisited((current) => {
      if (current.has(active)) return current;
      const next = new Set(current);
      next.add(active);
      return next;
    });
  }, [active]);

  return (
    <div className={sidebarCollapsed ? "app-shell sidebar-collapsed" : "app-shell"}>
      <aside className="sidebar" aria-label="主导航">
        <div className="brand">
          <div className="brand-orbit">
            <AudioLines size={18} />
          </div>
          <div>
            <strong>VOICE HUB</strong>
          </div>
          <button
            className="sidebar-toggle"
            type="button"
            onClick={() => setSidebarCollapsed((value) => !value)}
            title={sidebarCollapsed ? "展开侧边栏" : "折叠侧边栏"}
            aria-label={sidebarCollapsed ? "展开侧边栏" : "折叠侧边栏"}
          >
            {sidebarCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
        </div>
        <nav>
          {nav.map((item) => {
            const Icon = item.icon;
            return (
              <button
                className={active === item.id ? "nav-item active" : "nav-item"}
                onClick={() => setActive(item.id)}
                key={item.id}
                title={sidebarCollapsed ? item.label : undefined}
                aria-label={item.label}
              >
                <Icon size={17} />
                <span>{item.label}</span>
                {active === item.id && (
                  <ChevronRight size={15} className="nav-arrow" />
                )}
              </button>
            );
          })}
        </nav>
      </aside>
      <main className="main-area">
        <header className="topbar visually-hidden">
          <h1>{titleFor(active)}</h1>
        </header>
        {nav.map((item) => {
          if (!visited.has(item.id) && active !== item.id) return null;
          const Page = pages[item.id];
          return (
            <div key={item.id} hidden={active !== item.id}>
              <Page />
            </div>
          );
        })}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <ConfirmProvider>
      <StudioProvider>
        <AppShell />
      </StudioProvider>
      <Toaster
        theme="light"
        position="top-right"
        closeButton
        richColors
        toastOptions={{ className: "voice-hub-toast" }}
      />
    </ConfirmProvider>
  );
}
