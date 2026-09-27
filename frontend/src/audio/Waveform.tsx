import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { cn } from "@/lib/utils";
import { formatTime, placeholderPeaks, resamplePeaks } from "./peaks";

type WaveformProps = {
  /** 归一化峰值；为 null 时绘制静态占位波形。 */
  peaks: number[] | null;
  /** 当前播放时间与总时长（秒）。 */
  currentTime: number;
  duration: number;
  onSeek?: (seconds: number) => void;
  label: string;
  height?: number;
  barWidth?: number;
  gap?: number;
  className?: string;
};

const PLAYED = "#0ea5e9";
const HOVER = "rgba(14, 165, 233, 0.45)";
const REST = "rgba(148, 163, 184, 0.45)";
const KEY_STEP_SECONDS = 5;

/** Canvas 波形进度条：已播放部分为天空蓝，点击或拖动跳转，左右方向键快退 / 快进。 */
export function Waveform({
  peaks,
  currentTime,
  duration,
  onSeek,
  label,
  height = 40,
  barWidth = 3,
  gap = 2,
  className,
}: WaveformProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const draggingRef = useRef(false);
  const [width, setWidth] = useState(0);
  const [hoverRatio, setHoverRatio] = useState<number | null>(null);
  const progress = duration > 0 ? Math.min(1, Math.max(0, currentTime / duration)) : 0;
  const interactive = Boolean(onSeek) && duration > 0;

  useEffect(() => {
    const element = wrapperRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !width) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    const count = Math.max(1, Math.floor((width + gap) / (barWidth + gap)));
    const values = peaks ? resamplePeaks(peaks, count) : placeholderPeaks(count);
    const step = width / count;
    const radius = barWidth / 2;
    values.forEach((value, index) => {
      const barHeight = Math.max(barWidth, value * (height - 2));
      const x = index * step + (step - barWidth) / 2;
      const y = (height - barHeight) / 2;
      const center = (index + 0.5) / count;
      context.fillStyle =
        center <= progress ? PLAYED : hoverRatio !== null && center <= hoverRatio ? HOVER : REST;
      context.beginPath();
      context.roundRect(x, y, barWidth, barHeight, radius);
      context.fill();
    });
  }, [peaks, progress, hoverRatio, width, height, barWidth, gap]);

  const ratioAt = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
  };
  const seekTo = (seconds: number) => onSeek?.(Math.min(duration, Math.max(0, seconds)));

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!interactive || event.button !== 0) return;
    draggingRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    seekTo(ratioAt(event) * duration);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!interactive) return;
    const ratio = ratioAt(event);
    if (event.pointerType === "mouse") setHoverRatio(ratio);
    if (draggingRef.current) seekTo(ratio * duration);
  };
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    draggingRef.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!interactive) return;
    const actions: Record<string, number> = {
      ArrowLeft: currentTime - KEY_STEP_SECONDS,
      ArrowDown: currentTime - KEY_STEP_SECONDS,
      ArrowRight: currentTime + KEY_STEP_SECONDS,
      ArrowUp: currentTime + KEY_STEP_SECONDS,
      Home: 0,
      End: duration,
    };
    if (!(event.key in actions)) return;
    event.preventDefault();
    seekTo(actions[event.key]);
  };

  return (
    <div
      ref={wrapperRef}
      role="slider"
      tabIndex={interactive ? 0 : -1}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      aria-valuenow={Math.round(currentTime)}
      aria-valuetext={`${formatTime(currentTime)} / ${formatTime(duration)}`}
      aria-disabled={!interactive || undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={() => setHoverRatio(null)}
      onKeyDown={onKeyDown}
      className={cn(
        "relative min-w-0 flex-1 touch-none rounded-sm outline-none select-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
        interactive ? "cursor-pointer" : "cursor-default",
        !peaks && "opacity-70",
        className,
      )}
      style={{ height }}
    >
      <canvas ref={canvasRef} aria-hidden className="block size-full" />
    </div>
  );
}
