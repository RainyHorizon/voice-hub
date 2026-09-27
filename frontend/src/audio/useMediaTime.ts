import { useEffect, useState } from "react";

/**
 * 订阅媒体元素的播放进度。播放中用 requestAnimationFrame 平滑刷新；
 * timeupdate 兜底同步，保证后台标签页等 rAF 被节流时进度仍然正确。
 */
export function useMediaTime(audio: HTMLAudioElement | null) {
  const [time, setTime] = useState(0);

  useEffect(() => {
    if (!audio) return;
    let frame = 0;
    const sync = () => setTime(audio.currentTime);
    const tick = () => {
      sync();
      frame = requestAnimationFrame(tick);
    };
    const start = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(tick);
    };
    const stop = () => {
      cancelAnimationFrame(frame);
      sync();
    };
    audio.addEventListener("play", start);
    audio.addEventListener("pause", stop);
    audio.addEventListener("ended", stop);
    audio.addEventListener("emptied", sync);
    audio.addEventListener("seeked", sync);
    audio.addEventListener("timeupdate", sync);
    if (audio.paused) sync();
    else start();
    return () => {
      cancelAnimationFrame(frame);
      audio.removeEventListener("play", start);
      audio.removeEventListener("pause", stop);
      audio.removeEventListener("ended", stop);
      audio.removeEventListener("emptied", sync);
      audio.removeEventListener("seeked", sync);
      audio.removeEventListener("timeupdate", sync);
    };
  }, [audio]);

  return time;
}
