import { useEffect, useState } from "react";
import {
  Activity,
  Check,
  CircleHelp,
  Copy,
  Eye,
  EyeOff,
  FolderOpen,
  HardDrive,
  KeyRound,
  Plus,
  RefreshCw,
  Route,
  Save,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { api } from "../api";
import { ProviderSelector } from "../components/ProviderSelector";
import { ModelAliasSettings } from "../components/ModelAliasSettings";
import { WorkspaceHero } from "../components/WorkspaceHero";
import { useConfirm } from "../components/feedback/ConfirmProvider";
import { handleTabListKeyDown } from "../components/tabs";
import { useStudio } from "../context/StudioContext";
import { useDialogAccessibility } from "../hooks/useDialogAccessibility";
import type {
  CleanupPreview,
  CleanupRun,
  Model,
  ProviderAccount,
  ProviderProject,
  ProviderSpec,
  StoragePolicy,
  StorageStatus,
  SystemDiagnostics,
} from "../types";
import { credentialProviderIds, formatBytes, providerMeta } from "../utils";

export function SettingsPage() {
  const { models, refreshJobs: onJobsChanged } = useStudio();
  const [section, setSection] = useState<"providers" | "aliases" | "storage" | "environment">("providers");
  return (
    <section className="page-section settings-shell">
      <WorkspaceHero
        title="把每个厂商"
        accent="放进同一个工作台。"
        description="统一管理厂商凭据、生成文件存储策略和本机运行环境。"
      />
      <div className="settings-navigation" role="tablist" aria-label="设置分类" onKeyDown={handleTabListKeyDown}>
        <button id="settings-tab-providers" className={section === "providers" ? "selected" : ""} type="button" role="tab" aria-controls="settings-panel-providers" aria-selected={section === "providers"} tabIndex={section === "providers" ? 0 : -1} onClick={() => setSection("providers")}><KeyRound size={18} />厂商账号</button>
        <button id="settings-tab-aliases" className={section === "aliases" ? "selected" : ""} type="button" role="tab" aria-controls="settings-panel-aliases" aria-selected={section === "aliases"} tabIndex={section === "aliases" ? 0 : -1} onClick={() => setSection("aliases")}><Route size={18} />默认模型</button>
        <button id="settings-tab-storage" className={section === "storage" ? "selected" : ""} type="button" role="tab" aria-controls="settings-panel-storage" aria-selected={section === "storage"} tabIndex={section === "storage" ? 0 : -1} onClick={() => setSection("storage")}><HardDrive size={18} />存储与清理</button>
        <button id="settings-tab-environment" className={section === "environment" ? "selected" : ""} type="button" role="tab" aria-controls="settings-panel-environment" aria-selected={section === "environment"} tabIndex={section === "environment" ? 0 : -1} onClick={() => setSection("environment")}><ShieldCheck size={18} />运行环境</button>
      </div>
      {section === "providers" && <ProviderSettings models={models} panelId="settings-panel-providers" labelledBy="settings-tab-providers" />}
      {section === "aliases" && <ModelAliasSettings models={models} panelId="settings-panel-aliases" labelledBy="settings-tab-aliases" />}
      {section === "storage" && <StorageSettings onJobsChanged={onJobsChanged} panelId="settings-panel-storage" labelledBy="settings-tab-storage" />}
      {section === "environment" && <EnvironmentSettings panelId="settings-panel-environment" labelledBy="settings-tab-environment" />}
    </section>
  );
}

function EnvironmentSettings({ panelId, labelledBy }: { panelId?: string; labelledBy?: string }) {
  const [diagnostics, setDiagnostics] = useState<SystemDiagnostics | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      setDiagnostics(await api<SystemDiagnostics>("/api/system/diagnostics"));
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "无法读取环境诊断");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void load(); }, []);

  if (loading && !diagnostics) {
    return <div className="environment-loading"><RefreshCw size={18} className="spinning" />正在检查运行环境...</div>;
  }
  return (
    <div id={panelId} className="environment-settings-page" role={panelId ? "tabpanel" : undefined} aria-labelledby={labelledBy} tabIndex={panelId ? 0 : undefined}>
      <div className="environment-heading">
        <div>
          <h2>运行环境</h2>
          <p>检查语音生成、音频转换和凭据保存所需的本机组件。</p>
        </div>
        <button className="secondary-button" type="button" onClick={() => void load()} disabled={loading}>
          <RefreshCw size={16} className={loading ? "spinning" : ""} />重新检查
        </button>
      </div>
      {diagnostics && <>
        <div className={"environment-summary " + diagnostics.status}>
          <span className="environment-summary-icon">
            {diagnostics.status === "error" ? <X size={21} /> : diagnostics.status === "warning" ? <CircleHelp size={21} /> : <Check size={21} />}
          </span>
          <div>
            <strong>{diagnostics.status === "error" ? `${diagnostics.required_failures} 项需要处理` : diagnostics.status === "warning" ? "核心环境可用" : "运行环境正常"}</strong>
            <span>{diagnostics.base_url} · {diagnostics.platform} 本地服务</span>
          </div>
        </div>
        <div className="environment-checks">
          {diagnostics.checks.map((item) => (
            <div className="environment-check-row" key={item.id}>
              <span className={"environment-check-state " + item.status}>
                {item.status === "ok" ? <Check size={16} /> : item.status === "warning" ? <CircleHelp size={16} /> : <X size={16} />}
              </span>
              <div className="environment-check-main"><strong>{item.label}</strong><span>{item.detail}</span></div>
              <code>{item.version || (item.status === "warning" ? "可选" : "未通过")}</code>
            </div>
          ))}
        </div>
      </>}
      {message && <div className="environment-message"><Activity size={15} />{message}</div>}
    </div>
  );
}

