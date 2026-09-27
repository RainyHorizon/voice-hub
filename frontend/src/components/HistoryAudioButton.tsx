import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePlayer } from "@/context/PlayerContext";
import { cn } from "@/lib/utils";
import { EqualizerBars } from "./ProviderMark";

type HistoryAudioButtonProps = {
  src?: string | null;
  label: string;
  title: string;
  subtitle?: string;
  downloadName?: string;
  className?: string;
};

/** 历史列表的播放按钮：交给底部播放条播放，同一时间只播放一条。 */
export function HistoryAudioButton({ src, label, title, subtitle, downloadName, className }: HistoryAudioButtonProps) {
  const player = usePlayer();
  const active = Boolean(src && player.isCurrent(src));
  const playing = active && player.playing;
  const onClick = () => {
    if (!src) return;
    if (active) player.toggle();
    else player.play({ src, title, subtitle, downloadName });
  };
  const accessibleLabel = !src ? "声音文件不可用" : playing ? `暂停：${label}` : label;
  return (
    <Button
      variant={active ? "secondary" : "outline"}
      size="icon"
      className={cn("shrink-0 rounded-full", active && "text-brand", className)}
      onClick={onClick}
      disabled={!src}
      title={accessibleLabel}
      aria-label={accessibleLabel}
      aria-pressed={playing}
    >
      {playing ? <EqualizerBars className="h-3.5 text-brand" /> : <Play fill="currentColor" className="size-3.5 translate-x-px" />}
    </Button>
  );
}
