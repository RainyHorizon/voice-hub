import { useEffect, useMemo, useRef, useState } from "react";
import { FileAudio, Mic2, Radio, RefreshCw, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { api } from "../api";
import { AudioPreview } from "../audio/AudioPreview";
import { ProviderMark } from "../components/ProviderMark";
import { Field, Note } from "../components/form/Field";
import { PageHeader } from "../components/layout/PageHeader";
import { useStudio } from "../context/StudioContext";
import type { ProviderAccount, ProviderProject, VolcengineSlot } from "../types";
import { credentialProviderIds, providerMeta } from "../utils";

const cloneLanguages = [
  { value: 0, label: "中文" },
  { value: 1, label: "英语" },
  { value: 2, label: "日语" },
  { value: 3, label: "西班牙语" },
  { value: 4, label: "印尼语" },
  { value: 5, label: "葡萄牙语" },
  { value: 8, label: "韩语" },
];

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function ClonePage() {
  const { models, cloneVoice: onClone, setNotice: onNotice } = useStudio();
  const cloneModels = useMemo(
    () =>
      models.filter(
        (item) => item.supports_clone && item.operations.includes("clone"),
      ),
    [models],
  );
  const [provider, setProvider] = useState("mimo");
  const [modelId, setModelId] = useState("mimo-v2.5-tts-voiceclone");
  const [displayName, setDisplayName] = useState("我的克隆音色");
  const [publicName, setPublicName] = useState(
    "clone-" + Date.now().toString().slice(-6),
  );
  const [speakerId, setSpeakerId] = useState("");
  const [volcengineAccounts, setVolcengineAccounts] = useState<ProviderAccount[]>([]);
  const [providerAccountId, setProviderAccountId] = useState("");
  const [volcengineProjects, setVolcengineProjects] = useState<ProviderProject[]>([]);
  const [providerProjectName, setProviderProjectName] = useState("");
  const [cloneLanguage, setCloneLanguage] = useState(0);
  const [voiceSlots, setVoiceSlots] = useState<VolcengineSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotMode, setSlotMode] = useState<"auto" | "manual">("auto");
  const [slotMessage, setSlotMessage] = useState("");
  const slotRequestRef = useRef(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState("");
  const [fileUrl, setFileUrl] = useState("");
  const fileUrlRef = useRef("");
  const [isDragging, setIsDragging] = useState(false);
  const [working, setWorking] = useState(false);
  const providerModels = cloneModels.filter(
    (item) => item.provider === provider,
  );
  const selected = cloneModels.find(
    (item) => item.provider === provider && item.model_id === modelId,
  );
  const isQwenClone = selected?.provider === "dashscope";
  const isVolcengineClone = selected?.provider === "volcengine";
  const isMiniMaxClone = selected?.provider === "minimax";
  const cloneProviderIds = credentialProviderIds.filter((id) =>
    cloneModels.some((item) => item.provider === id),
  );

  useEffect(() => {
    if (selected) return;
    const first = providerModels[0] || cloneModels[0];
    if (first) {
      setProvider(first.provider);
      setModelId(first.model_id);
    }
  }, [cloneModels, providerModels, selected]);

  // 本地试听地址在更换文件时释放，这里只负责离开页面时的最后一次释放。
  useEffect(
    () => () => {
      if (fileUrlRef.current) URL.revokeObjectURL(fileUrlRef.current);
    },
    [],
  );

  useEffect(() => {
    if (!isVolcengineClone) return;
    let cancelled = false;
    api<ProviderAccount[]>("/api/provider-accounts")
      .then((items) => {
        if (cancelled) return;
        const accounts = items.filter(
          (item) => item.provider === "volcengine",
        );
        setVolcengineAccounts(accounts);
        setProviderAccountId((current) =>
          accounts.some((item) => item.id === current) ? current : accounts[0]?.id || "",
        );
        if (!accounts.length) {
          setVoiceSlots([]);
          setSpeakerId("");
          setSlotMessage("请先在设置中保存火山引擎 API 凭据并同步项目。");
        }
      })
      .catch(() => {
        if (!cancelled) setSlotMessage("无法读取火山引擎项目配置。");
      });
    return () => {
      cancelled = true;
    };
  }, [isVolcengineClone]);

  useEffect(() => {
    if (!isVolcengineClone || !providerAccountId) return;
    let cancelled = false;
    api<{ projects: ProviderProject[] }>(
      `/api/provider-accounts/${encodeURIComponent(providerAccountId)}/projects`,
    )
      .then((result) => {
        if (cancelled) return;
        setVolcengineProjects(result.projects);
        setProviderProjectName((current) =>
          result.projects.some((item) => item.project_name === current)
            ? current
            : result.projects[0]?.project_name || "",
        );
      })
      .catch(() => {
        if (!cancelled) {
          setVolcengineProjects([]);
          setProviderProjectName("");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isVolcengineClone, providerAccountId]);

  const loadVoiceSlots = async (accountId: string) => {
    if (!accountId || slotMode === "manual") return;
    const requestId = ++slotRequestRef.current;
    setSlotsLoading(true);
    setSlotMessage("");
    try {
      const result = await api<{ slots: VolcengineSlot[] }>(
        `/api/provider-accounts/${encodeURIComponent(accountId)}/volcengine-slots?project_name=${encodeURIComponent(providerProjectName)}`,
      );
      if (requestId !== slotRequestRef.current) return;
      setVoiceSlots(result.slots);
      setSpeakerId((current) =>
        result.slots.some((item) => item.speaker_id === current)
          ? current
          : result.slots[0]?.speaker_id || "",
      );
      setSlotMessage(
        result.slots.length
          ? result.slots.length === 1
            ? "已自动选择当前项目唯一的空槽位。"
            : `找到 ${result.slots.length} 个空槽位，已选择第一个。`
          : "当前项目没有可用空槽位，可切换项目或改为手动填写。",
      );
    } catch (error) {
      if (requestId !== slotRequestRef.current) return;
      setVoiceSlots([]);
      setSpeakerId("");
      setSlotMessage(error instanceof Error ? error.message : "空槽位查询失败");
    } finally {
      if (requestId === slotRequestRef.current) setSlotsLoading(false);
    }
  };

  useEffect(() => {
    if (!isVolcengineClone || !providerAccountId || !providerProjectName || slotMode !== "auto") return;
    void loadVoiceSlots(providerAccountId);
    // Project and mode changes are the only automatic refresh triggers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVolcengineClone, providerAccountId, providerProjectName, slotMode]);

  const chooseProvider = (nextProvider: string) => {
    if (nextProvider !== "volcengine") {
      slotRequestRef.current += 1;
      setSlotsLoading(false);
    }
    setProvider(nextProvider);
    const first = cloneModels.find((item) => item.provider === nextProvider);
    if (first) setModelId(first.model_id);
  };
  const resetSlots = () => {
    setSpeakerId("");
    setVoiceSlots([]);
    setSlotMessage("");
  };
  const acceptedExtensions = isVolcengineClone
    ? [".wav", ".mp3", ".ogg", ".m4a", ".aac", ".pcm"]
    : [".wav", ".mp3", ".m4a"];
  const acceptAudioFile = (file: File | undefined) => {
    if (!file) return;
    const extension = file.name.includes(".")
      ? file.name.slice(file.name.lastIndexOf(".")).toLowerCase()
      : "";
    if (!file.type.startsWith("audio/") && !acceptedExtensions.includes(extension)) {
      onNotice("请选择 WAV、MP3、M4A 等支持的音频文件");
      return;
    }
    if (fileUrlRef.current) URL.revokeObjectURL(fileUrlRef.current);
    fileUrlRef.current = URL.createObjectURL(file);
    setFileUrl(fileUrlRef.current);
    setSelectedFile(file);
    setFileName(file.name);
    onNotice("");
  };
  const stopDragEvent = (event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    event.stopPropagation();
  };
  const handleDrop = (event: React.DragEvent<HTMLLabelElement>) => {
    stopDragEvent(event);
    setIsDragging(false);
    acceptAudioFile(event.dataTransfer.files?.[0]);
  };
  const submit = async () => {
    const normalizedSpeakerId = speakerId.trim();
    if (isVolcengineClone && !providerAccountId) {
      onNotice("请先选择火山引擎项目");
      return;
    }
    if (isVolcengineClone && !/^S_.+/.test(normalizedSpeakerId)) {
      onNotice("请填写火山控制台中 S_ 开头的音色槽位 ID");
      return;
    }
    if (
      !selected ||
      !displayName.trim() ||
      !publicName.trim() ||
      !selectedFile
    )
      return;
    setWorking(true);
    try {
      await onClone({
        provider,
        model_id: modelId,
        display_name: displayName.trim(),
        public_name: publicName.trim(),
        speaker_id: isVolcengineClone ? normalizedSpeakerId : undefined,
        provider_account_id: isVolcengineClone ? providerAccountId : undefined,
        provider_project_name: isVolcengineClone ? providerProjectName : undefined,
        clone_language: isVolcengineClone ? cloneLanguage : undefined,
      }, selectedFile);
    } finally {
      setWorking(false);
    }
  };

  const fileHint = isQwenClone
    ? "WAV 16-bit / MP3 / M4A · 推荐 10–20 秒 · 不超过 10 MB"
    : isVolcengineClone
      ? "推荐 14–30 秒单人人声 WAV · 无音乐与噪声 · 不超过 10 MB"
      : isMiniMaxClone
        ? "WAV / MP3 / M4A · 10 秒至 5 分钟 · 不超过 20 MB"
        : "WAV / MP3 / M4A · 建议 10–30 秒 · 不超过 20 MB";
  const footnote = isQwenClone
    ? "创建时会上传样本并取得远端 Voice ID；后续合成只发送 Voice ID。"
    : isVolcengineClone
      ? "空槽位按所选火山项目读取；创建后的音色会继续绑定该项目。"
      : isMiniMaxClone
        ? "创建时上传样本并取得远端 Voice ID；7 天内未正式使用的音色可能被厂商删除。"
        : "该模型会在每次生成语音时向厂商发送本地参考音频。";
  const canSubmit =
    !working &&
    Boolean(selected) &&
    Boolean(selectedFile) &&
    Boolean(displayName.trim()) &&
    Boolean(publicName.trim()) &&
    !(isVolcengineClone && (!providerAccountId || !/^S_.+/.test(speakerId.trim())));

  return (
    <section>
      <PageHeader
        title="语音克隆"
        description="上传一段参考音频，选择目标厂商和模型，创建可在语音合成中复用的声音。"
      />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(340px,400px)]">
        <div className="flex min-w-0 flex-col gap-6">
          <label
            className={cn(
              "group flex min-h-72 cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed bg-card/70 px-6 py-12 text-center transition-all duration-200 focus-within:ring-[3px] focus-within:ring-ring/50 md:min-h-96",
              isDragging
                ? "scale-[1.01] border-brand bg-accent/70 shadow-float"
                : "border-brand/25 hover:border-brand/50 hover:bg-card",
            )}
            onDragEnter={(event) => {
              stopDragEvent(event);
              setIsDragging(true);
            }}
            onDragOver={(event) => {
              stopDragEvent(event);
              event.dataTransfer.dropEffect = "copy";
              setIsDragging(true);
            }}
            onDragLeave={(event) => {
              stopDragEvent(event);
              setIsDragging(false);
            }}
            onDrop={handleDrop}
          >
            <input
              type="file"
              className="sr-only"
              accept={
                isVolcengineClone
                  ? ".wav,.mp3,.ogg,.m4a,.aac,.pcm,audio/*"
                  : ".wav,.mp3,.m4a,audio/wav,audio/mpeg,audio/mp4"
              }
              onChange={(event) => acceptAudioFile(event.target.files?.[0])}
            />
            <span
              className={cn(
                "grid size-16 place-items-center rounded-2xl bg-accent text-brand transition-transform duration-200",
                isDragging ? "scale-110" : "group-hover:-translate-y-0.5",
              )}
            >
              <FileAudio className="size-7" />
            </span>
            <strong className="max-w-full truncate text-base font-semibold text-foreground md:text-lg">
              {isDragging ? "松开即可上传" : fileName || "拖入参考音频，或点击选择"}
            </strong>
            <span className="text-sm text-muted-foreground">{fileHint}</span>
            <span className="mt-2 inline-flex h-9 items-center gap-2 rounded-full border bg-card px-4 text-sm font-medium text-foreground shadow-xs transition-colors group-hover:border-brand/40 group-hover:text-brand">
              <Upload className="size-4" />
              {fileName ? "重新选择" : "选择文件"}
            </span>
          </label>

          {selectedFile && fileUrl && (
            <div className="island flex flex-col gap-3 p-5 md:px-6">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="m-0 text-sm font-semibold text-foreground">试听参考音频</h2>
                <span className="font-mono text-xs text-muted-foreground tabular-nums">
                  {formatFileSize(selectedFile.size)}
                </span>
              </div>
              {/* key 保证更换文件后重新解码波形。 */}
              <AudioPreview key={fileUrl} src={fileUrl} label={`参考音频 ${fileName}`} />
            </div>
          )}
        </div>

        <aside aria-labelledby="clone-settings-title" className="island flex flex-col gap-5 p-6 md:p-7">
          <h2 id="clone-settings-title" className="m-0 flex items-center gap-2 text-base font-semibold text-foreground">
            <Mic2 className="size-4 text-brand" />
            克隆设置
          </h2>

          <Field label="目标厂商" htmlFor="clone-provider">
            <Select value={provider} onValueChange={chooseProvider}>
              <SelectTrigger id="clone-provider" className="w-full">
                <SelectValue placeholder="选择厂商" />
              </SelectTrigger>
              <SelectContent position="popper">
                {cloneProviderIds.map((id) => (
                  <SelectItem value={id} key={id}>
                    <ProviderMark provider={id} className="size-5 rounded-[6px] text-[10px]" />
                    {providerMeta[id].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="目标模型" htmlFor="clone-model">
            <Select value={modelId} onValueChange={setModelId}>
              <SelectTrigger id="clone-model" translate="no" className="w-full">
                <SelectValue placeholder="选择模型" />
              </SelectTrigger>
              <SelectContent position="popper">
                {providerModels.map((item) => (
                  <SelectItem value={item.model_id} key={item.gateway_id}>
                    {item.display_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          {isVolcengineClone && (
            <fieldset className="m-0 flex min-w-0 flex-col gap-4 rounded-lg border bg-muted/40 p-4">
              <legend className="sr-only">火山引擎设置</legend>
              <div aria-hidden className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
                <ProviderMark provider="volcengine" className="size-5 rounded-[6px] text-[10px]" />
                火山引擎设置
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
                <Field label="火山账号" htmlFor="clone-account">
                  <Select
                    value={providerAccountId}
                    onValueChange={(value) => {
                      slotRequestRef.current += 1;
                      setProviderAccountId(value);
                      setSlotsLoading(false);
                      resetSlots();
                    }}
                    disabled={!volcengineAccounts.length}
                  >
                    <SelectTrigger id="clone-account" className="w-full bg-card">
                      <SelectValue placeholder="尚未配置项目" />
                    </SelectTrigger>
                    <SelectContent position="popper">
                      {volcengineAccounts.map((account) => (
                        <SelectItem value={account.id} key={account.id}>
                          {account.display_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                <Field label="火山项目" htmlFor="clone-project">
                  <Select
                    value={providerProjectName}
                    onValueChange={(value) => {
                      setProviderProjectName(value);
                      resetSlots();
                    }}
                    disabled={!volcengineProjects.length}
                  >
                    <SelectTrigger id="clone-project" className="w-full bg-card">
                      <SelectValue placeholder="请先同步项目" />
                    </SelectTrigger>
                    <SelectContent position="popper">
                      {volcengineProjects.map((project) => (
                        <SelectItem value={project.project_name} key={project.id}>
                          {project.display_name || project.project_name}
                          {project.display_name !== project.project_name ? ` · ${project.project_name}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              <Field label="参考音频语言" htmlFor="clone-language">
                <Select value={String(cloneLanguage)} onValueChange={(value) => setCloneLanguage(Number(value))}>
                  <SelectTrigger id="clone-language" className="w-full bg-card">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    {cloneLanguages.map((item) => (
                      <SelectItem value={String(item.value)} key={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field
                label="音色槽位"
                htmlFor="clone-speaker-id"
                aside={
                  <Button
                    type="button"
                    variant="link"
                    size="xs"
                    className="h-auto px-0"
                    onClick={() => {
                      const nextMode = slotMode === "auto" ? "manual" : "auto";
                      slotRequestRef.current += 1;
                      setSlotMode(nextMode);
                      setSlotsLoading(false);
                      resetSlots();
                    }}
                  >
                    {slotMode === "auto" ? "手动填写" : "自动查询"}
                  </Button>
                }
                hint={slotMessage ? <span aria-live="polite">{slotMessage}</span> : undefined}
              >
                {slotMode === "auto" ? (
                  <div className="flex gap-2">
                    <Select
                      value={speakerId}
                      onValueChange={setSpeakerId}
                      disabled={slotsLoading || !providerAccountId || !voiceSlots.length}
                    >
                      <SelectTrigger id="clone-speaker-id" translate="no" className="w-full min-w-0 flex-1 bg-card font-mono">
                        <SelectValue placeholder={slotsLoading ? "正在查询空槽位..." : "没有可选择的空槽位"} />
                      </SelectTrigger>
                      <SelectContent position="popper">
                        {voiceSlots.map((slot) => (
                          <SelectItem value={slot.speaker_id} key={slot.speaker_id} className="font-mono">
                            {slot.alias ? `${slot.alias} · ` : ""}{slot.speaker_id}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="shrink-0 bg-card"
                      onClick={() => void loadVoiceSlots(providerAccountId)}
                      disabled={slotsLoading || !providerAccountId}
                      title="刷新空槽位"
                      aria-label="刷新空槽位"
                    >
                      <RefreshCw className={cn(slotsLoading && "animate-spin")} />
                    </Button>
                  </div>
                ) : (
                  <Input
                    id="clone-speaker-id"
                    value={speakerId}
                    onChange={(event) => setSpeakerId(event.target.value)}
                    placeholder="S_..."
                    autoComplete="off"
                    className="bg-card font-mono"
                  />
                )}
              </Field>
            </fieldset>
          )}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <Field label="显示名称" htmlFor="clone-display-name">
              <Input
                id="clone-display-name"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
              />
            </Field>
            <Field label="兼容别名" htmlFor="clone-public-name">
              <Input
                id="clone-public-name"
                value={publicName}
                onChange={(event) => setPublicName(event.target.value)}
                className="font-mono"
              />
            </Field>
          </div>

          <Note icon={<Radio />}>{footnote}</Note>

          <Button size="lg" className="w-full" onClick={() => void submit()} disabled={!canSubmit}>
            <Mic2 />
            {working ? "处理中..." : "创建参考音色"}
          </Button>
        </aside>
      </div>
    </section>
  );
}