type StoragePolicyDraft = {
  automatic_enabled: boolean;
  retention_days: number;
  capacity_gb: number;
  interval: "daily" | "weekly";
  cleanup_scope: "audio_only" | "jobs";
};

const GIBIBYTE = 1024 * 1024 * 1024;

function storageDraft(policy: StoragePolicy): StoragePolicyDraft {
  return {
    automatic_enabled: policy.automatic_enabled,
    retention_days: policy.retention_days,
    capacity_gb: Number((policy.capacity_limit_bytes / GIBIBYTE).toFixed(2)),
    interval: policy.interval,
    cleanup_scope: policy.cleanup_scope,
  };
}

function StorageSettings({ onJobsChanged, panelId, labelledBy }: { onJobsChanged: () => Promise<void>; panelId?: string; labelledBy?: string }) {
  const [status, setStatus] = useState<StorageStatus | null>(null);
  const [draft, setDraft] = useState<StoragePolicyDraft | null>(null);
  const [preview, setPreview] = useState<CleanupPreview | null>(null);
  const [working, setWorking] = useState<"" | "loading" | "saving" | "preview" | "cleanup" | "directory">("loading");
  const [message, setMessage] = useState("");
  const closePreview = () => {
    if (working !== "cleanup") setPreview(null);
  };
  const dialogRef = useDialogAccessibility<HTMLDivElement>(Boolean(preview), closePreview);

  const load = async () => {
    setWorking("loading");
    try {
      const next = await api<StorageStatus>("/api/storage");
      setStatus(next);
      setDraft(storageDraft(next.policy));
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "无法读取存储状态");
    } finally {
      setWorking("");
    }
  };
  useEffect(() => { void load(); }, []);

  const dirty = Boolean(status && draft && (
    draft.automatic_enabled !== status.policy.automatic_enabled ||
    draft.retention_days !== status.policy.retention_days ||
    Math.round(draft.capacity_gb * GIBIBYTE) !== status.policy.capacity_limit_bytes ||
    draft.interval !== status.policy.interval ||
    draft.cleanup_scope !== status.policy.cleanup_scope
  ));

  const persistDraft = async (showMessage = true) => {
    if (!draft) throw new Error("存储策略尚未加载");
    if (!Number.isFinite(draft.retention_days) || draft.retention_days < 1) throw new Error("自动保留天数不能少于 1 天");
    if (!Number.isFinite(draft.capacity_gb) || draft.capacity_gb < 0.1) throw new Error("容量上限不能少于 0.1 GB");
    const next = await api<StorageStatus>("/api/storage/policy", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        automatic_enabled: draft.automatic_enabled,
        retention_days: Math.round(draft.retention_days),
        capacity_limit_bytes: Math.round(draft.capacity_gb * GIBIBYTE),
        interval: draft.interval,
        cleanup_scope: draft.cleanup_scope,
      }),
    });
    setStatus(next);
    setDraft(storageDraft(next.policy));
    if (showMessage) setMessage("存储策略已保存");
    return next;
  };

  const save = async () => {
    setWorking("saving");
    setMessage("");
    try {
      await persistDraft();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存失败");
    } finally {
      setWorking("");
    }
  };

  const showCleanupPreview = async () => {
    setWorking("preview");
    setMessage("");
    try {
      if (dirty) await persistDraft(false);
      setPreview(await api<CleanupPreview>("/api/storage/cleanup/preview", { method: "POST" }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "无法计算清理范围");
    } finally {
      setWorking("");
    }
  };

  const cleanNow = async () => {
    setWorking("cleanup");
    try {
      const response = await api<{ result: CleanupRun; storage: StorageStatus }>("/api/storage/cleanup", { method: "POST" });
      setStatus(response.storage);
      setDraft(storageDraft(response.storage.policy));
      setPreview(null);
      setMessage(response.result.files_removed || response.result.jobs_removed
        ? `${response.result.message}，释放 ${formatBytes(response.result.bytes_freed)}`
        : response.result.message);
      await onJobsChanged();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "清理失败");
    } finally {
      setWorking("");
    }
  };

  const openDirectory = async () => {
    setWorking("directory");
    try {
      const result = await api<{ opened: boolean; path: string; message?: string }>("/api/storage/open-directory", { method: "POST" });
      setMessage(result.opened ? "已打开音频存储目录" : `${result.message || "请手动打开音频存储目录"} 路径：${result.path}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "无法打开存储目录");
    } finally {
      setWorking("");
    }
  };

  if (!status || !draft) {
    return <div className="storage-loading"><RefreshCw className={working === "loading" ? "spinning" : ""} size={20} /><span>{message || "正在读取存储状态..."}</span>{message && <button className="secondary-button" type="button" onClick={() => void load()}>重试</button>}</div>;
  }

  const usagePercent = Math.min(100, Math.max(0, status.usage.capacity_ratio * 100));
  const latest = status.cleanup_history[0];
  return (
    <div id={panelId} className="storage-settings-page" role={panelId ? "tabpanel" : undefined} aria-labelledby={labelledBy} tabIndex={panelId ? 0 : undefined}>
      <header className="storage-heading">
        <div><h2>生成文件存储</h2><p>控制任务音频的保留时间和磁盘占用。音色库、API 凭据与语音克隆素材不会被自动清理。</p></div>
        <button className="secondary-button" type="button" onClick={() => void openDirectory()} disabled={Boolean(working)}><FolderOpen size={17} />打开目录</button>
      </header>

      <section className="storage-overview" aria-label="存储空间概览">
        <div className="storage-usage-head">
          <div className="storage-usage-title"><HardDrive size={22} /><span>当前占用</span></div>
          <strong>{formatBytes(status.usage.audio_bytes)} <span>/ {formatBytes(status.policy.capacity_limit_bytes)}</span></strong>
        </div>
        <div className="storage-progress" aria-label={`已使用 ${usagePercent.toFixed(0)}%`}><span style={{ width: `${usagePercent}%` }} /></div>
        <div className="storage-stats">
          <div><strong>{status.usage.audio_count}</strong><span>个音频</span></div>
          <div><strong>{status.usage.job_count}</strong><span>条任务记录</span></div>
          <div><strong>{status.usage.oldest_audio_at ? new Date(status.usage.oldest_audio_at).toLocaleDateString() : "--"}</strong><span>最早音频</span></div>
        </div>
      </section>

      <section className="storage-policy-section">
        <div className="storage-policy-row storage-policy-master">
          <div><strong>自动清理</strong><span>{draft.automatic_enabled ? (status.cleanup_history.some((run) => run.trigger === "automatic") && status.next_cleanup_at ? `下次检查 ${new Date(status.next_cleanup_at).toLocaleString()}` : "等待首次自动检查") : "关闭后仍可使用立即清理"}</span></div>
          <button className={draft.automatic_enabled ? "toggle-switch active" : "toggle-switch"} type="button" role="switch" aria-checked={draft.automatic_enabled} onClick={() => setDraft({ ...draft, automatic_enabled: !draft.automatic_enabled })}><span /></button>
        </div>

        <div className="storage-policy-grid">
          <div className="storage-setting-block">
            <label htmlFor="retention-days">自动保留天数</label>
            <div className="number-with-unit"><input id="retention-days" type="number" min="1" max="3650" value={draft.retention_days} onChange={(event) => setDraft({ ...draft, retention_days: Number(event.target.value) })} /><span>天</span></div>
            <p>超过保留时间的音频会进入清理范围。</p>
          </div>
          <div className="storage-setting-block">
            <label htmlFor="capacity-limit">容量上限</label>
            <div className="number-with-unit"><input id="capacity-limit" type="number" min="0.1" max="10240" step="0.1" value={draft.capacity_gb} onChange={(event) => setDraft({ ...draft, capacity_gb: Number(event.target.value) })} /><span>GB</span></div>
            <p>超出上限后优先清理最旧的音频。</p>
          </div>
          <div className="storage-setting-block">
            <label>检查频率</label>
            <div className="storage-segmented"><button className={draft.interval === "daily" ? "selected" : ""} type="button" onClick={() => setDraft({ ...draft, interval: "daily" })}>每天</button><button className={draft.interval === "weekly" ? "selected" : ""} type="button" onClick={() => setDraft({ ...draft, interval: "weekly" })}>每周</button></div>
            <p>程序启动时也会检查是否到期。</p>
          </div>
          <div className="storage-setting-block">
            <label>清理范围</label>
            <div className="storage-segmented storage-scope"><button className={draft.cleanup_scope === "audio_only" ? "selected" : ""} type="button" onClick={() => setDraft({ ...draft, cleanup_scope: "audio_only" })}>只清理音频</button><button className={draft.cleanup_scope === "jobs" ? "selected danger" : ""} type="button" onClick={() => setDraft({ ...draft, cleanup_scope: "jobs" })}>音频和任务记录</button></div>
            <p>{draft.cleanup_scope === "audio_only" ? "文字和生成参数会继续保留。" : "到期任务将从任务历史中永久删除。"}</p>
          </div>
        </div>
      </section>

      {draft.cleanup_scope === "jobs" && <div className="storage-danger-note"><ShieldCheck size={18} /><span>当前策略会永久删除任务记录。建议先使用批量导出备份重要内容。</span></div>}
      {message && <div className="form-message storage-message" role="status" aria-live="polite"><Activity size={15} />{message}</div>}

      <div className="storage-actions">
        <div>{latest ? <>最近清理：{new Date(latest.completed_at).toLocaleString()} · 释放 {formatBytes(latest.bytes_freed)}</> : "尚未执行过清理"}</div>
        <button className="secondary-button" type="button" onClick={() => void showCleanupPreview()} disabled={Boolean(working)}><Trash2 size={17} />{working === "preview" ? "正在计算..." : "立即清理"}</button>
        <button className="primary-button compact" type="button" onClick={() => void save()} disabled={Boolean(working) || !dirty}><Save size={17} />{working === "saving" ? "保存中..." : "保存设置"}</button>
      </div>

      <section className="cleanup-history-section">
        <div className="cleanup-history-heading"><h3>清理记录</h3><button className="icon-button" type="button" onClick={() => void load()} disabled={Boolean(working)} title="刷新存储状态" aria-label="刷新存储状态"><RefreshCw size={17} /></button></div>
        {status.cleanup_history.length ? <div className="cleanup-history-list">{status.cleanup_history.map((run) => <div className="cleanup-history-row" key={run.id}><span>{new Date(run.completed_at).toLocaleString()}</span><strong>{run.trigger === "automatic" ? "自动清理" : "手动清理"}</strong><span>{run.files_removed} 个音频</span><span>{formatBytes(run.bytes_freed)}</span><span className={run.status === "completed" ? "cleanup-success" : "cleanup-partial"}>{run.status === "completed" ? "完成" : "部分失败"}</span></div>)}</div> : <div className="cleanup-history-empty">清理执行后，结果会记录在这里。</div>}
      </section>

      {preview && <div className="storage-modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) closePreview(); }}><div ref={dialogRef} className="storage-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="cleanup-confirm-title" tabIndex={-1}><div className="storage-confirm-icon"><Trash2 size={22} /></div><h3 id="cleanup-confirm-title">确认本次清理</h3><div className="storage-preview-metrics"><div><span>音频文件</span><strong>{preview.file_count} 个</strong></div><div><span>预计释放</span><strong>{formatBytes(preview.bytes_to_free)}</strong></div><div><span>{preview.cleanup_scope === "jobs" ? "删除记录" : "保留记录"}</span><strong>{preview.cleanup_scope === "jobs" ? `${preview.job_count} 条` : `${preview.jobs_preserved} 条`}</strong></div></div><p>{preview.file_count || preview.job_count ? (preview.cleanup_scope === "jobs" ? "音频和对应任务记录将永久删除，此操作无法撤销。" : "音频清理后无法恢复，文字记录和生成参数会继续保留。") : "当前没有符合存储策略的文件。"}</p><div className="storage-confirm-actions"><button className="secondary-button" type="button" onClick={closePreview} disabled={working === "cleanup"}>取消</button><button className={preview.cleanup_scope === "jobs" ? "danger-button" : "primary-button compact"} type="button" onClick={() => void cleanNow()} disabled={working === "cleanup" || (!preview.file_count && !preview.job_count)}>{working === "cleanup" ? "正在清理..." : "确认清理"}</button></div></div></div>}
    </div>
  );
}

function ProviderSettings({ models, panelId, labelledBy }: { models: Model[]; panelId?: string; labelledBy?: string }) {
  const confirm = useConfirm();
  const [specs, setSpecs] = useState<Record<string, ProviderSpec>>({});
  const [accounts, setAccounts] = useState<ProviderAccount[]>([]);
  const [provider, setProvider] = useState("dashscope");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [projects, setProjects] = useState<ProviderProject[]>([]);
  const [projectInput, setProjectInput] = useState("");
  const [projectsWorking, setProjectsWorking] = useState(false);
  const [showProjectAdd, setShowProjectAdd] = useState(false);
  const [copiedProject, setCopiedProject] = useState("");
  const [form, setForm] = useState({
    display_name: "",
    api_key: "",
    endpoint: "",
    openapi_access_key: "",
    openapi_secret_key: "",
    project_name: "",
  });
  const spec = specs[provider];

  const loadAccounts = () =>
    api<ProviderAccount[]>("/api/provider-accounts").then(setAccounts);
  useEffect(() => {
    Promise.all([
      api<Record<string, ProviderSpec>>("/api/provider-specs"),
      api<ProviderAccount[]>("/api/provider-accounts"),
    ])
      .then(([nextSpecs, nextAccounts]) => {
        setSpecs(nextSpecs);
        setAccounts(nextAccounts);
      })
      .catch(() => setMessage("无法读取厂商配置"));
  }, []);
  useEffect(() => {
    if (!spec) return;
    const account = accounts.find((item) => item.provider === provider);
    setEditingId(account?.id || null);
    setForm({
      display_name: account?.display_name || spec.display_name + " 默认账号",
      api_key: "",
      endpoint: account?.endpoint || spec.default_endpoint,
      openapi_access_key: "",
      openapi_secret_key: "",
      project_name: account?.project_name || "",
    });
    setShowKey(false);
  }, [provider, accounts, spec]);

  const loadProjects = async (accountId = editingId) => {
    if (!accountId || provider !== "volcengine") {
      setProjects([]);
      return;
    }
    try {
      const result = await api<{ projects: ProviderProject[] }>(
        `/api/provider-accounts/${encodeURIComponent(accountId)}/projects`,
      );
      setProjects(result.projects);
    } catch {
      setProjects([]);
    }
  };
  useEffect(() => {
    void loadProjects(editingId);
    setProjectInput("");
    setShowProjectAdd(false);
    setCopiedProject("");
    // Account selection determines the project list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId, provider]);

  const chooseAccount = (account?: ProviderAccount) => {
    setEditingId(account?.id || null);
    setForm({
      display_name:
        account?.display_name || (spec?.display_name || "") + " 新账号",
      api_key: "",
      endpoint: account?.endpoint || spec?.default_endpoint || "",
      openapi_access_key: "",
      openapi_secret_key: "",
      project_name: "",
    });
    setMessage("");
  };
  const save = async () => {
    if (!form.display_name.trim() || (!editingId && !form.api_key.trim())) {
      setMessage("请填写账号名称和 API Key");
      return;
    }
    setWorking(true);
    setMessage("");
    try {
      const url = editingId
        ? "/api/provider-accounts/" + editingId
        : "/api/provider-accounts";
      const method = editingId ? "PUT" : "POST";
      const saved = await api<ProviderAccount>(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          ...form,
          api_key: form.api_key || null,
        }),
      });
      await loadAccounts();
      setEditingId(saved.id);
      setForm((current) => ({ ...current, api_key: "" }));
      setMessage("凭据已写入系统密钥环");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存失败");
    } finally {
      setWorking(false);
    }
  };
  const verify = async () => {
    if (!editingId) return;
    setWorking(true);
    setMessage("正在检查凭据...");
    try {
      const checked = await api<ProviderAccount>(
        "/api/provider-accounts/" + editingId + "/test",
        { method: "POST" },
      );
      await loadAccounts();
      setMessage(checked.verification_message || "检查完成");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "检查失败");
    } finally {
      setWorking(false);
    }
  };
  const syncProjects = async () => {
    if (!editingId) return;
    setProjectsWorking(true);
    setMessage("正在同步火山项目...");
    try {
      const result = await api<{
        projects: ProviderProject[];
        synced: number;
        keys_synced: number;
        projects_with_api_key: number;
      }>(
        `/api/provider-accounts/${encodeURIComponent(editingId)}/projects/sync`,
        { method: "POST" },
      );
      setProjects(result.projects);
      setMessage(`已同步 ${result.synced} 个项目，其中 ${result.projects_with_api_key} 个项目已有可用 API Key。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "项目同步失败");
    } finally {
      setProjectsWorking(false);
    }
  };
  const addProject = async () => {
    if (!editingId || !projectInput.trim()) return;
    setProjectsWorking(true);
    try {
      const created = await api<ProviderProject>(
        `/api/provider-accounts/${encodeURIComponent(editingId)}/projects`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ project_name: projectInput.trim() }),
        },
      );
      setProjects((current) => [...current, created].sort((a, b) => a.display_name.localeCompare(b.display_name)));
      setProjectInput("");
      setShowProjectAdd(false);
      setMessage("项目已添加。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "添加项目失败");
    } finally {
      setProjectsWorking(false);
    }
  };
  const removeProject = async (project: ProviderProject) => {
    if (!editingId) return;
    const accepted = await confirm({
      title: `删除项目“${project.display_name}”？`,
      description: "只会从 Voice Hub 的本地项目列表中移除，不会删除火山引擎中的远端项目。",
      confirmLabel: "删除项目",
      destructive: true,
    });
    if (!accepted) return;
    setProjectsWorking(true);
    try {
      await api(`/api/provider-accounts/${encodeURIComponent(editingId)}/projects/${encodeURIComponent(project.id)}`, { method: "DELETE" });
      setProjects((current) => current.filter((item) => item.id !== project.id));
      setMessage("项目已删除。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "删除项目失败");
    } finally {
      setProjectsWorking(false);
    }
  };
  const copyProjectName = async (projectName: string) => {
    try {
      await navigator.clipboard.writeText(projectName);
      setCopiedProject(projectName);
      window.setTimeout(() => setCopiedProject(""), 1600);
    } catch {
      setMessage("ProjectName 复制失败");
    }
  };
  const remove = async () => {
    if (!editingId) return;
    const accepted = await confirm({
      title: "删除这个厂商账号？",
      description: "账号配置及系统密钥环中的对应凭据会一并删除。",
      confirmLabel: "删除账号",
      destructive: true,
    });
    if (!accepted) return;
    setWorking(true);
    try {
      await api("/api/provider-accounts/" + editingId, { method: "DELETE" });
      await loadAccounts();
      setMessage("账号与本机凭据已删除");
    } catch {
      setMessage("删除失败");
    } finally {
      setWorking(false);
    }
  };
  const providerAccounts = accounts.filter(
    (item) => item.provider === provider,
  );
  const current = accounts.find((item) => item.id === editingId);

  return (
    <div id={panelId} className="settings-page" role={panelId ? "tabpanel" : undefined} aria-labelledby={labelledBy} tabIndex={panelId ? 0 : undefined}>
      <div>
        <h2>厂商账号与 API 凭据</h2>
        <p className="settings-lead">
          API Key 直接写入系统密钥环。页面和 SQLite
          只保存脱敏后缀与 Endpoint，不会回显完整密钥。
        </p>
      </div>
      <div className="credential-layout">
        <div className="provider-rail">
          <ProviderSelector
            className="settings-provider-selector"
            label="厂商账号"
            value={provider}
            onChange={setProvider}
            options={credentialProviderIds.map((id) => {
              const count = accounts.filter((item) => item.provider === id).length;
              const active = accounts.some((item) => item.provider === id && item.status === "active");
              return {
                id,
                label: providerMeta[id].label,
                mark: providerMeta[id].mark,
                tone: providerMeta[id].tone,
                detail: `${models.filter((item) => item.provider === id).length} 个模型 · ${count ? `${count} 个账号` : "未配置"}`,
                indicator: active ? "active" as const : count ? "saved" as const : "idle" as const,
              };
            })}
          />
          <div className="security-note">
            <ShieldCheck size={16} />
            <span>
              密钥由当前系统用户的密钥环加密保存，其他系统账号无法直接读取。
            </span>
          </div>
        </div>
        <div className="credential-editor">
          <div className="editor-title">
            <div>
              <h3>{spec?.display_name || provider}</h3>
            </div>
            <div className="credential-status">
              {current ? (
                <>
                  <span className={"status-chip " + current.status}>
                    {current.status === "active"
                      ? "已鉴权"
                      : current.status === "error"
                        ? "检查失败"
                        : "已保存"}
                  </span>
                  <code>{current.secret_hint}</code>
                </>
              ) : (
                <span className="status-chip empty">尚未配置</span>
              )}
            </div>
          </div>
          {providerAccounts.length > 0 && (
            <div className="account-switcher">
              {providerAccounts.map((account) => (
                <button
                  className={editingId === account.id ? "selected" : ""}
                  onClick={() => chooseAccount(account)}
                  key={account.id}
                >
                  {account.display_name}
                </button>
              ))}
              <button
                className={!editingId ? "selected add" : "add"}
                onClick={() => chooseAccount()}
              >
                <Plus size={13} />
                新账号
              </button>
            </div>
          )}
          <div className="credential-form">
            <div className="field full">
              <label>配置名称</label>
              <input
                value={form.display_name}
                onChange={(event) =>
                  setForm({ ...form, display_name: event.target.value })
                }
                placeholder="例如：个人账号"
              />
            </div>
            <div className="field full">
              <label>Endpoint</label>
              <input
                value={form.endpoint}
                onChange={(event) =>
                  setForm({ ...form, endpoint: event.target.value })
                }
                placeholder={spec?.default_endpoint}
              />
              <small>{spec?.endpoint_note}，通常无需修改。</small>
            </div>
            <div className="field full">
              <label>{spec?.secret_label || "API Key"}</label>
              <div className="secret-input">
                <input
                  type={showKey ? "text" : "password"}
                  value={form.api_key}
                  onChange={(event) =>
                    setForm({ ...form, api_key: event.target.value })
                  }
                  autoComplete="new-password"
                  placeholder={
                    current
                      ? "留空则继续使用 " + current.secret_hint
                      : "粘贴后将直接写入系统密钥环"
                  }
                />
                <button
                  onClick={() => setShowKey(!showKey)}
                  title={showKey ? "隐藏密钥" : "显示密钥"}
                >
                  {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {provider === "dashscope" && (
                <small>
                  语音模型需要标准 sk- Key；sk-sp- Token Plan Key 不支持 TTS。
                </small>
              )}
            </div>
            {provider === "volcengine" && (
              <>
                <div className="field full">
                  <label>OpenAPI Access Key ID（IAM AK）</label>
                  <input
                    value={form.openapi_access_key}
                    onChange={(event) => setForm({ ...form, openapi_access_key: event.target.value })}
                    placeholder={current?.openapi_access_key_hint ? "留空则继续使用 " + current.openapi_access_key_hint : "填写 IAM 中生成的 Access Key ID，不是 Access Token"}
                    autoComplete="off"
                  />
                </div>
                <div className="field full">
                  <label>OpenAPI Secret Access Key（IAM SK）</label>
                  <div className="secret-input">
                    <input
                      type={showKey ? "text" : "password"}
                      value={form.openapi_secret_key}
                      onChange={(event) => setForm({ ...form, openapi_secret_key: event.target.value })}
                      placeholder={current?.has_openapi_secret ? "留空则继续使用已保存的 Secret" : "填写 IAM 中生成的 Secret Access Key"}
                      autoComplete="new-password"
                    />
                  </div>
                </div>
                <section className="provider-projects-field" aria-labelledby="provider-projects-title">
                  <div className="provider-projects-head">
                    <div className="provider-projects-heading">
                      <div>
                        <h4 id="provider-projects-title">项目管理</h4>
                        <p>声音克隆、音色同步和空槽位都会按所选项目查询。</p>
                      </div>
                      <span>{projects.length} 个项目</span>
                    </div>
                    <div className="provider-projects-actions">
                      <button
                        className="secondary-button compact"
                        type="button"
                        onClick={() => void syncProjects()}
                        disabled={!editingId || projectsWorking}
                      >
                        <RefreshCw size={16} className={projectsWorking ? "spinning" : ""} />
                        同步项目与密钥
                      </button>
                      <button
                        className={showProjectAdd ? "secondary-button compact active" : "secondary-button compact"}
                        type="button"
                        onClick={() => setShowProjectAdd((currentValue) => !currentValue)}
                        disabled={!editingId || projectsWorking}
                        aria-expanded={showProjectAdd}
                      >
                        <Plus size={16} />
                        添加项目
                      </button>
                    </div>
                  </div>

                  {showProjectAdd && (
                    <div className="provider-project-add">
                      <div>
                        <label htmlFor="manual-project-name">ProjectName</label>
                        <input
                          id="manual-project-name"
                          value={projectInput}
                          onChange={(event) => setProjectInput(event.target.value)}
                          onKeyDown={(event) => { if (event.key === "Enter") void addProject(); }}
                          placeholder="例如 default"
                          disabled={!editingId || projectsWorking}
                          autoFocus
                        />
                      </div>
                      <button
                        className="primary-button compact"
                        type="button"
                        onClick={() => void addProject()}
                        disabled={!editingId || projectsWorking || !projectInput.trim()}
                      >
                        确认添加
                      </button>
                      <p>仅在 IAM 无权读取项目时手动添加；这里填写的是 ProjectName。</p>
                    </div>
                  )}

                  <div className="provider-project-list">
                    {projects.map((project) => {
                      const isDefault = project.project_name === "default";
                      const displayName = isDefault
                        ? "默认项目"
                        : project.display_name === project.project_name && project.project_name.startsWith("volcengine_standalone_project_")
                          ? "平台项目"
                        : project.display_name || project.project_name;
                      const showTechnicalName = displayName !== project.project_name;
                      const sourceLabel = project.source === "manual"
                        ? "手动添加"
                        : project.source === "legacy"
                          ? "旧配置"
                          : "IAM 同步";
                      const apiKeyStatus = project.api_key_status || "unknown";
                      const apiKeyLabel = apiKeyStatus === "available"
                        ? "API Key 可用"
                        : apiKeyStatus === "missing"
                          ? "未创建 API Key"
                          : apiKeyStatus === "error"
                            ? "密钥同步失败"
                            : "密钥未同步";
                      const apiKeyTitle = apiKeyStatus === "available"
                        ? [project.api_key_name, project.api_key_hint, project.api_key_count && project.api_key_count > 1 ? `${project.api_key_count} 个可用 Key，已自动选择最新一个` : ""].filter(Boolean).join(" · ")
                        : project.api_key_sync_error || apiKeyLabel;
                      return (
                        <div className="provider-project-row" key={project.id}>
                          <div className="provider-project-identity">
                            <strong title={displayName}>{displayName}</strong>
                            {showTechnicalName && <code title={project.project_name}>{project.project_name}</code>}
                          </div>
                          <div className="provider-project-meta">
                            {project.has_permission === false && <span className="project-permission denied">无权限</span>}
                            <span className={`project-key-status ${apiKeyStatus}`} title={apiKeyTitle}>{apiKeyLabel}</span>
                            <span>{sourceLabel}</span>
                          </div>
                          <div className="provider-project-row-actions">
                            <button
                              className="icon-button"
                              type="button"
                              title="复制 ProjectName"
                              aria-label={`复制 ProjectName ${project.project_name}`}
                              onClick={() => void copyProjectName(project.project_name)}
                            >
                              {copiedProject === project.project_name ? <Check size={16} /> : <Copy size={16} />}
                            </button>
                            <button
                              className="icon-button project-delete-button"
                              type="button"
                              title="从本地项目列表删除"
                              aria-label={`删除项目 ${displayName}`}
                              onClick={() => void removeProject(project)}
                              disabled={projectsWorking}
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                    {!projects.length && (
                      <div className="provider-project-empty">
                        保存凭据后同步项目，或手动添加 ProjectName。
                      </div>
                    )}
                  </div>
                </section>
              </>
            )}
          </div>
          {current?.verification_message && (
            <div className={"verification-message " + current.status}>
              <Activity size={15} />
              <span>
                {current.verification_message}
                {current.last_verified_at && (
                  <small>
                    {new Date(current.last_verified_at).toLocaleString()}
                  </small>
                )}
              </span>
            </div>
          )}
          {message && <div className="form-message" role="status" aria-live="polite">{message}</div>}
          <div className="credential-actions">
            {editingId && (
              <button
                className="danger-button"
                onClick={remove}
                disabled={working}
                title="删除账号"
              >
                <Trash2 size={16} />
              </button>
            )}
            <div className="action-spacer" />
            <button
              className="secondary-button"
              onClick={verify}
              disabled={!editingId || working}
            >
              <Activity size={16} />
              {provider === "dashscope" ||
              provider === "mimo" ||
              provider === "volcengine" ||
              provider === "minimax"
                ? "验证鉴权"
                : "检查保存"}
            </button>
            <button
              className="primary-button compact"
              onClick={save}
              disabled={working}
            >
              <Save size={16} />
              {working ? "处理中..." : editingId ? "保存修改" : "保存账号"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
