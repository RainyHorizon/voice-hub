import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { appAudioController } from "../audioPlayback";

export function HistoryAudioButton({ src, label, compact = false }: { src?: string | null; label: string; compact?: boolean }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const handlePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    appAudioController.activate(audio);
    setPlaying(true);
  };
  const handleStop = () => {
    const audio = audioRef.current;
    if (!audio) return;
    appAudioController.release(audio);
    setPlaying(false);
  };
  useEffect(
    () => () => {
      const audio = audioRef.current;
      if (!audio) return;
      audio.pause();
      appAudioController.release(audio);
    },
    [],
  );
  const toggle = async () => {
    const audio = audioRef.current;
    if (!audio || !src) return;
    if (audio.paused) {
      appAudioController.activate(audio);
      try {
        await audio.play();
      } catch {
        appAudioController.release(audio);
        setPlaying(false);
      }
    } else {
      audio.pause();
    }
  };
  return (
    <>
      <button className={`history-play${compact ? " compact" : ""}`} onClick={() => void toggle()} disabled={!src} title={src ? label : "声音文件不可用"} aria-label={src ? label : "声音文件不可用"}>
        {playing ? <Pause size={compact ? 15 : 18} fill="currentColor" /> : <Play size={compact ? 15 : 18} fill="currentColor" />}
      </button>
      {src && (
        <audio
          ref={audioRef}
          src={src}
          preload="none"
          onPlay={handlePlay}
          onPause={handleStop}
          onEnded={handleStop}
        />
      )}
    </>
  );
}
