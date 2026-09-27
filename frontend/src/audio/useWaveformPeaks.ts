import { useEffect, useState } from "react";
import { computePeaks } from "./peaks";

/** 解码后固定保存的峰值精度，绘制时再按画布宽度重采样。 */
const PEAK_RESOLUTION = 480;
const CACHE_LIMIT = 40;

type PeaksResult = { peaks: number[] | null; duration: number };

const cache = new Map<string, Promise<PeaksResult>>();
let decoder: BaseAudioContext | null = null;

// 离线上下文只用来解码，不占用音频输出，也不受自动播放策略限制。
function getDecoder() {
  if (decoder) return decoder;
  decoder = typeof OfflineAudioContext === "undefined" ? null : new OfflineAudioContext(1, 1, 44100);
  return decoder;
}

async function decodePeaks(url: string): Promise<PeaksResult> {
  const context = getDecoder();
  if (!context) return { peaks: null, duration: 0 };
  const response = await fetch(url);
  if (!response.ok) throw new Error(`音频加载失败：${response.status}`);
  const buffer = await context.decodeAudioData(await response.arrayBuffer());
  // 多声道取第一声道即可，语音场景下各声道波形几乎一致。
  return { peaks: computePeaks(buffer.getChannelData(0), PEAK_RESOLUTION), duration: buffer.duration };
}

function loadPeaks(url: string) {
  const cached = cache.get(url);
  if (cached) return cached;
  const task = decodePeaks(url).catch(() => ({ peaks: null, duration: 0 }));
  cache.set(url, task);
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
  return task;
}

/** 解码音频波形峰值；未加载或解码失败时 peaks 为 null，由调用方显示占位波形。 */
export function useWaveformPeaks(url?: string | null) {
  const [state, setState] = useState<PeaksResult & { url?: string | null }>({ peaks: null, duration: 0 });

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    void loadPeaks(url).then((result) => {
      if (!cancelled) setState({ ...result, url });
    });
    return () => {
      cancelled = true;
    };
  }, [url]);

  const current = url && state.url === url;
  return {
    peaks: current ? state.peaks : null,
    duration: current ? state.duration : 0,
    loading: Boolean(url) && !current,
  };
}
