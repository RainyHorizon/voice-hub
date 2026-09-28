import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { useConfirm } from "@/components/feedback/ConfirmProvider";
import { api, responseError } from "../api";
import type {
  CloneConfig,
  DesignConfig,
  Gateway,
  ImportVoiceConfig,
  Job,
  Model,
  Voice,
} from "../types";
import { sample, voiceMatchesModel } from "../utils";

type StudioContextValue = {
  active: string;
  setActive: (value: string) => void;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (value: boolean | ((current: boolean) => boolean)) => void;
  voices: Voice[];
  models: Model[];
  jobs: Job[];
  gateway: Gateway | null;
  text: string;
  setText: (value: string) => void;
  model: string;
  setModel: (value: string) => void;
  voice: string;
  setVoice: (value: string) => void;
  speed: number;
  setSpeed: (value: number) => void;
  format: string;
  setFormat: (value: string) => void;
  instructions: string;
  setInstructions: (value: string) => void;
  audioUrl: string;
  busy: boolean;
  notice: string;
  setNotice: (value: string) => void;
  updateUrl: string;
  updateAvailable: boolean;
  updateInstallable: boolean;
  updateInstalling: boolean;
  installUpdate: () => Promise<void>;
  selectedModel?: Model;
  selectedVoice?: Voice;
  refreshJobs: () => Promise<void>;
  synthesize: () => Promise<void>;
  importVoice: (config: ImportVoiceConfig) => Promise<void>;
  importVoices: (configs: ImportVoiceConfig[]) => Promise<void>;
  removeVoice: (item: Voice) => Promise<void>;
  renameVoice: (item: Voice, displayName: string) => Promise<void>;
  cloneVoice: (config: CloneConfig, file: File) => Promise<void>;
  designVoice: (config: DesignConfig) => Promise<Voice>;
  useVoice: (item: Voice) => void;
};

const StudioContext = createContext<StudioContextValue | null>(null);

type NoticeTone = "info" | "success" | "error" | "loading";

type UpdateInfo = { available: boolean; latest_version: string; release_url: string; can_install: boolean };

