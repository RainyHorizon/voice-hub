import { Download, Pause, Play, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { playbackRates, usePlayer } from "@/context/PlayerContext";
import { cn } from "@/lib/utils";
import { useMediaTime } from "./useMediaTime";
import { useWaveformPeaks } from "./useWaveformPeaks";
import { Waveform } from "./Waveform";
import { formatTime } from "./peaks";

const formatRate = (rate: number) => `${rate}×`;

/** 底部玻璃悬浮播放条：跟随全局 PlayerContext，没有音频时不渲染。 */
export function PlayerBar() {
  const player = usePlayer();
  const { track } = player;
  const currentTime = useMediaTime(player.audio);
  const { peaks, duration: decodedDuration } = useWaveformPeaks(track?.src);
  const duration = player.duration || decodedDuration;
  if (!track) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-3 md:pb-5 md:pl-[calc(var(--sidebar-width,0px)+1.25rem)] md:pr-5">
      <section
        aria-label="音频播放器"
        className="glass pointer-events-auto flex w-full max-w-4xl animate-in items-center gap-3 rounded-2xl border p-2.5 pr-3 shadow-float duration-200 fade-in-0 slide-in-from-bottom-4 md:gap-4 md:p-3 md:pr-4"
      >
        <Button
          size="icon-lg"
          className="shrink-0 rounded-full"
          onClick={player.toggle}
          aria-label={player.playing ? "暂停" : "播放"}
        >
          {player.playing ? <Pause className="size-5" fill="currentColor" /> : <Play className="size-5 translate-x-px" fill="currentColor" />}
        </Button>

        <div className="flex min-w-0 flex-1 flex-col gap-1 md:flex-row md:items-center md:gap-4">
          <div className="flex min-w-0 items-baseline gap-2 md:w-44 md:shrink-0 md:flex-col md:items-start md:gap-0.5">
            <strong className="truncate text-sm font-semibold text-foreground">{track.title}</strong>
            {track.subtitle && <span className="truncate text-xs text-muted-foreground">{track.subtitle}</span>}
          </div>
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <Waveform
              peaks={peaks}
              currentTime={currentTime}
              duration={duration}
              onSeek={player.seek}
              label="播放进度"
              height={36}
              className="hidden sm:block"
            />
            <SlimProgress currentTime={currentTime} duration={duration} className="sm:hidden" />
            <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
              {formatTime(currentTime)}
              <span className="hidden sm:inline"> / {formatTime(duration)}</span>
            </span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="hidden w-12 font-mono text-xs sm:inline-flex" aria-label={`播放速度 ${formatRate(player.rate)}`}>
                    {formatRate(player.rate)}
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>播放速度</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end" side="top" className="min-w-28">
              <DropdownMenuLabel className="text-xs text-muted-foreground">播放速度</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={String(player.rate)} onValueChange={(value) => player.setRate(Number(value))}>
                {playbackRates.map((rate) => (
                  <DropdownMenuRadioItem key={rate} value={String(rate)} className="font-mono">
                    {formatRate(rate)}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          {track.downloadName && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon-sm" asChild>
                  <a href={track.src} download={track.downloadName} aria-label="下载音频">
                    <Download />
                  </a>
                </Button>
              </TooltipTrigger>
              <TooltipContent>下载</TooltipContent>
            </Tooltip>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm" onClick={player.close} aria-label="关闭播放器" className="text-muted-foreground">
                <X />
              </Button>
            </TooltipTrigger>
            <TooltipContent>关闭</TooltipContent>
          </Tooltip>
        </div>
      </section>
    </div>
  );
}

function SlimProgress({ currentTime, duration, className }: { currentTime: number; duration: number; className?: string }) {
  const progress = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;
  return (
    <div aria-hidden className={cn("h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-brand-soft", className)}>
      <div className="h-full rounded-full bg-brand" style={{ width: `${progress}%` }} />
    </div>
  );
}
