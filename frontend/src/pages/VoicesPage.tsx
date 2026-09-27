import { useState } from "react";
import {
  Check,
  Copy,
  LayoutGrid,
  Library,
  Mic2,
  Pencil,
  Play,
  Plus,
  Rows3,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { usePlayer } from "@/context/PlayerContext";
import { cn } from "@/lib/utils";
import { EqualizerBars, ProviderMark } from "../components/ProviderMark";
import { ProviderPills } from "../components/ProviderPills";
import { PageHeader } from "../components/layout/PageHeader";
import { ImportVoiceDialog } from "../components/voices/ImportVoiceDialog";
import { RenameVoiceDialog } from "../components/voices/RenameVoiceDialog";
import { useStudio } from "../context/StudioContext";
import type { Voice } from "../types";
import { credentialProviderIds, providerMeta } from "../utils";

type Scope = "all" | "mine";
type View = "table" | "cards";

const VIEW_STORAGE_KEY = "voiceLibraryView";
const typeLabels: Record<string, string> = {
  cloned: "克隆",
  imported: "导入",
  design: "设计",
  preset: "预置",
};
const typeTones: Record<string, string> = {
  cloned: "bg-violet-50 text-violet-700",
  imported: "bg-amber-50 text-amber-700",
  design: "bg-sky-50 text-sky-700",
  preset: "bg-slate-100 text-slate-600",
};

function readView(): View {
  try {
    return localStorage.getItem(VIEW_STORAGE_KEY) === "cards" ? "cards" : "table";
  } catch {
    return "table";
  }
}

export function VoicesPage() {
  const {
    voices,
    models,
    voice: currentVoice,
    setActive,
    importVoice,
    importVoices,
    removeVoice,
    renameVoice,
    useVoice: selectVoice,
  } = useStudio();
  const [provider, setProvider] = useState("all");
  const [scope, setScope] = useState<Scope>("all");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<View>(readView);
  const [showImport, setShowImport] = useState(false);
  const [renameTarget, setRenameTarget] = useState<Voice | null>(null);

  const changeView = (next: View) => {
    setView(next);
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, next);
    } catch {
      // 隐私模式下无法持久化，忽略即可。
    }
  };

  const scoped = scope === "mine"
    ? voices.filter((item) => ["cloned", "design", "imported"].includes(item.voice_type))
    : voices;
  const counts = Object.fromEntries(
    credentialProviderIds.map((id) => [id, scoped.filter((item) => item.provider === id).length]),
  );
  const keyword = query.trim().toLowerCase();
  const filtered = scoped.filter(
    (item) =>
      (provider === "all" || item.provider === provider) &&
      (!keyword ||
        [item.display_name, item.public_name, item.provider_voice_id, item.model_id]
          .some((value) => value?.toLowerCase().includes(keyword))),
  );

  const actions: VoiceActions = {
    currentVoice,
    onUse: selectVoice,
    onRename: setRenameTarget,
    onRemove: (item) => void removeVoice(item),
  };
  const list = filtered.length ? (
    view === "cards" ? <VoiceCards voices={filtered} actions={actions} /> : <VoiceTable voices={filtered} actions={actions} />
  ) : (
    <div className="island flex flex-col items-center gap-3 px-6 py-16 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-accent text-brand">
        <Library className="size-5" />
      </span>
      <p className="m-0 text-sm text-muted-foreground">
        {query.trim() ? "没有匹配的音色，换个关键词试试" : "当前来源还没有可用音色"}
      </p>
      {!query.trim() && (
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowImport(true)}>
            <Plus />
            导入音色 ID
          </Button>
          <Button size="sm" onClick={() => setActive("clone")}>
            <Mic2 />
            开始克隆
          </Button>
        </div>
      )}
    </div>
  );

  return (
    <section>
      <PageHeader
        title="音色库"
        description="浏览预置、克隆、导入和设计音色，按来源筛选并一键用于合成。"
        actions={
          <>
            <Button variant="outline" onClick={() => setShowImport(true)}>
              <Plus />
              导入音色 ID
            </Button>
            <Button onClick={() => setActive("clone")}>
              <Mic2 />
              开始克隆
            </Button>
          </>
        }
      />

      <Tabs value={scope} onValueChange={(value) => setScope(value as Scope)} className="gap-5">
        <div className="flex flex-wrap items-center gap-3">
          <TabsList aria-label="音色范围">
            <TabsTrigger value="all" className="px-4">全部音色</TabsTrigger>
            <TabsTrigger value="mine" className="px-4">我的音色</TabsTrigger>
          </TabsList>
          <div className="relative min-w-0 flex-1 basis-40 xl:ml-auto xl:w-64 xl:flex-none xl:basis-auto">
            <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索名称、别名或 Voice ID"
              aria-label="搜索音色"
              className="pl-9"
            />
          </div>
          <ToggleGroup
            type="single"
            value={view}
            onValueChange={(value) => value && changeView(value as View)}
            aria-label="视图"
            className="rounded-md bg-muted p-1"
          >
            <ToggleGroupItem value="table" aria-label="表格视图" className="size-8 rounded-sm data-[state=on]:bg-card data-[state=on]:shadow-sm">
              <Rows3 />
            </ToggleGroupItem>
            <ToggleGroupItem value="cards" aria-label="卡片视图" className="size-8 rounded-sm data-[state=on]:bg-card data-[state=on]:shadow-sm">
              <LayoutGrid />
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        <ProviderPills
          label="按厂商筛选音色"
          value={provider}
          onChange={setProvider}
          options={[
            { id: "all", label: "全部厂商", detail: String(scoped.length) },
            ...credentialProviderIds.map((id) => ({
              id,
              label: providerMeta[id].label,
              detail: String(counts[id] || 0),
            })),
          ]}
        />

        <TabsContent value="all">{list}</TabsContent>
        <TabsContent value="mine">{list}</TabsContent>
      </Tabs>

      {showImport && (
        <ImportVoiceDialog
          models={models}
          onClose={() => setShowImport(false)}
          onImport={async (config) => {
            await importVoice(config);
            setShowImport(false);
            setProvider(config.provider);
          }}
          onBatchImport={async (configs) => {
            await importVoices(configs);
            setShowImport(false);
            setProvider(configs[0]?.provider || "all");
          }}
        />
      )}
      {renameTarget && (
        <RenameVoiceDialog
          voice={renameTarget}
          onClose={() => setRenameTarget(null)}
          onRename={async (displayName) => {
            await renameVoice(renameTarget, displayName);
            setRenameTarget(null);
          }}
        />
      )}
    </section>
  );
}

