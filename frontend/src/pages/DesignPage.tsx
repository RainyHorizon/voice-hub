import { useEffect, useMemo, useState } from "react";
import { ArrowRight, AudioLines, Info, WandSparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { AudioPreview } from "../audio/AudioPreview";
import { ProviderMark } from "../components/ProviderMark";
import { ProviderPills } from "../components/ProviderPills";
import { Field, Note } from "../components/form/Field";
import { PageHeader } from "../components/layout/PageHeader";
import { useStudio } from "../context/StudioContext";
import type { Voice } from "../types";
import { credentialProviderIds, providerMeta } from "../utils";

export function DesignPage() {
  const { models, designVoice: onDesign, useVoice: selectVoice } = useStudio();
  const designModels = useMemo(() => models.filter((item) => item.operations.includes("design")), [models]);
  const [provider, setProvider] = useState("mimo");
  const [modelId, setModelId] = useState("mimo-v2.5-tts-voicedesign");
  const [prompt, setPrompt] = useState("年轻女性，声音清亮柔和，语速稍快，带有自然上扬的活泼语调，适合科技产品介绍。");
  const [previewText, setPreviewText] = useState("大家好，欢迎来到今天的声音实验室。让我们用一段自然的问候，听听这个全新的声音。 ");
  const [displayName, setDisplayName] = useState("我的设计音色");
  const [publicName, setPublicName] = useState("design-" + Date.now().toString().slice(-6));
  const [working, setWorking] = useState(false);
  const [previewVoice, setPreviewVoice] = useState<Voice | null>(null);
  const providerModels = designModels.filter((item) => item.provider === provider);
  const selected = designModels.find((item) => item.provider === provider && item.model_id === modelId);
  const promptLimit = selected?.design_prompt_max ?? 2000;
  const previewMin = selected?.design_preview_min ?? 1;
  const previewLimit = selected?.design_preview_max ?? 2000;
  const promptInvalid = prompt.length > promptLimit;
  const previewInvalid = previewText.length < previewMin || previewText.length > previewLimit;
  const designProviderIds = credentialProviderIds.filter((id) =>
    designModels.some((item) => item.provider === id),
  );
  const canSubmit =
    !working &&
    Boolean(selected) &&
    Boolean(prompt.trim()) &&
    Boolean(previewText.trim()) &&
    !promptInvalid &&
    !previewInvalid &&
    Boolean(displayName.trim()) &&
    Boolean(publicName.trim());

  useEffect(() => {
    if (selected) return;
    const first = providerModels[0] || designModels[0];
    if (first) {
      setProvider(first.provider);
      setModelId(first.model_id);
    }
  }, [designModels, providerModels, selected]);

  const chooseProvider = (nextProvider: string) => {
    setProvider(nextProvider);
    const first = designModels.find((item) => item.provider === nextProvider);
    if (first) setModelId(first.model_id);
    setPreviewVoice(null);
  };
  const submit = async () => {
    if (!selected || !prompt.trim() || !previewText.trim() || promptInvalid || previewInvalid || !displayName.trim() || !publicName.trim()) return;
    setWorking(true);
    try {
      const voice = await onDesign({
        provider,
        model_id: modelId,
        prompt: prompt.trim(),
        preview_text: previewText.trim(),
        display_name: displayName.trim(),
        public_name: publicName.trim(),
      });
      setPreviewVoice(voice);
    } finally {
      setWorking(false);
    }
  };

  return (
    <section>
      <PageHeader
        title="语音设计"
        description="不需要参考音频。用自然语言描述年龄、质感、语速和情绪，创建一枚可以复用的设计音色。"
      />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(340px,400px)]">
        <div className="flex min-w-0 flex-col gap-6">
          <div className="island flex flex-col gap-5 p-6 md:p-7">
            <h2 className="m-0 flex items-center gap-2 text-base font-semibold text-foreground">
              <WandSparkles className="size-4 text-brand" />
              描述你想要的声音
            </h2>
            <Field
              label="声音描述"
              htmlFor="design-prompt"
              aside={<CharCount id="design-prompt-count" invalid={promptInvalid} value={prompt.length} max={promptLimit} />}
            >
              <Textarea
                id="design-prompt"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                aria-invalid={promptInvalid}
                aria-describedby="design-prompt-count"
                placeholder="例如：中年男性，低沉温暖，语速平缓，适合纪录片旁白。"
                className="min-h-40 resize-y text-[15px] leading-7"
              />
            </Field>
            <Field
              label="试听文本"
              htmlFor="design-preview-text"
              aside={
                <CharCount
                  id="design-preview-count"
                  invalid={previewInvalid}
                  value={previewText.length}
                  max={previewLimit}
                  min={previewMin}
                />
              }
            >
              <Textarea
                id="design-preview-text"
                value={previewText}
                onChange={(event) => setPreviewText(event.target.value)}
                aria-invalid={previewInvalid}
                aria-describedby="design-preview-count"
                className="min-h-28 resize-y text-[15px] leading-7"
              />
            </Field>
          </div>

          {previewVoice && (
            <div className="island flex flex-col gap-4 p-5 md:px-6" aria-live="polite">
              <div className="flex flex-wrap items-center gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-md bg-accent text-brand">
                  <AudioLines className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="truncate text-[15px] font-semibold text-foreground">{previewVoice.display_name}</strong>
                    <Badge className="rounded-full bg-sky-50 px-2.5 font-medium text-sky-700">
                      {previewVoice.provider === "mimo" ? "请求级设计模板" : "已保存到音色库"}
                    </Badge>
                  </div>
                  <span className="block truncate font-mono text-xs text-muted-foreground">{previewVoice.public_name}</span>
                </div>
                <Button onClick={() => selectVoice(previewVoice)}>
                  去合成
                  <ArrowRight />
                </Button>
              </div>
              {previewVoice.preview_url ? (
                <AudioPreview
                  key={previewVoice.preview_url}
                  src={previewVoice.preview_url}
                  label={`试听 ${previewVoice.display_name}`}
                />
              ) : (
                <p className="m-0 text-sm text-muted-foreground">厂商未返回试听音频，可直接去合成页试用。</p>
              )}
            </div>
          )}
        </div>

        <aside aria-labelledby="design-settings-title" className="island flex flex-col gap-5 p-6 md:p-7">
          <h2 id="design-settings-title" className="m-0 text-base font-semibold text-foreground">
            设计引擎
          </h2>

          <ProviderPills
            label="声音设计厂商"
            value={provider}
            onChange={chooseProvider}
            options={designProviderIds.map((id) => ({
              id,
              label: providerMeta[id].label,
              detail: String(designModels.filter((item) => item.provider === id).length),
            }))}
          />

          <Field label="设计模型" htmlFor="design-model">
            <Select
              value={modelId}
              onValueChange={(value) => {
                setModelId(value);
                setPreviewVoice(null);
              }}
            >
              <SelectTrigger id="design-model" translate="no" className="w-full">
                <SelectValue placeholder="选择模型" />
              </SelectTrigger>
              <SelectContent position="popper">
                {providerModels.map((item) => (
                  <SelectItem value={item.model_id} key={item.gateway_id}>
                    <ProviderMark provider={item.provider} className="size-5 rounded-[6px] text-[10px]" />
                    {item.display_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <Field label="显示名称" htmlFor="design-display-name">
              <Input id="design-display-name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
            </Field>
            <Field label="兼容别名" htmlFor="design-public-name">
              <Input
                id="design-public-name"
                value={publicName}
                onChange={(event) => setPublicName(event.target.value)}
                className="font-mono"
              />
            </Field>
          </div>

          <Note icon={<Info />}>
            描述越具体越好：年龄、性别、音色质感、语速、情绪和使用场景。设计会调用厂商接口并可能产生费用。
          </Note>

          <Button size="lg" className="w-full" onClick={() => void submit()} disabled={!canSubmit}>
            <WandSparkles />
            {working ? "正在设计..." : "创建并试听音色"}
          </Button>
        </aside>
      </div>
    </section>
  );
}

function CharCount({ id, value, max, min = 1, invalid }: { id: string; value: number; max: number; min?: number; invalid: boolean }) {
  return (
    <span
      id={id}
      aria-live="polite"
      className={cn("font-mono text-xs tabular-nums text-muted-foreground", invalid && "font-medium text-destructive")}
    >
      {value.toLocaleString()} / {max.toLocaleString()}
      {min > 1 ? `，至少 ${min}` : ""}
    </span>
  );
}
