import { useEffect, useMemo, useState } from "react";
import {
  Check,
  Copy,
  Library,
  Mic2,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { api } from "../api";
import { ProviderSelector } from "../components/ProviderSelector";
import { WorkspaceHero } from "../components/WorkspaceHero";
import { useStudio } from "../context/StudioContext";
import { useDialogAccessibility } from "../hooks/useDialogAccessibility";
import type {
  CloudVoice,
  ImportVoiceConfig,
  Model,
  ProviderAccount,
  ProviderProject,
  Voice,
} from "../types";
import { credentialProviderIds, providerMeta } from "../utils";

export function VoicesPage() {
  const {
    voices,
    models,
    setActive,
    importVoice,
    importVoices,
    removeVoice,
    renameVoice,
    useVoice: selectVoice,
  } = useStudio();
  const [provider, setProvider] = useState("all");
  const [scope, setScope] = useState<"all" | "mine">("all");
  const [showImport, setShowImport] = useState(false);
  const [renameTarget, setRenameTarget] = useState<Voice | null>(null);
  const [copiedId, setCopiedId] = useState("");
  const copyId = async (key: string, value: string) => {
    const id = value.trim();
    if (!id) return;
    try {
      await navigator.clipboard.writeText(id);
      setCopiedId(key);
      window.setTimeout(() => setCopiedId(""), 1600);
    } catch {
      setCopiedId("");
    }
  };
  const scoped = scope === "mine"
    ? voices.filter((item) => ["cloned", "design", "imported"].includes(item.voice_type))
    : voices;
  const filtered = provider === "all"
    ? scoped
    : scoped.filter((item) => item.provider === provider);
  const counts = Object.fromEntries(
    credentialProviderIds.map((id) => [
      id,
      scoped.filter((item) => item.provider === id).length,
    ]),
  );
  return (
    <section className="page-section voice-library">
      <div className="page-toolbar">
        <div>
          <WorkspaceHero
            title="让每一个声音"
            accent="都有自己的位置。"
            description="浏览预置、克隆、导入和设计音色，并按来源快速筛选。"
          />
        </div>
        <div className="toolbar-actions">
          <button
            className="secondary-button"
            onClick={() => setShowImport(true)}
          >
            <Plus size={16} />
            导入 Voice ID
          </button>
          <button className="primary-button compact" onClick={() => setActive("clone")}>
            <Mic2 size={16} />
            开始克隆
          </button>
        </div>
      </div>
      <div className="voice-scope-tabs" role="group" aria-label="音色范围">
        <button type="button" aria-pressed={scope === "all"} className={scope === "all" ? "selected" : ""} onClick={() => setScope("all")}>全部音色</button>
        <button type="button" aria-pressed={scope === "mine"} className={scope === "mine" ? "selected" : ""} onClick={() => setScope("mine")}>我的音色</button>
      </div>
      <ProviderSelector
        className="voice-provider-selector"
        label="按厂商筛选音色"
        value={provider}
        onChange={setProvider}
        options={[
          { id: "all", label: "全部厂商", mark: "全", tone: "gray", detail: `${scoped.length} 个音色` },
          ...credentialProviderIds.map((id) => ({
            id,
            label: providerMeta[id].label,
            mark: providerMeta[id].mark,
            tone: providerMeta[id].tone,
            detail: `${counts[id] || 0} 个音色`,
          })),
        ]}
      />
      <div className="voice-table">
        <div className="table-head">
          <span className="voice-name-column">音色</span>
          <span className="voice-api-id-column">Voice ID</span>
          <span className="voice-model-column">模型</span>
          <span className="voice-model-id-column">模型 ID</span>
          <span className="voice-type-column">类型</span>
          <span className="voice-languages-column">语言</span>
          <span className="voice-actions-column" />
        </div>
        {filtered.length ? (
          filtered.map((item) => {
            const model = models.find((candidate) => candidate.provider === item.provider && candidate.model_id === item.model_id);
            const apiVoiceId = item.api_voice_id?.trim() || item.provider_voice_id?.trim() || item.public_name.trim();
            return (
            <div className="voice-row" key={item.id}>
              <div className="voice-name">
                <div className="voice-wave">
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                </div>
                <strong title={item.display_name}>{item.display_name}</strong>
              </div>
              <div className="voice-api-id">
                <code title={apiVoiceId}>{apiVoiceId}</code>
                <button
                  className="voice-id-copy"
                  type="button"
                  title={copiedId === `voice:${item.id}` ? "已复制 Voice ID" : "复制 API 请求中的 Voice ID"}
                  aria-label={`${copiedId === `voice:${item.id}` ? "已复制" : "复制"} Voice ID ${apiVoiceId}`}
                  onClick={() => void copyId(`voice:${item.id}`, apiVoiceId)}
                >
                  {copiedId === `voice:${item.id}` ? <Check size={14} /> : <Copy size={14} />}
                </button>
              </div>
              <div className="voice-model">
                <strong title={model?.display_name || item.model_id}>{model?.display_name || item.model_id}</strong>
              </div>
              <div className="voice-model-id">
                <code title={item.model_id}>{item.model_id}</code>
                <button
                  className="voice-id-copy"
                  type="button"
                  title={copiedId === `model:${item.id}` ? "已复制模型 ID" : "复制 API 请求中的模型 ID"}
                  aria-label={`${copiedId === `model:${item.id}` ? "已复制" : "复制"}模型 ID ${item.model_id}`}
                  onClick={() => void copyId(`model:${item.id}`, item.model_id)}
                >
                  {copiedId === `model:${item.id}` ? <Check size={14} /> : <Copy size={14} />}
                </button>
              </div>
              <span className="type-text voice-type">
                {item.voice_type === "cloned"
                  ? "克隆"
                  : item.voice_type === "imported"
                    ? "导入"
                    : item.voice_type === "design"
                      ? "设计"
                    : "预置"}
              </span>
              <span className="voice-languages">{item.languages.join(" · ")}</span>
              <div className="voice-actions">
                <button className="voice-use-button" onClick={() => selectVoice(item)}>使用</button>
                {item.voice_type !== "preset" ? <button
                  className="icon-button rename-voice"
                  title="重命名"
                  aria-label={`重命名 ${item.display_name}`}
                  onClick={() => setRenameTarget(item)}
                >
                  <Pencil size={16} />
                </button> : <span className="voice-action-placeholder" aria-hidden="true" />}
                <button
                  className="icon-button delete-voice"
                  title="从音色库移除"
                  aria-label={`从音色库移除 ${item.display_name}`}
                  onClick={() => void removeVoice(item)}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
            );
          })
        ) : (
          <div className="empty-state">
            <Library size={21} />
            <span>当前来源还没有可用音色</span>
          </div>
        )}
      </div>
      {showImport && (
        <ImportVoiceDialog
          models={models}
          onClose={() => setShowImport(false)}
          onImport={async (config) => {
            await importVoice(config);
            setShowImport(false);
            setProvider(config.provider);
          }}
          onBatchImport={async (configs) => {
            await importVoices(configs);
            setShowImport(false);
            setProvider(configs[0]?.provider || "all");
          }}
        />
      )}
      {renameTarget && (
        <RenameVoiceDialog
          voice={renameTarget}
          onClose={() => setRenameTarget(null)}
          onRename={async (displayName) => {
            await renameVoice(renameTarget, displayName);
            setRenameTarget(null);
          }}
        />
      )}
    </section>
  );
}

function RenameVoiceDialog({
  voice,
  onClose,
  onRename,
}: {
  voice: Voice;
  onClose: () => void;
  onRename: (displayName: string) => Promise<void>;
}) {
  const [displayName, setDisplayName] = useState(voice.display_name);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const dialogRef = useDialogAccessibility<HTMLDivElement>(true, () => {
    if (!working) onClose();
  });
  const submit = async () => {
    const value = displayName.trim();
    if (!value || value === voice.display_name) return;
    setWorking(true);
    setMessage("");
    try {
      await onRename(value);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "重命名失败");
    } finally {
      setWorking(false);
    }
  };
  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target && !working) onClose(); }}>
      <div ref={dialogRef} className="voice-modal rename-voice-modal" role="dialog" aria-modal="true" aria-labelledby="rename-voice-title" tabIndex={-1}>
        <div className="modal-head">
          <div><h3 id="rename-voice-title">重命名音色</h3></div>
          <button className="icon-button" type="button" onClick={onClose} disabled={working} title="关闭" aria-label="关闭"><X size={18} /></button>
        </div>
        <div className="modal-form">
          <label htmlFor="rename-voice-name">显示名称</label>
          <input id="rename-voice-name" autoFocus maxLength={100} value={displayName} onChange={(event) => setDisplayName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void submit(); }} />
          <div className="rename-api-id"><span>兼容别名</span><code>{voice.public_name}</code></div>
          <p className="modal-note"><ShieldCheck size={15} />重命名只改变界面中显示的名称，现有 API 调用、任务记录和厂商 Voice ID 不受影响。</p>
          {message && <div className="form-message" role="status" aria-live="polite">{message}</div>}
        </div>
        <div className="modal-actions">
          <button className="secondary-button" type="button" onClick={onClose} disabled={working}>取消</button>
          <button className="primary-button compact" type="button" onClick={() => void submit()} disabled={working || !displayName.trim() || displayName.trim() === voice.display_name}><Save size={16} />{working ? "正在保存..." : "保存名称"}</button>
        </div>
      </div>
    </div>
  );
}

