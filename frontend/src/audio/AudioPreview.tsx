import { Download, Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { appAudioController } from "../audioPlayback";
import { useMediaTime } from "./useMediaTime";
import { useWaveformPeaks } from "./useWaveformPeaks";
import { Waveform } from "./Waveform";
import { formatTime } from "./peaks";

type AudioPreviewProps = {
  src?: string | null;
  label: string;
  downloadName?: string;
  className?: string;
};

/** 页面内的小型波形播放器，替代原生 audio controls；与全局播放器互斥播放。 */
export function AudioPreview({ src, label, downloadName, className }: AudioPreviewProps) {
  const [audio, setAudio] = useState<HTMLAudioElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const currentTime = useMediaTime(audio);
  const { peaks, duration: decodedDuration } = useWaveformPeaks(src);
  const total = duration || decodedDuration;

  useEffect(
    () => () => {
      const element = audioRef.current;
      if (!element) return;
      element.pause();
      appAudioController.release(element);
    },
    [],
  );

  const bindAudio = (element: HTMLAudioElement | null) => {
    audioRef.current = element;
    setAudio(element);
  };

  const toggle = () => {
    const element = audioRef.current;
    if (!element || !src) return;
    if (!element.paused) {
      element.pause();
      return;
    }
    appAudioController.activate(element);
    element.play().catch(() => {
      appAudioController.release(element);
      setPlaying(false);
    });
  };

  const stop = () => {
    if (audioRef.current) appAudioController.release(audioRef.current);
    setPlaying(false);
  };

  return (
    <div className={cn("flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5", className)}>
      <Button
        size="icon"
        className="shrink-0 rounded-full"
        onClick={toggle}
        disabled={!src}
        aria-label={playing ? `暂停${label}` : `播放${label}`}
      >
        {playing ? <Pause fill="currentColor" /> : <Play className="translate-x-px" fill="currentColor" />}
      </Button>
      <Waveform
        peaks={peaks}
        currentTime={currentTime}
        duration={total}
        onSeek={(seconds) => {
          if (audioRef.current) audioRef.current.currentTime = seconds;
        }}
        label={`${label}进度`}
        height={32}
      />
      <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
        {formatTime(playing || currentTime > 0 ? currentTime : total)}
      </span>
      {downloadName && src && (
        <Button variant="ghost" size="icon-sm" asChild>
          <a href={src} download={downloadName} aria-label={`下载${label}`} title="下载">
            <Download />
          </a>
        </Button>
      )}
      {src && (
        <audio
          ref={bindAudio}
          src={src}
          preload="metadata"
          onPlay={() => {
            if (audioRef.current) appAudioController.activate(audioRef.current);
            setPlaying(true);
          }}
          onPause={stop}
          onEnded={stop}
          onLoadedMetadata={(event) => {
            const value = event.currentTarget.duration;
            setDuration(Number.isFinite(value) ? value : 0);
          }}
        />
      )}
    </div>
  );
}
