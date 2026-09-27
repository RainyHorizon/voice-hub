/** 把 PCM 采样压缩成 bars 根柱子的峰值，结果按最大峰归一化到 0–1。 */
export function computePeaks(channelData: ArrayLike<number>, bars: number): number[] {
  const count = Math.max(0, Math.floor(bars));
  if (!count) return [];
  const length = channelData.length;
  if (!length) return new Array<number>(count).fill(0);
  const peaks = new Array<number>(count);
  let max = 0;
  for (let bar = 0; bar < count; bar += 1) {
    const start = Math.floor((bar * length) / count);
    const end = Math.max(start + 1, Math.floor(((bar + 1) * length) / count));
    let peak = 0;
    for (let index = start; index < end; index += 1) {
      const value = Math.abs(channelData[index]);
      if (value > peak) peak = value;
    }
    peaks[bar] = peak;
    if (peak > max) max = peak;
  }
  return max > 0 ? peaks.map((peak) => peak / max) : peaks;
}

/** 按画布宽度重新取样：缩减时取区间最大值，放大时重复相邻值。 */
export function resamplePeaks(peaks: readonly number[], bars: number): number[] {
  const count = Math.max(0, Math.floor(bars));
  if (!count) return [];
  if (!peaks.length) return new Array<number>(count).fill(0);
  if (peaks.length === count) return [...peaks];
  return Array.from({ length: count }, (_, bar) => {
    const start = Math.floor((bar * peaks.length) / count);
    const end = Math.max(start + 1, Math.floor(((bar + 1) * peaks.length) / count));
    let peak = 0;
    for (let index = start; index < end; index += 1) peak = Math.max(peak, peaks[index]);
    return peak;
  });
}

/** 解码失败或加载中使用的静态占位波形，结果稳定可复现。 */
export function placeholderPeaks(bars: number): number[] {
  const count = Math.max(0, Math.floor(bars));
  return Array.from({ length: count }, (_, index) => {
    const value = 0.42 + 0.24 * Math.sin(index * 0.62) + 0.14 * Math.sin(index * 1.73 + 1);
    return Math.min(1, Math.max(0.12, value));
  });
}

/** 秒数格式化为 m:ss，超过一小时为 h:mm:ss；无效值显示 0:00。 */
export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = String(total % 60).padStart(2, "0");
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${rest}` : `${minutes}:${rest}`;
}