function ImportVoiceDialog({
  models,
  onClose,
  onImport,
  onBatchImport,
}: {
  models: Model[];
  onClose: () => void;
  onImport: (config: ImportVoiceConfig) => Promise<void>;
  onBatchImport: (configs: ImportVoiceConfig[]) => Promise<void>;
}) {
  const importModels = models.filter(
    (item) =>
      item.supports_clone &&
      item.operations.includes("clone") &&
      ["dashscope", "volcengine", "minimax"].includes(item.provider),
  );
  const syncProviders = ["dashscope", "volcengine", "minimax"].filter((id) =>
    importModels.some((item) => item.provider === id),
  );
  const initialProvider = syncProviders[0] || importModels[0]?.provider || "";
  const [mode, setMode] = useState<"sync" | "manual">("sync");
  const [provider, setProvider] = useState(initialProvider);
  const [modelId, setModelId] = useState(
    importModels.find((item) => item.provider === initialProvider)?.model_id ||
      "",
  );
  const [voiceId, setVoiceId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [publicName, setPublicName] = useState("");
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [cloudVoices, setCloudVoices] = useState<CloudVoice[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [providerAccounts, setProviderAccounts] = useState<ProviderAccount[]>([]);
  const [providerAccountId, setProviderAccountId] = useState("");
  const [providerProjects, setProviderProjects] = useState<ProviderProject[]>([]);
  const [providerProjectName, setProviderProjectName] = useState("");
  const [edits, setEdits] = useState<
    Record<string, { display_name: string; public_name: string }>
  >({});
  const dialogRef = useDialogAccessibility<HTMLDivElement>(true, onClose);
  const providerModels = importModels.filter(
    (item) => item.provider === provider,
  );
  const selectedProviderAccounts = useMemo(
    () => providerAccounts.filter((item) => item.provider === provider),
    [provider, providerAccounts],
  );

  useEffect(() => {
    api<ProviderAccount[]>("/api/provider-accounts")
      .then(setProviderAccounts)
      .catch(() => setProviderAccounts([]));
  }, []);

  useEffect(() => {
    setProviderAccountId((current) =>
      selectedProviderAccounts.some((item) => item.id === current)
        ? current
        : selectedProviderAccounts[0]?.id || "",
    );
  }, [selectedProviderAccounts]);
  useEffect(() => {
    if (provider !== "volcengine" || !providerAccountId) return;
    api<{ projects: ProviderProject[] }>(
      `/api/provider-accounts/${encodeURIComponent(providerAccountId)}/projects`,
    )
      .then((result) => {
        setProviderProjects(result.projects);
        setProviderProjectName((current) =>
          result.projects.some((item) => item.project_name === current)
            ? current
            : result.projects[0]?.project_name || "",
        );
      })
      .catch(() => {
        setProviderProjects([]);
        setProviderProjectName("");
      });
  }, [provider, providerAccountId]);
  const defaultNames = (item: CloudVoice, index: number) => {
    const providerName = providerMeta[item.provider || provider]?.label || item.provider || provider;
    const displayName = item.display_name?.trim() || `${providerName}复刻音色 ${String(index + 1).padStart(2, "0")}`;
    const shortId = item.provider_voice_id.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase().slice(-24);
    return {
      display_name: displayName,
      public_name: `${item.provider}-${shortId || `voice-${index + 1}`}`.slice(0, 48),
    };
  };
  const chooseProvider = (next: string) => {
    setProvider(next);
    setModelId(
      importModels.find((item) => item.provider === next)?.model_id || "",
    );
    setCloudVoices([]);
    setSelected([]);
    setEdits({});
    setMessage("");
  };
  const chooseMode = (next: "sync" | "manual") => {
    setMode(next);
    if (next === "sync" && !syncProviders.includes(provider))
      chooseProvider(syncProviders[0] || "");
    setMessage("");
  };
  const loadCloudVoices = async () => {
    if (!syncProviders.includes(provider)) return;
    if (!providerAccountId) {
      setMessage(`请先在设置中保存${providerMeta[provider]?.label || "厂商"}账号配置。`);
      return;
    }
    setWorking(true);
    setMessage("");
    try {
      const result = await api<{ voices: CloudVoice[] }>(
        `/api/voices/cloud/${provider}${
          `?provider_account_id=${encodeURIComponent(providerAccountId)}${
            provider === "volcengine"
              ? `&provider_project_name=${encodeURIComponent(providerProjectName)}`
              : ""
          }`
        }`,
      );
      setCloudVoices(result.voices);
      setSelected([]);
      setEdits(
        Object.fromEntries(
          result.voices.map((item, index) => [
            item.provider_voice_id,
            defaultNames(item, index),
          ]),
        ),
      );
      if (!result.voices.length)
        setMessage("厂商账号中没有可同步的克隆音色。");
    } catch (error) {
      setCloudVoices([]);
      setMessage(error instanceof Error ? error.message : "读取云端音色失败");
    } finally {
      setWorking(false);
    }
  };
  const submit = async () => {
    if (
      !voiceId.trim() ||
      !displayName.trim() ||
      !publicName.trim() ||
      !modelId
    )
      return;
    if (!providerAccountId) {
      setMessage("请先选择厂商账号。");
      return;
    }
    setWorking(true);
    setMessage("");
    try {
      await onImport({
        provider,
        model_id: modelId,
        provider_voice_id: voiceId.trim(),
        display_name: displayName.trim(),
        public_name: publicName.trim(),
        languages: ["zh-CN"],
          provider_account_id: providerAccountId,
          provider_project_name: provider === "volcengine" ? providerProjectName : undefined,
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "导入失败");
    } finally {
      setWorking(false);
    }
  };
  const submitBatch = async () => {
    const items = cloudVoices.filter((item) =>
      selected.includes(item.provider_voice_id),
    );
    if (!items.length) return;
    const configs = items.map((item) => ({
      provider,
      model_id: provider === "minimax" ? modelId : item.model_id,
      provider_voice_id: item.provider_voice_id,
      display_name: edits[item.provider_voice_id]?.display_name.trim() || item.display_name,
      public_name: edits[item.provider_voice_id]?.public_name.trim() || "",
      languages: [item.language === "zh" ? "zh-CN" : item.language || "zh-CN"],
      provider_account_id: item.provider_account_id,
      provider_project_name: item.provider_project_name,
    }));
    if (configs.some((item) => !item.display_name || !item.public_name)) {
      setMessage("已选择音色的显示名称和兼容别名不能为空。");
      return;
    }
    setWorking(true);
    setMessage("");
    try {
      await onBatchImport(configs);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "批量导入失败");
    } finally {
      setWorking(false);
    }
  };
  const selectable = cloudVoices.filter(
    (item) => item.compatible && !item.imported,
  );
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className={"voice-modal " + (mode === "sync" ? "sync-modal" : "")}
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-title"
        tabIndex={-1}
      >
        <div className="modal-head">
          <div>
            <h3 id="import-title">导入已有厂商音色</h3>
          </div>
          <button className="icon-button" type="button" title="关闭" aria-label="关闭" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="modal-form">
          <div className="import-mode" role="group" aria-label="导入方式">
            <button
              className={mode === "sync" ? "selected" : ""}
              onClick={() => chooseMode("sync")}
              type="button"
              aria-pressed={mode === "sync"}
            >
              云端同步
            </button>
            <button
              className={mode === "manual" ? "selected" : ""}
              onClick={() => chooseMode("manual")}
              type="button"
              aria-pressed={mode === "manual"}
            >
              手工输入 ID
            </button>
          </div>
          <div className="form-grid">
            <div>
              <label>厂商</label>
              <select
                value={provider}
                onChange={(event) => chooseProvider(event.target.value)}
              >
                {(mode === "sync" ? syncProviders : credentialProviderIds)
                  .filter((id) =>
                    importModels.some((item) => item.provider === id),
                  )
                  .map((id) => (
                    <option value={id} key={id}>
                      {providerMeta[id].label}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label>目标模型</label>
              <select
                value={modelId}
                onChange={(event) => setModelId(event.target.value)}
                disabled={mode === "sync" && provider !== "minimax"}
              >
                {providerModels.map((item) => (
                  <option value={item.model_id} key={item.gateway_id}>
                    {item.display_name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="import-project-field">
              <label htmlFor="import-provider-account">厂商账号</label>
              <select
                id="import-provider-account"
                value={providerAccountId}
                onChange={(event) => {
                  setProviderAccountId(event.target.value);
                  setProviderProjectName("");
                  setCloudVoices([]);
                  setSelected([]);
                  setEdits({});
                  setMessage("");
                }}
                disabled={!selectedProviderAccounts.length}
              >
                {!selectedProviderAccounts.length && <option value="">尚未配置账号</option>}
                {selectedProviderAccounts.map((account) => (
                  <option value={account.id} key={account.id}>
                    {account.display_name}
                  </option>
                ))}
              </select>
              {provider === "volcengine" && <><label htmlFor="import-volcengine-project">项目</label>
              <select
                id="import-volcengine-project"
                value={providerProjectName}
                onChange={(event) => {
                  setProviderProjectName(event.target.value);
                  setCloudVoices([]);
                  setSelected([]);
                  setEdits({});
                  setMessage("");
                }}
                disabled={!providerProjects.length}
              >
                {!providerProjects.length && <option value="">请先同步项目</option>}
                {providerProjects.map((project) => (
                  <option value={project.project_name} key={project.id}>
                    {project.display_name || project.project_name}
                    {project.display_name !== project.project_name ? ` · ${project.project_name}` : ""}
                  </option>
                ))}
              </select></>}
            </div>
          {mode === "sync" ? (
            <>
              <div className="sync-toolbar">
                <div>
                  <strong>云端克隆音色</strong>
                  <span>{cloudVoices.length ? `${selectable.length} 个可导入 · 已选 ${selected.length}` : "尚未读取"}</span>
                </div>
                <button
                  className="secondary-button"
                  onClick={loadCloudVoices}
                  disabled={working || !providerAccountId || (provider === "volcengine" && !providerProjectName)}
                >
                  <RefreshCw size={14} className={working ? "spinning" : ""} />
                  {working ? "正在读取" : "读取云端音色"}
                </button>
              </div>
              <p className="import-naming-note">
                默认显示名称沿用厂商音色名称；兼容别名按“厂商 + Voice ID”生成，可在勾选后修改。
              </p>
              {cloudVoices.length > 0 && (
                <div className="cloud-voice-list">
                  <label className="cloud-select-all">
                    <input
                      type="checkbox"
                      checked={selectable.length > 0 && selected.length === selectable.length}
                      onChange={(event) =>
                        setSelected(
                          event.target.checked
                            ? selectable.map((item) => item.provider_voice_id)
                            : [],
                        )
                      }
                    />
                    <span>选择全部可导入音色</span>
                    <small>{selected.length ? `已选 ${selected.length} 个` : ""}</small>
                  </label>
                  {cloudVoices.map((item) => {
                    const disabled = item.imported || !item.compatible;
                    const checked = selected.includes(item.provider_voice_id);
                    return (
                      <div
                        className={"cloud-voice-row " + (disabled ? "disabled" : "")}
                        key={`${item.model_id}:${item.provider_voice_id}`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={disabled}
                          onChange={(event) =>
                            setSelected((current) =>
                              event.target.checked
                                ? [...current, item.provider_voice_id]
                                : current.filter((id) => id !== item.provider_voice_id),
                            )
                          }
                          aria-label={`选择 ${item.display_name}`}
                        />
                        <div className="cloud-voice-main">
                          <div className="cloud-voice-meta">
                            <div>
                              <strong>{item.display_name}</strong>
                              <code>{item.provider_voice_id}</code>
                            </div>
                            <span className={item.imported ? "is-imported" : !item.compatible ? "is-incompatible" : ""}>
                              {item.imported ? "已导入" : !item.compatible ? "模型不兼容" : "可导入"}
                            </span>
                          </div>
                          <small>{item.compatibility_message || (provider === "minimax" ? "可用于全部 MiniMax Speech 模型" : item.model_id)}</small>
                          {checked && (
                            <div className="cloud-voice-fields">
                              <label>导入后显示名称<input
                                value={edits[item.provider_voice_id]?.display_name || ""}
                                onChange={(event) =>
                                  setEdits((current) => ({
                                    ...current,
                                    [item.provider_voice_id]: {
                                      ...current[item.provider_voice_id],
                                      display_name: event.target.value,
                                    },
                                  }))
                                }
                                placeholder="显示名称"
                              /></label>
                              <label>OpenAI 兼容别名<input
                                value={edits[item.provider_voice_id]?.public_name || ""}
                                onChange={(event) =>
                                  setEdits((current) => ({
                                    ...current,
                                    [item.provider_voice_id]: {
                                      ...current[item.provider_voice_id],
                                      public_name: event.target.value,
                                    },
                                  }))
                                }
                                placeholder="兼容别名"
                              /></label>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              <p className="modal-note">
                <ShieldCheck size={15} />
                此操作只读取并登记云端音色，不会创建、删除音色或生成收费音频。
              </p>
            </>
          ) : (
            <>
              <label>{provider === "volcengine" ? "火山音色 ID / speaker_id" : "厂商 Voice ID"}</label>
              <input
                value={voiceId}
                onChange={(event) => setVoiceId(event.target.value)}
                placeholder={provider === "volcengine" ? "例如：S_xxxxx 或 custom_zh_xxx" : "粘贴控制台中的完整 Voice ID"}
                autoFocus
              />
              <div className="form-grid">
                <div>
                  <label>显示名称</label>
                  <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="例如：我的旁白音色" />
                </div>
                <div>
                  <label>兼容别名</label>
                  <input value={publicName} onChange={(event) => setPublicName(event.target.value)} placeholder="例如：my-volc-voice" />
                </div>
              </div>
              {provider === "volcengine" && (
                <p className="modal-note"><ShieldCheck size={15} />保存前会向火山引擎查询音色状态。批量同步还需配置火山 OpenAPI AK/SK 与项目名称。</p>
              )}
              {provider === "minimax" && (
                <p className="modal-note"><ShieldCheck size={15} />MiniMax Voice ID 将直接导入，首次合成时由厂商接口验证其可用性。</p>
              )}
            </>
          )}
          {message && <div className="form-message" role="status" aria-live="polite">{message}</div>}
        </div>
        <div className="modal-actions">
          <button className="secondary-button" onClick={onClose}>
            取消
          </button>
          <button
            className="primary-button compact"
            onClick={mode === "sync" ? submitBatch : submit}
            disabled={
              working ||
              (provider === "volcengine" && (!providerAccountId || !providerProjectName)) ||
              (mode === "sync"
                ? selected.length === 0
                : !voiceId.trim() || !displayName.trim() || !publicName.trim())
            }
          >
            <Save size={15} />
            {mode === "sync"
              ? working
                ? "正在导入..."
                : `导入所选音色${selected.length ? ` (${selected.length})` : ""}`
              : working
              ? provider === "minimax"
                ? "正在导入..."
                : "正在验证..."
              : provider === "minimax"
                ? "直接导入"
                : "验证并导入"}
          </button>
        </div>
      </div>
    </div>
  );
}
