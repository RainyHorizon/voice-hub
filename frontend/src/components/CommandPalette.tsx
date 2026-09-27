import { useEffect } from "react";
import { Clock3, Play } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
import { usePlayer } from "@/context/PlayerContext";
import { useStudio } from "@/context/StudioContext";
import { providerMeta } from "@/utils";
import { ProviderMark } from "./ProviderMark";
import { navItems } from "./layout/nav";

type CommandPaletteProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigate: (id: string) => void;
};

export function CommandPalette({ open, onOpenChange, onNavigate }: CommandPaletteProps) {
  const { voices, voice, models, jobs, useVoice: selectVoice } = useStudio();
  const player = usePlayer();
  // 只列出至少有一个合成模型可用的音色，避免选中后提示“没有兼容模型”。
  const synthesisProviders = new Set(
    models.filter((item) => item.operations.includes("synthesis")).map((item) => item.provider),
  );
  const switchableVoices = voices.filter((item) => synthesisProviders.has(item.provider));
  const voiceNames = new Map(voices.map((item) => [item.public_name, item.display_name]));
  const recentJobs = [...jobs]
    .sort((left, right) => right.created_at.localeCompare(left.created_at))
    .slice(0, 6);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "k" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onOpenChange]);

  const run = (action: () => void) => {
    onOpenChange(false);
    action();
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="命令面板"
      description="搜索页面或操作"
      className="sm:max-w-xl"
    >
      <CommandInput placeholder="搜索页面、音色或操作…" />
      <CommandList className="max-h-[min(420px,60vh)]">
        <CommandEmpty>没有匹配的结果</CommandEmpty>
        <CommandGroup heading="页面">
          {navItems.map((item, index) => {
            const Icon = item.icon;
            return (
              <CommandItem
                key={item.id}
                value={`page ${item.label} ${item.description} ${item.id}`}
                onSelect={() => run(() => onNavigate(item.id))}
              >
                <Icon className="text-muted-foreground" />
                <span>{item.label}</span>
                <span className="truncate text-xs text-muted-foreground">{item.description}</span>
                <CommandShortcut>{index + 1}</CommandShortcut>
              </CommandItem>
            );
          })}
        </CommandGroup>
        {recentJobs.length > 0 && (
          <CommandGroup heading="最近任务">
            {recentJobs.map((job) => {
              const voiceName = voiceNames.get(job.voice) || job.voice;
              const title = job.input_text || `${voiceName} · ${job.model}`;
              const src = job.audio_url;
              return (
                <CommandItem
                  key={job.id}
                  value={`job ${job.id} ${title} ${voiceName} ${job.model}`}
                  onSelect={() =>
                    run(() =>
                      src
                        ? player.play({ src, title, subtitle: `${voiceName} · ${job.model}`, downloadName: src.split("?")[0].split("/").pop() })
                        : onNavigate("history"),
                    )
                  }
                >
                  {src ? <Play className="text-brand" /> : <Clock3 className="text-muted-foreground" />}
                  <span className="min-w-0 flex-1 truncate">{title}</span>
                  <span className="shrink-0 truncate text-xs text-muted-foreground">{voiceName}</span>
                </CommandItem>
              );
            })}
          </CommandGroup>
        )}
        {switchableVoices.length > 0 && (
          <CommandGroup heading="切换音色">
            {switchableVoices.map((item) => (
              <CommandItem
                key={item.id}
                value={`voice ${item.display_name} ${item.public_name} ${providerMeta[item.provider]?.label ?? item.provider}`}
                onSelect={() => run(() => selectVoice(item))}
              >
                <ProviderMark provider={item.provider} className="size-5 rounded-[6px] text-[10px]" />
                <span className="truncate">{item.display_name}</span>
                <span className="truncate font-mono text-xs text-muted-foreground">{item.public_name}</span>
                {item.public_name === voice && <CommandShortcut>当前</CommandShortcut>}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