type VoiceActions = {
  currentVoice: string;
  onUse: (voice: Voice) => void;
  onRename: (voice: Voice) => void;
  onRemove: (voice: Voice) => void;
};

function VoiceTable({ voices, actions }: { voices: Voice[]; actions: VoiceActions }) {
  return (
    <div className="island overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="pl-4 sm:pl-6">音色</TableHead>
            <TableHead className="hidden xl:table-cell">来源 / 模型</TableHead>
            <TableHead className="hidden lg:table-cell">类型</TableHead>
            <TableHead className="hidden xl:table-cell">语言</TableHead>
            <TableHead className="pr-3 text-right sm:pr-6">
              <span className="sr-only">操作</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {voices.map((item) => (
            <TableRow key={item.id} className="group">
              {/* w-full + max-w-0 让名称列占满剩余宽度并截断，窄屏时操作按钮不被挤出。 */}
              <TableCell className="w-full max-w-0 py-3 pl-4 sm:pl-6">
                <div className="flex min-w-0 items-center gap-3">
                  <PreviewButton voice={item} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <strong className="truncate font-semibold text-foreground">{item.display_name}</strong>
                      {actions.currentVoice === item.public_name && <CurrentBadge />}
                    </div>
                    <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                      <span className="truncate font-mono">{item.public_name}</span>
                      <SpeakerId voice={item} />
                    </div>
                  </div>
                </div>
              </TableCell>
              <TableCell className="hidden xl:table-cell">
                <div className="flex items-center gap-2.5">
                  <ProviderMark provider={item.provider} className="size-6 text-[11px]" />
                  <div className="min-w-0 leading-tight">
                    <div className="text-[13px] font-medium text-foreground">{providerMeta[item.provider]?.label || item.provider}</div>
                    <div className="max-w-52 truncate font-mono text-[11px] text-muted-foreground">{item.model_id}</div>
                  </div>
                </div>
              </TableCell>
              <TableCell className="hidden lg:table-cell">
                <TypeBadge type={item.voice_type} />
              </TableCell>
              <TableCell className="hidden w-52 min-w-52 text-[13px] whitespace-normal text-soft xl:table-cell">{item.languages.join(" · ")}</TableCell>
              <TableCell className="pr-3 sm:pr-6">
                <RowActions voice={item} actions={actions} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function VoiceCards({ voices, actions }: { voices: Voice[]; actions: VoiceActions }) {
  return (
    <ul className="m-0 grid list-none gap-4 p-0 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {voices.map((item) => (
        <li
          key={item.id}
          className={cn(
            "island flex min-w-0 flex-col gap-4 p-5 transition-all duration-200 hover:-translate-y-px hover:shadow-float",
            actions.currentVoice === item.public_name && "border-brand/40 ring-1 ring-brand/20",
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <ProviderMark provider={item.provider} className="size-10 rounded-md text-sm" />
              <div className="min-w-0">
                <strong className="block truncate text-[15px] font-semibold text-foreground">{item.display_name}</strong>
                <span className="block truncate font-mono text-xs text-muted-foreground">{item.public_name}</span>
              </div>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              <TypeBadge type={item.voice_type} />
              {actions.currentVoice === item.public_name && <CurrentBadge />}
            </div>
          </div>

          <div className="flex flex-col gap-1.5 text-xs text-muted-foreground">
            <span className="truncate">
              {providerMeta[item.provider]?.label || item.provider}
              <span className="mx-1.5 text-border">|</span>
              <span className="font-mono">{item.model_id}</span>
            </span>
            <span>{item.languages.join(" · ")}</span>
            <SpeakerId voice={item} />
          </div>

          <div className="mt-auto flex items-center gap-2 border-t pt-4">
            <PreviewButton voice={item} withLabel />
            <div className="ml-auto">
              <RowActions voice={item} actions={actions} />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function TypeBadge({ type }: { type: string }) {
  return (
    <Badge className={cn("rounded-full px-2.5 font-medium", typeTones[type] ?? typeTones.preset)}>
      {typeLabels[type] ?? "预置"}
    </Badge>
  );
}

function CurrentBadge() {
  return (
    <Badge className="rounded-full bg-accent px-2 text-[11px] text-accent-foreground">
      <span className="size-1.5 rounded-full bg-brand" />
      使用中
    </Badge>
  );
}

/** 试听：有 preview_url 时交给底部播放条，没有时置灰。 */
function PreviewButton({ voice, withLabel = false }: { voice: Voice; withLabel?: boolean }) {
  const player = usePlayer();
  const src = voice.preview_url;
  const active = Boolean(src && player.isCurrent(src));
  const playing = active && player.playing;
  const label = !src ? "暂无试听音频" : playing ? `暂停试听 ${voice.display_name}` : `试听 ${voice.display_name}`;
  const onClick = () => {
    if (!src) return;
    if (active) player.toggle();
    else
      player.play({
        src,
        title: voice.display_name,
        subtitle: `${providerMeta[voice.provider]?.label || voice.provider} · 试听`,
      });
  };
  const button = withLabel ? (
    <Button variant={playing ? "secondary" : "outline"} size="sm" className="rounded-full" onClick={onClick} disabled={!src} aria-label={label}>
      {playing ? <EqualizerBars className="h-3 text-brand" /> : <Play fill="currentColor" className="size-3" />}
      {playing ? "播放中" : "试听"}
    </Button>
  ) : (
    <Button
      variant={playing ? "secondary" : "outline"}
      size="icon-sm"
      className="shrink-0 rounded-full"
      onClick={onClick}
      disabled={!src}
      aria-label={label}
    >
      {playing ? <EqualizerBars className="h-3 text-brand" /> : <Play fill="currentColor" className="size-3 translate-x-px" />}
    </Button>
  );
  // 禁用按钮收不到指针事件，外包一层 span 让提示仍然可见。
  return (
    <Tooltip>
      <TooltipTrigger asChild>{src ? button : <span tabIndex={0} className="rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">{button}</span>}</TooltipTrigger>
      <TooltipContent>{src ? (playing ? "暂停" : "试听") : "暂无试听音频"}</TooltipContent>
    </Tooltip>
  );
}

function SpeakerId({ voice }: { voice: Voice }) {
  const [copied, setCopied] = useState(false);
  const speakerId = voice.provider_voice_id?.trim();
  if (voice.provider !== "volcengine" || voice.voice_type === "preset" || !speakerId) return null;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(speakerId);
      setCopied(true);
      toast.success("已复制 Speaker ID", { description: speakerId });
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("复制失败，请手动选择复制");
    }
  };
  return (
    <span className="inline-flex max-w-full min-w-0 items-center gap-1 rounded-full bg-muted py-0.5 pr-0.5 pl-2 text-[11px]">
      <span className="shrink-0 text-muted-foreground">Speaker</span>
      <code className="truncate font-mono text-foreground" title={speakerId}>{speakerId}</code>
      <button
        type="button"
        onClick={() => void copy()}
        aria-label={`${copied ? "已复制" : "复制"} Speaker ID ${speakerId}`}
        className="grid size-5 shrink-0 place-items-center rounded-full text-muted-foreground outline-none hover:bg-card hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        {copied ? <Check className="size-3 text-success" /> : <Copy className="size-3" />}
      </button>
    </span>
  );
}

function RowActions({ voice, actions }: { voice: Voice; actions: VoiceActions }) {
  return (
    <div className="flex items-center justify-end gap-1">
      <Button variant="outline" size="sm" onClick={() => actions.onUse(voice)} className="mr-1">
        使用
      </Button>
      {voice.voice_type !== "preset" ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`重命名 ${voice.display_name}`} onClick={() => actions.onRename(voice)}>
              <Pencil />
            </Button>
          </TooltipTrigger>
          <TooltipContent>重命名</TooltipContent>
        </Tooltip>
      ) : (
        <span aria-hidden className="size-8" />
      )}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`从音色库移除 ${voice.display_name}`}
            onClick={() => actions.onRemove(voice)}
            className="hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 />
          </Button>
        </TooltipTrigger>
        <TooltipContent>从音色库移除</TooltipContent>
      </Tooltip>
    </div>
  );
}
