import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
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

export function StudioProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState("synthesize");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() =>
    window.localStorage.getItem("voice-studio.sidebar-collapsed") === "true",
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
  const [notice, setNotice] = useState("");
  const [updateUrl, setUpdateUrl] = useState("");
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateInstallable, setUpdateInstallable] = useState(false);
  const [updateInstalling, setUpdateInstalling] = useState(false);
  const [gateway, setGateway] = useState<Gateway | null>(null);
  const synthesisAbortRef = useRef<AbortController | null>(null);
  const synthesisRequestRef = useRef(0);
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
      "voice-studio.sidebar-collapsed",
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
      api<{ available: boolean; latest_version: string; release_url: string; can_install: boolean }>("/api/update/check"),
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
        setUpdateUrl(updateResult.value.release_url);
        setUpdateAvailable(true);
        setUpdateInstallable(updateResult.value.can_install);
        setNotice(`发现 VoxNest ${updateResult.value.latest_version}，可在 GitHub Release 页面下载安装包。`);
      }
      if (failures.length) {
        setNotice(`部分数据加载失败：${failures.join("、")}。请确认后端已启动。`);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    const timer = window.setInterval(() => {
      void api<{ available: boolean; latest_version: string; release_url: string; can_install: boolean }>("/api/update/check")
        .then((result) => {
          if (!result.available) return;
          setUpdateUrl(result.release_url);
          setUpdateAvailable(true);
          setUpdateInstallable(result.can_install);
          setNotice(`发现 VoxNest ${result.latest_version}，可在 GitHub Release 页面下载安装包。`);
        })
        .catch(() => undefined);
    }, 6 * 60 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);
  const installUpdate = async () => {
    if (!updateInstallable || updateInstalling) return;
    if (!window.confirm("VoxNest 将下载更新、关闭当前程序并自动重启。是否继续？")) return;
    setUpdateInstalling(true);
    setNotice("正在下载并校验更新，完成后将自动重启…");
    try {
      await api<{ status: string }>("/api/update/install", { method: "POST" });
    } catch (error) {
      setUpdateInstalling(false);
      setNotice(error instanceof Error ? error.message : "启动更新失败");
    }
  };
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
    setNotice(
      selectedModel?.mode === "provider"
        ? "正在调用厂商接口生成音频..."
        : "正在生成演示音频...",
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
      setNotice("已生成，可试听或下载");
      await refreshJobs();
    } catch (error) {
      if (controller.signal.aborted || requestId !== synthesisRequestRef.current) return;
      setNotice(error instanceof Error ? error.message : "生成失败");
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
    setNotice(created.message);
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
    setNotice(created.message);
  };
  const removeVoice = async (item: Voice) => {
    if (
      !window.confirm(
        `从 VoxNest 移除“${item.display_name}”？\n\n这不会删除厂商控制台里的远端音色；本地参考音频（如有）也会一并删除。`,
      )
    )
      return;
    try {
      const result = await api<{ message: string }>("/api/voices/" + item.id, {
        method: "DELETE",
      });
      setVoices((current) =>
        current.filter((voiceItem) => voiceItem.id !== item.id),
      );
      if (voice === item.public_name) setVoice("");
      setNotice(result.message);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "删除失败");
    }
  };
  const renameVoice = async (item: Voice, displayName: string) => {
    const result = await api<{ voice: Voice; message: string }>("/api/voices/" + item.id, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ display_name: displayName }),
    });
    setVoices((current) => current.map((voiceItem) => voiceItem.id === item.id ? result.voice : voiceItem));
    setNotice(result.message);
  };
  const cloneVoice = async (config: CloneConfig, file: File) => {
    if (!file) return setNotice("请选择一段参考音频");
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
      setNotice(created.message);
      setActive("synthesize");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "克隆失败");
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
    setNotice(created.message);
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
      setNotice(`没有找到与“${item.display_name}”兼容的语音合成模型`);
      return;
    }
    setModel(compatibleModel.gateway_id);
    setVoice(item.public_name);
    setNotice(`已选择音色“${item.display_name}”`);
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

