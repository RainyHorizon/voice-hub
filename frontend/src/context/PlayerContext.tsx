import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { appAudioController } from "../audioPlayback";

export type PlayerTrack = {
  src: string;
  title: string;
  subtitle?: string;
  /** 设置后播放条显示下载按钮。 */
  downloadName?: string;
};

type PlayerContextValue = {
  track: PlayerTrack | null;
  audio: HTMLAudioElement | null;
  playing: boolean;
  duration: number;
  rate: number;
  /** 播放新音频；传入当前音频时从暂停处继续。 */
  play: (track: PlayerTrack) => void;
  toggle: () => void;
  pause: () => void;
  seek: (seconds: number) => void;
  setRate: (rate: number) => void;
  close: () => void;
  isCurrent: (src?: string | null) => boolean;
};

const PlayerContext = createContext<PlayerContextValue | null>(null);

export const playbackRates = [0.75, 1, 1.25, 1.5, 2];

/** 全局唯一播放器：底部播放条、历史列表等共用一个 audio 元素，同一时间只播放一条。 */
export function PlayerProvider({ children }: { children: ReactNode }) {
  const [audio] = useState(() => (typeof Audio === "undefined" ? null : new Audio()));
  const [track, setTrack] = useState<PlayerTrack | null>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [rate, setRateState] = useState(1);

  useEffect(() => {
    if (!audio) return;
    audio.preload = "metadata";
    const onPlay = () => {
      appAudioController.activate(audio);
      setPlaying(true);
    };
    const onStop = () => {
      appAudioController.release(audio);
      setPlaying(false);
    };
    const onDuration = () => setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onStop);
    audio.addEventListener("ended", onStop);
    audio.addEventListener("loadedmetadata", onDuration);
    audio.addEventListener("durationchange", onDuration);
    audio.addEventListener("emptied", onDuration);
    return () => {
      audio.pause();
      appAudioController.release(audio);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onStop);
      audio.removeEventListener("ended", onStop);
      audio.removeEventListener("loadedmetadata", onDuration);
      audio.removeEventListener("durationchange", onDuration);
      audio.removeEventListener("emptied", onDuration);
    };
  }, [audio]);

  const start = useCallback(() => {
    if (!audio) return;
    // 先登记再播放，确保页面内其他预览立即暂停。
    appAudioController.activate(audio);
    audio.play().catch(() => {
      appAudioController.release(audio);
      setPlaying(false);
    });
  }, [audio]);

  const play = useCallback(
    (next: PlayerTrack) => {
      if (!audio) return;
      setTrack(next);
      if (audio.src !== new URL(next.src, window.location.href).href) {
        audio.src = next.src;
        audio.playbackRate = rate;
      }
      start();
    },
    [audio, rate, start],
  );

  const pause = useCallback(() => audio?.pause(), [audio]);

  const toggle = useCallback(() => {
    if (!audio || !track) return;
    if (audio.paused) start();
    else audio.pause();
  }, [audio, track, start]);

  const seek = useCallback(
    (seconds: number) => {
      if (!audio || !Number.isFinite(seconds)) return;
      audio.currentTime = seconds;
    },
    [audio],
  );

  const setRate = useCallback(
    (value: number) => {
      setRateState(value);
      if (audio) audio.playbackRate = value;
    },
    [audio],
  );

  const close = useCallback(() => {
    if (!audio) return;
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    setTrack(null);
  }, [audio]);

  const isCurrent = useCallback(
    (src?: string | null) => Boolean(src && track && track.src === src),
    [track],
  );

  const value = useMemo<PlayerContextValue>(
    () => ({ track, audio, playing, duration, rate, play, toggle, pause, seek, setRate, close, isCurrent }),
    [track, audio, playing, duration, rate, play, toggle, pause, seek, setRate, close, isCurrent],
  );

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export function usePlayer() {
  const value = useContext(PlayerContext);
  if (!value) throw new Error("usePlayer 必须在 PlayerProvider 内使用");
  return value;
}