export function StudioProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState("synthesize");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() =>
    window.localStorage.getItem("voice-hub.sidebar-collapsed") === "true",
  );
  const [voices, setVoices] = useState<Voice[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [text, setText] = useState(sample);
  const [model, setModel] = useState("");
  const [voice, setVoice] = useState("");
  const [speed, setSpeed] = useState(1);
  const [format, setFormat] = useState("wav");
  const [instructions, setInstructions] = useState("");
  const [audioUrl, setAudioUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNoticeText] = useState("");
  const [updateUrl, setUpdateUrl] = useState("");
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateInstallable, setUpdateInstallable] = useState(false);
  const [updateInstalling, setUpdateInstalling] = useState(false);
  const [gateway, setGateway] = useState<Gateway | null>(null);
  const synthesisAbortRef = useRef<AbortController | null>(null);
  const synthesisRequestRef = useRef(0);
  const installUpdateRef = useRef<() => Promise<void>>(async () => undefined);
  const confirm = useConfirm();
  // 提示统一走 toast；notice 字段保留最近一条文本，维持对外接口兼容。
  const notify = (message: string, tone: NoticeTone = "info", id?: string) => {
    setNoticeText(message);
    if (!message) {
      if (id) toast.dismiss(id);
      return;
    }
    const options = id ? { id } : undefined;
    if (tone === "success") toast.success(message, options);
    else if (tone === "error") toast.error(message, options);
    else if (tone === "loading") toast.loading(message, options);
    else toast(message, options);
  };
  const setNotice = (value: string) => notify(value);
  const errorMessage = (error: unknown, fallback: string) =>
    error instanceof Error ? error.message : fallback;
  const announceUpdate = (update: UpdateInfo) => {
    setUpdateUrl(update.release_url);
    setUpdateAvailable(true);
    setUpdateInstallable(update.can_install);
    setNoticeText(`发现 Voice Hub ${update.latest_version}`);
    const openRelease = () => window.open(update.release_url, "_blank", "noopener,noreferrer");
    toast.info(`发现 Voice Hub ${update.latest_version}`, {
      id: "voice-hub-update",
      duration: Infinity,
      description: update.can_install
        ? "可以立即更新，程序会自动下载、校验并重启。"
        : "可在 GitHub Release 页面下载安装包。",
      action: update.can_install
        ? { label: "立即更新", onClick: () => void installUpdateRef.current() }
        : { label: "打开 Release", onClick: openRelease },
      cancel: update.can_install
        ? { label: "打开 Release", onClick: openRelease }
        : undefined,
    });
  };
  const selectedModel = useMemo(
    () => models.find((item) => item.gateway_id === model),
    [models, model],
  );
  const selectedVoice = useMemo(
    () => voices.find((item) => item.public_name === voice),
    [voices, voice],
  );
  useEffect(() => {
    window.localStorage.setItem(
      "voice-hub.sidebar-collapsed",
      String(sidebarCollapsed),
    );
  }, [sidebarCollapsed]);
  useEffect(() => {
    let cancelled = false;
    void Promise.allSettled([
      api<Voice[]>("/api/voices"),
      api<Model[]>("/api/models"),
      api<Job[]>("/api/jobs?limit=500"),
      api<Gateway>("/api/gateway?reveal=true"),
      api<UpdateInfo>("/api/update/check"),
    ]).then(([voicesResult, modelsResult, jobsResult, gatewayResult, updateResult]) => {
      if (cancelled) return;
      const failures: string[] = [];
      if (voicesResult.status === "fulfilled") {
        const availableVoices = voicesResult.value;
        setVoices(availableVoices);
        setVoice((current) =>
          availableVoices.some((item) => item.public_name === current) ? current : "",
        );
      } else {
        failures.push("音色库");
      }
      if (modelsResult.status === "fulfilled") {
        const availableModels = modelsResult.value;
        setModels(availableModels);
        setModel((current) =>
          availableModels.some((item) => item.gateway_id === current)
            ? current
            : availableModels.find((item) => item.operations.includes("synthesis"))?.gateway_id || "",
        );
      } else {
        failures.push("模型列表");
      }
      if (jobsResult.status === "fulfilled") setJobs(jobsResult.value);
      else failures.push("任务历史");
      if (gatewayResult.status === "fulfilled") setGateway(gatewayResult.value);
      else failures.push("网关配置");
      if (updateResult.status === "fulfilled" && updateResult.value.available) {
        announceUpdate(updateResult.value);
      }
      if (failures.length) {
        notify(`部分数据加载失败：${failures.join("、")}。请确认后端已启动。`, "error");
      }
    });
    return () => {
      cancelled = true;
    };
    // 仅在首次挂载时加载初始数据。
  }, []);
  useEffect(() => {
    const timer = window.setInterval(() => {
      void api<UpdateInfo>("/api/update/check")
        .then((result) => {
          if (result.available) announceUpdate(result);
        })
        .catch(() => undefined);
    }, 6 * 60 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);
  const installUpdate = async () => {
    if (!updateInstallable || updateInstalling) return;
    const accepted = await confirm({
      title: "安装 Voice Hub 更新？",
      description: "Voice Hub 将下载更新、关闭当前程序并自动重启。",
      confirmLabel: "立即更新",
    });
    if (!accepted) return;
    setUpdateInstalling(true);
    notify("正在下载并校验更新，完成后将自动重启…", "loading", "voice-hub-update");
    try {
      await api<{ status: string }>("/api/update/install", { method: "POST" });
    } catch (error) {
      setUpdateInstalling(false);
      notify(errorMessage(error, "启动更新失败"), "error", "voice-hub-update");
    }
  };
  installUpdateRef.current = installUpdate;
  useEffect(
    () => () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    },
    [audioUrl],
  );
  useEffect(() => () => synthesisAbortRef.current?.abort(), []);
  useEffect(() => {
    const firstCompatible = voices.find((item) =>
      voiceMatchesModel(item, selectedModel),
    );
    if (firstCompatible && !voiceMatchesModel(selectedVoice, selectedModel))
      setVoice(firstCompatible.public_name);
  }, [selectedModel, selectedVoice, voices]);
  const refreshJobs = () =>
    api<Job[]>("/api/jobs?limit=500")
      .then(setJobs)
      .catch(() => undefined);
  const synthesize = async () => {
    if (!text.trim()) return setNotice("请先输入要合成的文本");
    if (text.length > 10000) return setNotice("合成文本不能超过 10,000 个字符");
    if (!selectedModel) return setNotice("请先选择合成模型");
    if (!selectedVoice || !voiceMatchesModel(selectedVoice, selectedModel))
      return setNotice("请先选择与当前模型兼容的音色");
    synthesisAbortRef.current?.abort();
    const controller = new AbortController();
    synthesisAbortRef.current = controller;
    const requestId = ++synthesisRequestRef.current;
    setBusy(true);
    notify(
      selectedModel?.mode === "provider"
        ? "正在调用厂商接口生成音频…"
        : "正在生成演示音频…",
      "loading",
      "synthesis",
    );
    try {
      const response = await fetch("/v1/audio/speech", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + (gateway?.key || "vs_demo_local_key"),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          voice,
          input: text,
          response_format: format,
          speed,
          instructions:
            selectedModel?.model_id === "qwen3-tts-instruct-flash" ||
            selectedModel?.model_id === "seed-tts-2.0"
              ? instructions || undefined
              : undefined,
        }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(await responseError(response));
      const blob = await response.blob();
      if (controller.signal.aborted || requestId !== synthesisRequestRef.current) return;
      const nextAudioUrl = URL.createObjectURL(blob);
      if (controller.signal.aborted || requestId !== synthesisRequestRef.current) {
        URL.revokeObjectURL(nextAudioUrl);
        return;
      }
      setAudioUrl(nextAudioUrl);
      notify("已生成，可试听或下载", "success", "synthesis");
      await refreshJobs();
    } catch (error) {
      if (controller.signal.aborted || requestId !== synthesisRequestRef.current) return;
      notify(errorMessage(error, "生成失败"), "error", "synthesis");
    } finally {
      if (requestId === synthesisRequestRef.current) {
        setBusy(false);
        if (synthesisAbortRef.current === controller) synthesisAbortRef.current = null;
      }
    }
  };
  const importVoice = async (config: ImportVoiceConfig) => {
    const created = await api<{ voice: Voice; message: string }>(
      "/api/voices/import",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      },
    );
    setVoices((current) => [created.voice, ...current]);
    notify(created.message, "success");
  };
  const importVoices = async (configs: ImportVoiceConfig[]) => {
    const created = await api<{ voices: Voice[]; message: string }>(
      "/api/voices/import/batch",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voices: configs }),
      },
    );
    setVoices((current) => [...created.voices, ...current]);
    notify(created.message, "success");
  };
  const removeVoice = async (item: Voice) => {
    const accepted = await confirm({
      title: `从 Voice Hub 移除“${item.display_name}”？`,
      description: "这不会删除厂商控制台里的远端音色；本地参考音频（如有）也会一并删除。",
      confirmLabel: "移除",
      destructive: true,
    });
    if (!accepted) return;
    try {
      const result = await api<{ message: string }>("/api/voices/" + item.id, {
        method: "DELETE",
      });
      setVoices((current) =>
        current.filter((voiceItem) => voiceItem.id !== item.id),
      );
      if (voice === item.public_name) setVoice("");
      notify(result.message, "success");
    } catch (error) {
      notify(errorMessage(error, "删除失败"), "error");
    }
  };
  const renameVoice = async (item: Voice, displayName: string) => {
    const result = await api<{ voice: Voice; message: string }>("/api/voices/" + item.id, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ display_name: displayName }),
    });
    setVoices((current) => current.map((voiceItem) => voiceItem.id === item.id ? result.voice : voiceItem));
    notify(result.message, "success");
  };
  const cloneVoice = async (config: CloneConfig, file: File) => {
    if (!file) return notify("请选择一段参考音频", "error");
    const query = new URLSearchParams({
      provider_name: config.provider,
      model_id: config.model_id,
      display_name: config.display_name,
      public_name: config.public_name,
    });
    if (config.speaker_id) query.set("speaker_id", config.speaker_id);
    if (config.provider_account_id)
      query.set("provider_account_id", config.provider_account_id);
    if (config.provider_project_name)
      query.set("provider_project_name", config.provider_project_name);
    if (config.clone_language !== undefined)
      query.set("clone_language", String(config.clone_language));
    const form = new FormData();
    form.append("audio", file);
    try {
      const created = await api<{ voice: Voice; message: string }>(
        "/api/voices/clone?" + query.toString(),
        { method: "POST", body: form },
      );
      setVoices((current) => [created.voice, ...current]);
      setModel(created.voice.provider + "/" + created.voice.model_id);
      setVoice(created.voice.public_name);
      notify(created.message, "success");
      setActive("synthesize");
    } catch (error) {
      notify(errorMessage(error, "克隆失败"), "error");
    }
  };
  const designVoice = async (config: DesignConfig) => {
    const created = await api<{ voice: Voice; message: string }>("/api/voices/design", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });
    setVoices((current) => [created.voice, ...current]);
    const compatibleModel = models.find(
      (item) =>
        item.provider === created.voice.provider &&
        item.operations.includes("synthesis") &&
        (item.provider === "minimax" || item.model_id === created.voice.model_id),
    );
    if (compatibleModel) setModel(compatibleModel.gateway_id);
    setVoice(created.voice.public_name);
    notify(created.message, "success");
    return created.voice;
  };
  const useVoice = (item: Voice) => {
    const compatibleModel = models.find(
      (modelItem) =>
        modelItem.operations.includes("synthesis") &&
        modelItem.provider === item.provider &&
        (modelItem.mode === "demo" ||
          modelItem.provider === "minimax" ||
          modelItem.model_id === item.model_id),
    );
    if (!compatibleModel) {
      notify(`没有找到与“${item.display_name}”兼容的语音合成模型`, "error");
      return;
    }
    setModel(compatibleModel.gateway_id);
    setVoice(item.public_name);
    notify(`已选择音色“${item.display_name}”`, "success");
    setActive("synthesize");
  };

  const value: StudioContextValue = {
    active,
    setActive,
    sidebarCollapsed,
    setSidebarCollapsed,
    voices,
    models,
    jobs,
    gateway,
    text,
    setText,
    model,
    setModel,
    voice,
    setVoice,
    speed,
    setSpeed,
    format,
    setFormat,
    instructions,
    setInstructions,
    audioUrl,
    busy,
    notice,
    updateUrl,
    updateAvailable,
    updateInstallable,
    updateInstalling,
    installUpdate,
    setNotice,
    selectedModel,
    selectedVoice,
    refreshJobs,
    synthesize,
    importVoice,
    importVoices,
    removeVoice,
    renameVoice,
    cloneVoice,
    designVoice,
    useVoice,
  };
  return (
    <StudioContext.Provider value={value}>{children}</StudioContext.Provider>
  );
}

export function useStudio() {
  const context = useContext(StudioContext);
  if (!context) throw new Error("useStudio 必须在 <StudioProvider> 内使用");
  return context;
}

