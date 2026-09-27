import { Gauge, Play, Plus, SlidersHorizontal, Sparkles, Type } from "lucide-react";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { usePlayer } from "@/context/PlayerContext";
import { cn } from "@/lib/utils";
import { EqualizerBars, ProviderMark } from "../components/ProviderMark";
import { PageHeader } from "../components/layout/PageHeader";
import { useStudio } from "../context/StudioContext";
import { credentialProviderIds, providerMeta, sample, voiceMatchesModel } from "../utils";

const MAX_CHARS = 10000;

export function SynthesisPage() {
  const p = useStudio();
  const player = usePlayer();
  const synthesisModels = p.models.filter((item) =>
    item.operations.includes("synthesis"),
  );
  const synthesisProviderIds = ["demo", ...credentialProviderIds].filter((id) =>
    synthesisModels.some((item) => item.provider === id),
  );
  const selectedProvider =
    p.selectedModel?.provider || synthesisModels[0]?.provider || "";
  const providerModels = synthesisModels.filter(
    (item) => item.provider === selectedProvider,
  );
  const compatibleVoices = p.voices.filter((item) =>
    voiceMatchesModel(item, p.selectedModel),
  );
  const selectedVoiceValue = compatibleVoices.some(
    (item) => item.public_name === p.voice,
  )
    ? p.voice
    : "";
  const chooseProvider = (provider: string) => {
    const first = synthesisModels.find((item) => item.provider === provider);
    if (first) p.setModel(first.gateway_id);
  };
  // 0–100 的滑杆位置分段映射到 0.5–1.0–2.0 倍速，让“自然”落在正中。
  const speedPosition = p.speed <= 1
    ? ((p.speed - 0.5) / 0.5) * 50
    : 50 + ((p.speed - 1) / 1) * 50;
  const changeSpeed = (position: number) => {
    const speed = position <= 50
      ? 0.5 + (position / 50) * 0.5
      : 1 + ((position - 50) / 50);
    p.setSpeed(Math.round(speed * 10) / 10);
  };
  const supportsInstructions =
    p.selectedModel?.model_id === "qwen3-tts-instruct-flash" ||
    p.selectedModel?.model_id === "seed-tts-2.0";
  const isDemo = p.selectedModel?.mode === "demo";
  const voiceLabel = p.selectedVoice?.display_name || p.voice;
  const track = p.audioUrl
    ? {
        src: p.audioUrl,
        title: "刚刚生成",
        subtitle: `${voiceLabel} · ${p.format.toUpperCase()}`,
        downloadName: "voice-hub." + p.format,
      }
    : null;

  // 新音频生成后自动交给底部播放条。
  const playedUrlRef = useRef(p.audioUrl);
  useEffect(() => {
    if (!track || playedUrlRef.current === track.src) return;
    playedUrlRef.current = track.src;
    player.play(track);
    // 只在音频地址变化时触发，track 的其他字段随之变化。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.audioUrl]);

  return (
    <section>
      <PageHeader
        title="语音合成"
        description="输入一段文字，选择厂商、模型与音色，生成自然流畅的语音。"
      />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,380px)]">
        <div className="flex min-w-0 flex-col gap-6">
          <div className="island flex flex-col overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-6 pt-5 md:px-7">
              <Label htmlFor="synthesis-text" className="text-base font-semibold text-foreground">
                <Type className="size-4 text-brand" />
                文本
              </Label>
              <span
                className={cn(
                  "font-mono text-xs tabular-nums text-muted-foreground",
                  p.text.length >= MAX_CHARS && "text-destructive",
                )}
                aria-live="polite"
              >
                {p.text.length.toLocaleString()} / {MAX_CHARS.toLocaleString()}
              </span>
            </div>
            <textarea
              id="synthesis-text"
              value={p.text}
              onChange={(event) => p.setText(event.target.value)}
              maxLength={MAX_CHARS}
              spellCheck={false}
              placeholder="在这里输入或粘贴要合成的文字…"
              className="min-h-[280px] w-full flex-1 resize-y border-0 bg-transparent px-6 py-4 text-base leading-8 text-foreground outline-none placeholder:text-muted-foreground md:min-h-[360px] md:px-7 md:text-[17px]"
            />
            <div className="flex flex-wrap items-center gap-2 border-t px-6 py-3.5 md:px-7">
              <Pill label="预估时长" value={`${Math.max(1, Math.round(p.text.length * 0.05))}s`} />
              <Pill label="调用方式" value={isDemo ? "本地演示" : "厂商 API"} />
              <Pill label="输出" value={p.format.toUpperCase()} />
              <span className="hidden text-xs text-muted-foreground xl:inline">支持中文、英文与混合文本</span>
              <Button variant="ghost" size="sm" className="ml-auto" onClick={() => p.setText(sample)}>
                填入示例
              </Button>
            </div>
          </div>

          {track && (
            <div className="island flex items-center gap-4 p-4 md:px-6">
              <Button
                size="icon"
                variant={player.isCurrent(track.src) && player.playing ? "secondary" : "default"}
                className="shrink-0 rounded-full"
                onClick={() => (player.isCurrent(track.src) ? player.toggle() : player.play(track))}
                aria-label={player.isCurrent(track.src) && player.playing ? "暂停刚刚生成的音频" : "播放刚刚生成的音频"}
              >
                {player.isCurrent(track.src) && player.playing ? (
                  <EqualizerBars className="h-3.5 text-brand" />
                ) : (
                  <Play className="translate-x-px" fill="currentColor" />
                )}
              </Button>
              <div className="min-w-0 flex-1">
                <p className="m-0 text-sm font-semibold text-foreground">刚刚生成 · {track.subtitle}</p>
                <p className="m-0 mt-0.5 truncate text-sm text-muted-foreground">{p.text}</p>
              </div>
            </div>
          )}
        </div>

        <aside
          aria-labelledby="synthesis-settings-title"
          className={cn(
            "island flex flex-col overflow-hidden lg:sticky lg:top-6",
            // 有播放条时限制高度：8.75rem 是页头下方的初始位置，6.5rem 是播放条及间距。
            player.track && "lg:max-h-[calc(100dvh-15.25rem)]",
          )}
        >
          {/* 参数区可在卡内滚动，生成按钮固定在卡片底部，避免被底部播放条遮住。 */}
          <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-6 pb-5 md:p-7 md:pb-5">
            <h2 id="synthesis-settings-title" className="m-0 flex items-center gap-2 text-base font-semibold text-foreground">
              <SlidersHorizontal className="size-4 text-brand" />
              参数
            </h2>

            <Field label="服务来源" htmlFor="synthesis-provider">
              <Select value={selectedProvider} onValueChange={chooseProvider}>
                <SelectTrigger id="synthesis-provider" className="w-full">
                  <SelectValue placeholder="选择厂商" />
                </SelectTrigger>
                <SelectContent position="popper">
                  {synthesisProviderIds.map((id) => (
                    <SelectItem value={id} key={id}>
                      <ProviderMark provider={id} className="size-5 rounded-[6px] text-[10px]" />
                      {providerMeta[id].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="模型" htmlFor="synthesis-model">
              <Select value={p.model} onValueChange={p.setModel}>
                <SelectTrigger id="synthesis-model" className="w-full">
                  <SelectValue placeholder="选择模型" />
                </SelectTrigger>
                <SelectContent position="popper">
                  {providerModels.map((item) => (
                    <SelectItem value={item.gateway_id} key={item.gateway_id}>
                      {item.display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {p.selectedModel && (
                <div className="flex items-center gap-2.5 rounded-md bg-muted/60 px-3 py-2">
                  <ProviderMark provider={p.selectedModel.provider} />
                  <div className="min-w-0 leading-tight">
                    <strong className="block text-[13px] font-semibold text-foreground">{p.selectedModel.quality}质感</strong>
                    <small className="block text-xs text-muted-foreground">
                      {p.selectedModel.latency}响应 · {isDemo ? "本地演示" : "厂商接口"}
                    </small>
                  </div>
                </div>
              )}
            </Field>

            <Field label="音色" htmlFor="synthesis-voice">
              <Select value={selectedVoiceValue} onValueChange={p.setVoice} disabled={!compatibleVoices.length}>
                <SelectTrigger id="synthesis-voice" className="w-full">
                  <SelectValue placeholder="请先创建或导入兼容音色" />
                </SelectTrigger>
                <SelectContent position="popper" className="max-h-72">
                  {compatibleVoices.map((item) => (
                    <SelectItem value={item.public_name} key={item.id}>
                      <span className="truncate">{item.display_name}</span>
                      <span className="truncate font-mono text-xs text-muted-foreground">{item.public_name}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <button
                type="button"
                onClick={() => p.setActive("clone")}
                className="inline-flex w-fit items-center gap-1.5 rounded-sm text-[13px] font-medium text-primary outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <Plus className="size-3.5" />
                创建或克隆音色
              </button>
            </Field>

            {supportsInstructions && (
              <Field label="表达指令" htmlFor="synthesis-instructions">
                <Input
                  id="synthesis-instructions"
                  value={p.instructions}
                  onChange={(event) => p.setInstructions(event.target.value)}
                  placeholder="例如：温暖、克制，结尾轻微上扬"
                />
              </Field>
            )}

            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <Label id="synthesis-speed-label" className="text-[13px] text-soft">语速</Label>
                <output className="font-mono text-sm font-medium text-brand tabular-nums">{p.speed.toFixed(1)}×</output>
              </div>
              <Slider
                min={0}
                max={100}
                step={1}
                value={[speedPosition]}
                onValueChange={([position]) => changeSpeed(position)}
                thumbProps={{
                  "aria-labelledby": "synthesis-speed-label",
                  "aria-valuetext": `${p.speed.toFixed(1)} 倍`,
                }}
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>慢</span>
                <span>自然</span>
                <span>快</span>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label id="synthesis-format-label" className="text-[13px] text-soft">输出格式</Label>
              <ToggleGroup
                type="single"
                variant="outline"
                value={p.format}
                onValueChange={(value) => value && p.setFormat(value)}
                aria-labelledby="synthesis-format-label"
                className="grid w-full grid-cols-2 gap-1 rounded-md bg-muted p-1 shadow-none"
              >
                {["wav", "mp3"].map((item) => (
                  <ToggleGroupItem
                    key={item}
                    value={item}
                    className="h-9 rounded-sm border-0 bg-transparent font-mono text-xs shadow-none hover:bg-card/70 data-[state=on]:bg-card data-[state=on]:text-foreground data-[state=on]:shadow-sm"
                  >
                    {item.toUpperCase()}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>

            <p className="m-0 flex gap-2 rounded-md bg-accent/60 px-3 py-2.5 text-xs leading-relaxed text-accent-foreground">
              <Gauge className="mt-px size-4 shrink-0" />
              {isDemo
                ? "本地演示无需配置厂商凭据，可直接生成测试音频。"
                : "当前模型会调用已保存的厂商凭据，结果来自对应厂商的语音服务。"}
            </p>
          </div>

          <div className="shrink-0 border-t border-border/70 px-6 pt-4 pb-6 md:px-7 md:pb-7">
            <Button
              size="lg"
              className="w-full"
              onClick={() => void p.synthesize()}
              disabled={p.busy || !selectedVoiceValue}
              aria-busy={p.busy || undefined}
            >
              {p.busy ? <EqualizerBars /> : <Sparkles />}
              {p.busy ? "生成中…" : "生成语音"}
            </Button>
          </div>
        </aside>
      </div>
    </section>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={htmlFor} className="text-[13px] text-soft">{label}</Label>
      {children}
    </div>
  );
}

function Pill({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <strong className="font-mono font-medium text-foreground">{value}</strong>
    </span>
  );
}
