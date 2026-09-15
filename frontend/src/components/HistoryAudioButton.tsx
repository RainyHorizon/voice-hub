import { useRef, useState } from "react";
import { Pause, Play } from "lucide-react";

export function HistoryAudioButton({ src, label, compact = false }: { src?: string | null; label: string; compact?: boolean }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const toggle = async () => {
    const audio = audioRef.current;
    if (!audio || !src) return;
    if (audio.paused) {
      await audio.play();
      setPlaying(true);
    } else {
      audio.pause();
      setPlaying(false);
    }
  };
  return (
    <>
      <button className={`history-play${compact ? " compact" : ""}`} onClick={() => void toggle()} disabled={!src} title={src ? label : "声音文件不可用"} aria-label={src ? label : "声音文件不可用"}>
        {playing ? <Pause size={compact ? 15 : 18} fill="currentColor" /> : <Play size={compact ? 15 : 18} fill="currentColor" />}
      </button>
      {src && <audio ref={audioRef} src={src} preload="none" onEnded={() => setPlaying(false)} />}
    </>
  );
}
