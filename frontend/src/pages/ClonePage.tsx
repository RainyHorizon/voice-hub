import { useEffect, useMemo, useRef, useState } from "react";
import {
  FileAudio,
  Mic2,
  Radio,
  RefreshCw,
  Upload,
} from "lucide-react";
import { api } from "../api";
import { WorkspaceHero } from "../components/WorkspaceHero";
import { useStudio } from "../context/StudioContext";
import type { ProviderAccount, ProviderProject, VolcengineSlot } from "../types";
import { credentialProviderIds, providerMeta } from "../utils";

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

  useEffect(() => {
    if (selected) return;
    const first = providerModels[0] || cloneModels[0];
    if (first) {
      setProvider(first.provider);
      setModelId(first.model_id);
    }
  }, [cloneModels, providerModels, selected]);

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
    setSelectedFile(file);
    setFileName(file.name);
    onNotice("");
  };
  const handleDrop = (event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    event.stopPropagation();
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

  return (
    <section className="page-section clone-page">
      <WorkspaceHero
        title="让一个真实的声音"
        accent="留下它的纹理。"
        description="上传参考音频，选择目标厂商和模型，创建一个可以在语音合成中复用的声音。"
      />
      <div className="clone-form">
        <div className="clone-workspace-grid">
          <label
            className={`upload-zone${isDragging ? " is-dragging" : ""}`}
            onDragEnter={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setIsDragging(true);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              event.stopPropagation();
              event.dataTransfer.dropEffect = "copy";
              setIsDragging(true);
            }}
            onDragLeave={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setIsDragging(false);
            }}
            onDrop={handleDrop}
          >
            <input
              type="file"
              accept={
                isVolcengineClone
                  ? ".wav,.mp3,.ogg,.m4a,.aac,.pcm,audio/*"
                  : ".wav,.mp3,.m4a,audio/wav,audio/mpeg,audio/mp4"
              }
              onChange={(event) => acceptAudioFile(event.target.files?.[0])}
            />
            <FileAudio size={25} />
            <strong>{fileName || "拖入参考音频，或点击选择"}</strong>
            <span>
              {isQwenClone
                ? "WAV 16-bit / MP3 / M4A · 推荐 10–20 秒 · 不超过 10 MB"
                : isVolcengineClone
                  ? "推荐 14–30 秒单人人声 WAV · 无音乐与噪声 · 不超过 10 MB"
                  : isMiniMaxClone
                    ? "WAV / MP3 / M4A · 10 秒至 5 分钟 · 不超过 20 MB"
                    : "WAV / MP3 / M4A · 建议 10–30 秒 · 不超过 20 MB"}
            </span>
            <span className="upload-link">
              <Upload size={14} />
              {fileName ? "重新选择" : "选择文件"}
            </span>
          </label>
          <div className="clone-settings-panel">
            <div className="clone-settings-fields">
              <div className="clone-field">
                <label htmlFor="clone-provider">目标厂商</label>
                <select
                  id="clone-provider"
                  value={provider}
                  onChange={(event) => chooseProvider(event.target.value)}
                >
                  {credentialProviderIds
                    .filter((id) =>
                      cloneModels.some((item) => item.provider === id),
                    )
                    .map((id) => (
                      <option value={id} key={id}>
                        {providerMeta[id].label}
                      </option>
                    ))}
                </select>
              </div>
              <div className="clone-field">
                <label htmlFor="clone-model">目标模型</label>
                <select
                  id="clone-model"
                  translate="no"
                  value={modelId}
                  onChange={(event) => setModelId(event.target.value)}
                >
                  {providerModels.map((item) => (
                    <option value={item.model_id} key={item.gateway_id}>
                      {item.display_name}
                    </option>
                  ))}
                </select>
              </div>
              {isVolcengineClone && (
                <>
                  <div className="clone-field">
                    <label htmlFor="clone-account">火山账号</label>
                    <select
                      id="clone-account"
                      value={providerAccountId}
                      onChange={(event) => {
                        slotRequestRef.current += 1;
                        setProviderAccountId(event.target.value);
                        setSlotsLoading(false);
                        setSpeakerId("");
                        setVoiceSlots([]);
                        setSlotMessage("");
                      }}
                      disabled={!volcengineAccounts.length}
                    >
                      {!volcengineAccounts.length && <option value="">尚未配置项目</option>}
                      {volcengineAccounts.map((account) => (
                        <option value={account.id} key={account.id}>
                          {account.display_name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="clone-field">
                    <label htmlFor="clone-project">火山项目</label>
                    <select
                      id="clone-project"
                      value={providerProjectName}
                      onChange={(event) => {
                        setProviderProjectName(event.target.value);
                        setSpeakerId("");
                        setVoiceSlots([]);
                        setSlotMessage("");
                      }}
                      disabled={!volcengineProjects.length}
                    >
                      {!volcengineProjects.length && <option value="">请先同步项目</option>}
                      {volcengineProjects.map((project) => (
                        <option value={project.project_name} key={project.id}>
                          {project.display_name || project.project_name}
                          {project.display_name !== project.project_name ? ` · ${project.project_name}` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="clone-field">
                    <label htmlFor="clone-language">参考音频语言</label>
                    <select
                      id="clone-language"
                      value={cloneLanguage}
                      onChange={(event) => setCloneLanguage(Number(event.target.value))}
                    >
                      <option value={0}>中文</option>
                      <option value={1}>英语</option>
                      <option value={2}>日语</option>
                      <option value={3}>西班牙语</option>
                      <option value={4}>印尼语</option>
                      <option value={5}>葡萄牙语</option>
                      <option value={8}>韩语</option>
                    </select>
                  </div>
                  <div className="clone-field">
                    <div className="clone-field-label">
                      <label htmlFor="clone-speaker-id">音色槽位</label>
                      <button
                        type="button"
                        onClick={() => {
                          const nextMode = slotMode === "auto" ? "manual" : "auto";
                          slotRequestRef.current += 1;
                          setSlotMode(nextMode);
                          setSlotsLoading(false);
                          setSpeakerId("");
                          setVoiceSlots([]);
                          setSlotMessage("");
                        }}
                      >
                        {slotMode === "auto" ? "手动填写" : "自动查询"}
                      </button>
                    </div>
                    {slotMode === "auto" ? (
                      <div className="clone-slot-row">
                        <select
                          id="clone-speaker-id"
                          value={speakerId}
                          onChange={(event) => setSpeakerId(event.target.value)}
                          disabled={slotsLoading || !providerAccountId || !voiceSlots.length}
                        >
                          {!voiceSlots.length && (
                            <option value="">
                              {slotsLoading ? "正在查询空槽位..." : "没有可选择的空槽位"}
                            </option>
                          )}
                          {voiceSlots.map((slot) => (
                            <option value={slot.speaker_id} key={slot.speaker_id}>
                              {slot.alias ? `${slot.alias} · ` : ""}{slot.speaker_id}
                            </option>
                          ))}
                        </select>
                        <button
                          className="icon-button clone-slot-refresh"
                          type="button"
                          onClick={() => void loadVoiceSlots(providerAccountId)}
                          disabled={slotsLoading || !providerAccountId}
                          title="刷新空槽位"
                          aria-label="刷新空槽位"
                        >
                          <RefreshCw size={18} className={slotsLoading ? "spinning" : ""} />
                        </button>
                      </div>
                    ) : (
                      <input
                        id="clone-speaker-id"
                        value={speakerId}
                        onChange={(event) => setSpeakerId(event.target.value)}
                        placeholder="S_..."
                        autoComplete="off"
                      />
                    )}
                    {slotMessage && <small className="clone-field-message">{slotMessage}</small>}
                  </div>
                </>
              )}
              <div className="clone-field">
                <label htmlFor="clone-display-name">显示名称</label>
                <input
                  id="clone-display-name"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                />
              </div>
              <div className="clone-field">
                <label htmlFor="clone-public-name">兼容别名</label>
                <input
                  id="clone-public-name"
                  value={publicName}
                  onChange={(event) => setPublicName(event.target.value)}
                />
              </div>
            </div>
            <button
              className="primary-button full"
              onClick={submit}
              disabled={
                working ||
                !selected ||
                !selectedFile ||
                !displayName.trim() ||
                !publicName.trim() ||
                (isVolcengineClone &&
                  (!providerAccountId || !/^S_.+/.test(speakerId.trim())))
              }
            >
              <Mic2 size={17} />
              {working ? "处理中..." : "创建参考音色"}
            </button>
            <p className="form-footnote">
              <Radio size={14} />
              {isQwenClone
                ? "创建时会上传样本并取得远端 Voice ID；后续合成只发送 Voice ID。"
                : isVolcengineClone
                  ? "空槽位按所选火山项目读取；创建后的音色会继续绑定该项目。"
                  : isMiniMaxClone
                    ? "创建时上传样本并取得远端 Voice ID；7 天内未正式使用的音色可能被厂商删除。"
                    : "该模型会在每次生成语音时向厂商发送本地参考音频。"}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
