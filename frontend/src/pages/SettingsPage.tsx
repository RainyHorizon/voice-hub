import { useEffect, useState, type ComponentProps, type ReactNode } from "react";
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
  Save,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useConfirm } from "@/components/feedback/ConfirmProvider";
import { cn } from "@/lib/utils";
import { api } from "../api";
import { ProviderMark } from "../components/ProviderMark";
import { Field, Note } from "../components/form/Field";
import { PageHeader } from "../components/layout/PageHeader";
import { useStudio } from "../context/StudioContext";
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

type Section = "providers" | "storage" | "environment";

const segmentItem = "h-8 flex-1 rounded-sm px-3 text-[13px] data-[state=on]:bg-card data-[state=on]:text-foreground data-[state=on]:shadow-sm";

export function SettingsPage() {
  const { models, refreshJobs: onJobsChanged } = useStudio();
  const [section, setSection] = useState<Section>("providers");
  return (
    <section>
      <PageHeader title="设置" description="统一管理厂商凭据、生成文件存储策略和本机运行环境。" />
      <Tabs value={section} onValueChange={(value) => setSection(value as Section)} className="gap-5">
        <div className="-mx-1 overflow-x-auto px-1">
          <TabsList aria-label="设置分类">
            <TabsTrigger value="providers" className="px-4"><KeyRound />厂商账号</TabsTrigger>
            <TabsTrigger value="storage" className="px-4"><HardDrive />存储与清理</TabsTrigger>
            <TabsTrigger value="environment" className="px-4"><ShieldCheck />运行环境</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="providers"><ProviderSettings models={models} /></TabsContent>
        <TabsContent value="storage"><StorageSettings onJobsChanged={onJobsChanged} /></TabsContent>
        <TabsContent value="environment"><EnvironmentSettings /></TabsContent>
      </Tabs>
    </section>
  );
}

function StateIcon({ status, className }: { status: "ok" | "warning" | "error"; className?: string }) {
  const Icon = status === "ok" ? Check : status === "warning" ? CircleHelp : X;
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center rounded-full",
        status === "ok" && "bg-emerald-50 text-emerald-600",
        status === "warning" && "bg-amber-50 text-amber-600",
        status === "error" && "bg-destructive/10 text-destructive",
        className,
      )}
    >
      <Icon className="size-[55%]" />
    </span>
  );
}

function LoadingIsland({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="island flex flex-col items-center gap-3 px-6 py-16 text-center text-sm text-muted-foreground">
      <RefreshCw className="size-5 animate-spin text-brand" />
      <span>{children}</span>
      {action}
    </div>
  );
}

function StatusLine({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "error" }) {
  return (
    <p
      role="status"
      aria-live="polite"
      className={cn(
        "m-0 flex items-start gap-2 rounded-md px-3 py-2.5 text-sm",
        tone === "error" ? "bg-destructive/10 text-destructive" : "bg-accent/60 text-accent-foreground",
      )}
    >
      <Activity className="mt-0.5 size-4 shrink-0" />
      <span className="min-w-0 break-words">{children}</span>
    </p>
  );
}

function EnvironmentSettings() {
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
    return <LoadingIsland>正在检查运行环境...</LoadingIsland>;
  }
  return (
    <div className="flex flex-col gap-6">
      <div className="island flex flex-col gap-5 p-6 md:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="m-0 text-base font-semibold text-foreground">运行环境</h2>
            <p className="mt-1 mb-0 text-sm text-muted-foreground">检查语音生成、音频转换和凭据保存所需的本机组件。</p>
          </div>
          <Button variant="outline" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={cn(loading && "animate-spin")} />
            重新检查
          </Button>
        </div>
        {diagnostics && (
          <div
            className={cn(
              "flex items-center gap-4 rounded-lg p-4",
              diagnostics.status === "ok" && "bg-emerald-50/70",
              diagnostics.status === "warning" && "bg-amber-50/70",
              diagnostics.status === "error" && "bg-destructive/5",
            )}
          >
            <StateIcon status={diagnostics.status} className="size-11" />
            <div className="min-w-0">
              <strong className="block text-[15px] font-semibold text-foreground">
                {diagnostics.status === "error" ? `${diagnostics.required_failures} 项需要处理` : diagnostics.status === "warning" ? "核心环境可用" : "运行环境正常"}
              </strong>
              <span className="block truncate font-mono text-xs text-muted-foreground">{diagnostics.base_url} · {diagnostics.platform} 本地服务</span>
            </div>
          </div>
        )}
        {message && <StatusLine tone="error">{message}</StatusLine>}
      </div>
      {diagnostics && (
        <ul className="m-0 grid list-none gap-4 p-0 md:grid-cols-2 xl:grid-cols-3">
          {diagnostics.checks.map((item) => (
            <li key={item.id} className="island flex min-w-0 flex-col gap-3 p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <StateIcon status={item.status === "ok" ? "ok" : item.status === "warning" ? "warning" : "error"} className="size-8" />
                  <strong className="truncate text-sm font-semibold text-foreground">{item.label}</strong>
                </div>
                <code
                  className={cn(
                    "max-w-[45%] shrink-0 truncate rounded-full px-2 py-0.5 font-mono text-[11px]",
                    item.status === "ok" ? "bg-muted text-soft" : item.status === "warning" ? "bg-amber-50 text-amber-700" : "bg-destructive/10 text-destructive",
                  )}
                  title={item.version || undefined}
                >
                  {item.version || (item.status === "warning" ? "可选" : "未通过")}
                </code>
              </div>
              <p className="m-0 text-xs leading-relaxed break-words text-muted-foreground">{item.detail}</p>
            </li>
          ))}
        </ul>
      )}
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

function NumberWithUnit({ id, unit, ...props }: ComponentProps<typeof Input> & { unit: string }) {
  return (
    <div className="relative">
      <Input id={id} type="number" className="pr-12 font-mono tabular-nums" {...props} />
      <span className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-sm text-muted-foreground">{unit}</span>
    </div>
  );
}

function StorageSettings({ onJobsChanged }: { onJobsChanged: () => Promise<void> }) {
  const [status, setStatus] = useState<StorageStatus | null>(null);
  const [draft, setDraft] = useState<StoragePolicyDraft | null>(null);
  const [preview, setPreview] = useState<CleanupPreview | null>(null);
  const [working, setWorking] = useState<"" | "loading" | "saving" | "preview" | "cleanup" | "directory">("loading");
  const [message, setMessage] = useState("");
  const closePreview = () => {
    if (working !== "cleanup") setPreview(null);
  };

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
    if (showMessage) toast.success("存储策略已保存");
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
      toast.success(response.result.files_removed || response.result.jobs_removed
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
      if (result.opened) toast.success("已打开音频存储目录");
      else setMessage(`${result.message || "请手动打开音频存储目录"} 路径：${result.path}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "无法打开存储目录");
    } finally {
      setWorking("");
    }
  };

  if (!status || !draft) {
    return (
      <LoadingIsland action={message ? <Button variant="outline" size="sm" onClick={() => void load()}>重试</Button> : undefined}>
        {message || "正在读取存储状态..."}
      </LoadingIsland>
    );
  }

  const usagePercent = Math.min(100, Math.max(0, status.usage.capacity_ratio * 100));
  const latest = status.cleanup_history[0];
  const destructiveScope = draft.cleanup_scope === "jobs";
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(300px,360px)]">
      <div className="flex min-w-0 flex-col gap-6">
        <section aria-labelledby="storage-policy-title" className="island flex flex-col gap-6 p-6 md:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 id="storage-policy-title" className="m-0 text-base font-semibold text-foreground">生成文件存储</h2>
              <p className="mt-1 mb-0 max-w-xl text-sm leading-relaxed text-muted-foreground">控制任务音频的保留时间和磁盘占用。音色库、API 凭据与语音克隆素材不会被自动清理。</p>
            </div>
            <Button variant="outline" onClick={() => void openDirectory()} disabled={Boolean(working)}>
              <FolderOpen />
              打开目录
            </Button>
          </div>

          <div className="flex items-center justify-between gap-4 rounded-lg border bg-muted/30 p-4">
            <div className="min-w-0">
              <label htmlFor="storage-auto" className="block text-sm font-semibold text-foreground">自动清理</label>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {draft.automatic_enabled
                  ? (status.cleanup_history.some((run) => run.trigger === "automatic") && status.next_cleanup_at ? `下次检查 ${new Date(status.next_cleanup_at).toLocaleString()}` : "等待首次自动检查")
                  : "关闭后仍可使用立即清理"}
              </span>
            </div>
            <Switch
              id="storage-auto"
              checked={draft.automatic_enabled}
              onCheckedChange={(checked) => setDraft({ ...draft, automatic_enabled: checked })}
            />
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <Field label="自动保留天数" htmlFor="retention-days" hint="超过保留时间的音频会进入清理范围。">
              <NumberWithUnit
                id="retention-days"
                unit="天"
                min="1"
                max="3650"
                value={draft.retention_days}
                onChange={(event) => setDraft({ ...draft, retention_days: Number(event.target.value) })}
              />
            </Field>
            <Field label="容量上限" htmlFor="capacity-limit" hint="超出上限后优先清理最旧的音频。">
              <NumberWithUnit
                id="capacity-limit"
                unit="GB"
                min="0.1"
                max="10240"
                step="0.1"
                value={draft.capacity_gb}
                onChange={(event) => setDraft({ ...draft, capacity_gb: Number(event.target.value) })}
              />
            </Field>
            <Field label="检查频率" hint="程序启动时也会检查是否到期。">
              <ToggleGroup
                type="single"
                value={draft.interval}
                onValueChange={(value) => value && setDraft({ ...draft, interval: value as StoragePolicyDraft["interval"] })}
                aria-label="检查频率"
                className="w-full rounded-md bg-muted p-1"
              >
                <ToggleGroupItem value="daily" className={segmentItem}>每天</ToggleGroupItem>
                <ToggleGroupItem value="weekly" className={segmentItem}>每周</ToggleGroupItem>
              </ToggleGroup>
            </Field>
            <Field
              label="清理范围"
              hint={<span className={cn(destructiveScope && "text-destructive")}>{destructiveScope ? "到期任务将从任务历史中永久删除。" : "文字和生成参数会继续保留。"}</span>}
            >
              <ToggleGroup
                type="single"
                value={draft.cleanup_scope}
                onValueChange={(value) => value && setDraft({ ...draft, cleanup_scope: value as StoragePolicyDraft["cleanup_scope"] })}
                aria-label="清理范围"
                className="w-full rounded-md bg-muted p-1"
              >
                <ToggleGroupItem value="audio_only" className={segmentItem}>只清理音频</ToggleGroupItem>
                <ToggleGroupItem value="jobs" className={cn(segmentItem, "data-[state=on]:text-destructive")}>音频和任务记录</ToggleGroupItem>
              </ToggleGroup>
            </Field>
          </div>

          {destructiveScope && (
            <Note icon={<ShieldCheck />} className="bg-destructive/10 text-destructive">
              当前策略会永久删除任务记录。建议先使用批量导出备份重要内容。
            </Note>
          )}
          {message && <StatusLine tone="error">{message}</StatusLine>}

          <div className="flex flex-col gap-3 border-t pt-5 sm:flex-row sm:items-center">
            <span className="min-w-0 flex-1 text-xs text-muted-foreground">
              {latest ? <>最近清理：{new Date(latest.completed_at).toLocaleString()} · 释放 {formatBytes(latest.bytes_freed)}</> : "尚未执行过清理"}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => void showCleanupPreview()} disabled={Boolean(working)}>
                <Trash2 />
                {working === "preview" ? "正在计算..." : "立即清理"}
              </Button>
              <Button onClick={() => void save()} disabled={Boolean(working) || !dirty}>
                <Save />
                {working === "saving" ? "保存中..." : "保存设置"}
              </Button>
            </div>
          </div>
        </section>
      </div>

      <aside className="flex min-w-0 flex-col gap-6">
        <section aria-label="存储空间概览" className="island flex flex-col gap-4 p-6">
          <div className="flex items-center gap-2 text-sm font-medium text-soft">
            <HardDrive className="size-4 text-brand" />
            当前占用
          </div>
          <div className="flex items-baseline gap-1.5">
            <strong className="font-mono text-2xl font-semibold text-foreground tabular-nums">{formatBytes(status.usage.audio_bytes)}</strong>
            <span className="text-sm text-muted-foreground">/ {formatBytes(status.policy.capacity_limit_bytes)}</span>
          </div>
          <Progress value={usagePercent} aria-label={`已使用 ${usagePercent.toFixed(0)}%`} className={cn(usagePercent >= 90 && "[&>[data-slot=progress-indicator]]:bg-destructive")} />
          <dl className="m-0 grid grid-cols-3 gap-2 text-center">
            <UsageStat label="个音频" value={status.usage.audio_count} />
            <UsageStat label="条任务记录" value={status.usage.job_count} />
            <UsageStat label="最早音频" value={status.usage.oldest_audio_at ? new Date(status.usage.oldest_audio_at).toLocaleDateString() : "--"} />
          </dl>
        </section>

        <section aria-labelledby="cleanup-history-title" className="island flex flex-col gap-3 p-6">
          <div className="flex items-center justify-between gap-3">
            <h3 id="cleanup-history-title" className="m-0 text-sm font-semibold text-foreground">清理记录</h3>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon-sm" onClick={() => void load()} disabled={Boolean(working)} aria-label="刷新存储状态">
                  <RefreshCw className={cn(working === "loading" && "animate-spin")} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>刷新存储状态</TooltipContent>
            </Tooltip>
          </div>
          {status.cleanup_history.length ? (
            <ul className="m-0 flex list-none flex-col divide-y p-0">
              {status.cleanup_history.map((run) => (
                <li key={run.id} className="flex items-center gap-3 py-2.5 text-xs">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-foreground">{run.trigger === "automatic" ? "自动清理" : "手动清理"}</div>
                    <div className="truncate text-muted-foreground">{new Date(run.completed_at).toLocaleString()}</div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="font-mono text-foreground tabular-nums">{formatBytes(run.bytes_freed)}</div>
                    <div className="text-muted-foreground">{run.files_removed} 个音频</div>
                  </div>
                  <Badge className={cn("shrink-0 rounded-full px-2 text-[11px]", run.status === "completed" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700")}>
                    {run.status === "completed" ? "完成" : "部分失败"}
                  </Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="m-0 py-4 text-center text-xs text-muted-foreground">清理执行后，结果会记录在这里。</p>
          )}
        </section>
      </aside>

      <AlertDialog open={Boolean(preview)} onOpenChange={(open) => !open && closePreview()}>
        <AlertDialogContent onEscapeKeyDown={(event) => working === "cleanup" && event.preventDefault()}>
          {preview && (
            <>
              <AlertDialogHeader>
                <AlertDialogMedia className={cn("size-12 rounded-full", preview.cleanup_scope === "jobs" ? "bg-destructive/10 text-destructive" : "bg-accent text-brand")}>
                  <Trash2 className="size-5" />
                </AlertDialogMedia>
                <AlertDialogTitle>确认本次清理</AlertDialogTitle>
                <AlertDialogDescription>
                  {preview.file_count || preview.job_count
                    ? (preview.cleanup_scope === "jobs" ? "音频和对应任务记录将永久删除，此操作无法撤销。" : "音频清理后无法恢复，文字记录和生成参数会继续保留。")
                    : "当前没有符合存储策略的文件。"}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <dl className="m-0 grid grid-cols-3 gap-2">
                <UsageStat label="音频文件" value={`${preview.file_count} 个`} />
                <UsageStat label="预计释放" value={formatBytes(preview.bytes_to_free)} />
                <UsageStat
                  label={preview.cleanup_scope === "jobs" ? "删除记录" : "保留记录"}
                  value={preview.cleanup_scope === "jobs" ? `${preview.job_count} 条` : `${preview.jobs_preserved} 条`}
                />
              </dl>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={working === "cleanup"}>取消</AlertDialogCancel>
                <Button
                  variant={preview.cleanup_scope === "jobs" ? "destructive" : "default"}
                  onClick={() => void cleanNow()}
                  disabled={working === "cleanup" || (!preview.file_count && !preview.job_count)}
                >
                  {working === "cleanup" ? "正在清理..." : "确认清理"}
                </Button>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function UsageStat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col-reverse gap-0.5 rounded-md bg-muted/60 px-2 py-2.5 text-center">
      <dt className="truncate text-[11px] text-muted-foreground">{label}</dt>
      <dd className="m-0 truncate font-mono text-sm font-semibold text-foreground tabular-nums">{value}</dd>
    </div>
  );
}

function ProviderSettings({ models }: { models: Model[] }) {
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
      toast.success("凭据已写入系统密钥环");
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
      toast.success("项目已添加");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "添加项目失败");
    } finally {
      setProjectsWorking(false);
    }
  };
  const removeProject = async (project: ProviderProject) => {
    if (!editingId) return;
    if (!(await confirm({ title: `删除项目“${project.display_name}”？`, description: "只会从 Voice Hub 中移除该项目记录。", confirmLabel: "删除", destructive: true }))) return;
    setProjectsWorking(true);
    try {
      await api(`/api/provider-accounts/${encodeURIComponent(editingId)}/projects/${encodeURIComponent(project.id)}`, { method: "DELETE" });
      setProjects((current) => current.filter((item) => item.id !== project.id));
      toast.success("项目已删除");
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
      toast.success("已复制 ProjectName", { description: projectName });
      window.setTimeout(() => setCopiedProject(""), 1600);
    } catch {
      setMessage("ProjectName 复制失败");
    }
  };
  const remove = async () => {
    if (!editingId) return;
    if (!(await confirm({ title: "删除这个账号？", description: "账号及其保存在系统密钥环中的凭据会一并删除。", confirmLabel: "删除", destructive: true }))) return;
    setWorking(true);
    try {
      await api("/api/provider-accounts/" + editingId, { method: "DELETE" });
      await loadAccounts();
      toast.success("账号与本机凭据已删除");
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
  const verifyLabel = provider === "dashscope" || provider === "mimo" || provider === "volcengine" || provider === "minimax"
    ? "验证鉴权"
    : "检查保存";
  const statusTone = current?.status === "active"
    ? "bg-emerald-50 text-emerald-700"
    : current?.status === "error"
      ? "bg-destructive/10 text-destructive"
      : current
        ? "bg-accent text-accent-foreground"
        : "bg-muted text-muted-foreground";
  const messageIsError = /失败|无法|请填写/.test(message);

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(240px,300px)_minmax(0,1fr)]">
      <aside className="flex min-w-0 flex-col gap-4">
        <div className="island flex flex-col gap-1 p-2" role="group" aria-label="厂商账号">
          {credentialProviderIds.map((id) => {
            const count = accounts.filter((item) => item.provider === id).length;
            const active = accounts.some((item) => item.provider === id && item.status === "active");
            const selected = provider === id;
            return (
              <button
                key={id}
                type="button"
                aria-pressed={selected}
                onClick={() => setProvider(id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50",
                  selected ? "bg-accent" : "hover:bg-muted/70",
                )}
              >
                <ProviderMark provider={id} className="size-9 rounded-md text-sm" />
                <span className="min-w-0 flex-1">
                  <span className={cn("block truncate text-sm font-medium", selected ? "text-accent-foreground" : "text-foreground")}>{providerMeta[id].label}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {models.filter((item) => item.provider === id).length} 个模型 · {count ? `${count} 个账号` : "未配置"}
                  </span>
                </span>
                <span
                  aria-label={active ? "已鉴权" : count ? "已保存" : "未配置"}
                  className={cn("size-2 shrink-0 rounded-full", active ? "bg-emerald-500" : count ? "bg-brand" : "bg-slate-300")}
                />
              </button>
            );
          })}
        </div>
        <Note icon={<ShieldCheck />}>
          API Key 直接写入系统密钥环，由当前系统用户加密保存。页面和 SQLite 只保存脱敏后缀与 Endpoint，不会回显完整密钥。
        </Note>
      </aside>

      <section aria-labelledby="credential-title" className="island flex min-w-0 flex-col gap-6 p-6 md:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <ProviderMark provider={provider} className="size-10 rounded-md text-sm" />
            <h2 id="credential-title" className="m-0 truncate text-lg font-semibold text-foreground">{spec?.display_name || provider}</h2>
          </div>
          <div className="flex items-center gap-2">
            <Badge className={cn("rounded-full px-2.5 font-medium", statusTone)}>
              {current ? (current.status === "active" ? "已鉴权" : current.status === "error" ? "检查失败" : "已保存") : "尚未配置"}
            </Badge>
            {current && <code className="rounded-full bg-muted px-2.5 py-0.5 font-mono text-xs text-soft">{current.secret_hint}</code>}
          </div>
        </div>

        {providerAccounts.length > 0 && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="选择账号">
            {providerAccounts.map((account) => (
              <Button
                key={account.id}
                variant={editingId === account.id ? "secondary" : "outline"}
                size="sm"
                aria-pressed={editingId === account.id}
                className={cn("rounded-full", editingId === account.id && "bg-accent text-accent-foreground hover:bg-accent")}
                onClick={() => chooseAccount(account)}
              >
                {account.display_name}
              </Button>
            ))}
            <Button
              variant={!editingId ? "secondary" : "ghost"}
              size="sm"
              aria-pressed={!editingId}
              className={cn("rounded-full", !editingId && "bg-accent text-accent-foreground hover:bg-accent")}
              onClick={() => chooseAccount()}
            >
              <Plus />
              新账号
            </Button>
          </div>
        )}

        <form
          className="flex flex-col gap-5"
          autoComplete="off"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <div className="grid gap-5 md:grid-cols-2">
            <Field label="配置名称" htmlFor="credential-name">
              <Input
                id="credential-name"
                value={form.display_name}
                onChange={(event) => setForm({ ...form, display_name: event.target.value })}
                placeholder="例如：个人账号"
              />
            </Field>
            <Field label="Endpoint" htmlFor="credential-endpoint" hint={`${spec?.endpoint_note || "厂商默认地址"}，通常无需修改。`}>
              <Input
                id="credential-endpoint"
                value={form.endpoint}
                onChange={(event) => setForm({ ...form, endpoint: event.target.value })}
                placeholder={spec?.default_endpoint}
                className="font-mono text-[13px]"
              />
            </Field>
          </div>
          <Field
            label={spec?.secret_label || "API Key"}
            htmlFor="credential-secret"
            hint={provider === "dashscope" ? "语音模型需要标准 sk- Key；sk-sp- Token Plan Key 不支持 TTS。" : undefined}
          >
            <SecretInput
              id="credential-secret"
              visible={showKey}
              onToggle={() => setShowKey(!showKey)}
              value={form.api_key}
              onChange={(event) => setForm({ ...form, api_key: event.target.value })}
              autoComplete="new-password"
              placeholder={current ? "留空则继续使用 " + current.secret_hint : "粘贴后将直接写入系统密钥环"}
            />
          </Field>

          {provider === "volcengine" && (
            <>
              <div className="grid gap-5 md:grid-cols-2">
                <Field label="OpenAPI Access Key ID（IAM AK）" htmlFor="credential-ak">
                  <Input
                    id="credential-ak"
                    value={form.openapi_access_key}
                    onChange={(event) => setForm({ ...form, openapi_access_key: event.target.value })}
                    placeholder={current?.openapi_access_key_hint ? "留空则继续使用 " + current.openapi_access_key_hint : "填写 IAM 中生成的 Access Key ID，不是 Access Token"}
                    autoComplete="off"
                    className="font-mono text-[13px]"
                  />
                </Field>
                <Field label="OpenAPI Secret Access Key（IAM SK）" htmlFor="credential-sk">
                  <Input
                    id="credential-sk"
                    type={showKey ? "text" : "password"}
                    value={form.openapi_secret_key}
                    onChange={(event) => setForm({ ...form, openapi_secret_key: event.target.value })}
                    placeholder={current?.has_openapi_secret ? "留空则继续使用已保存的 Secret" : "填写 IAM 中生成的 Secret Access Key"}
                    autoComplete="new-password"
                    className="font-mono text-[13px]"
                  />
                </Field>
              </div>

              <section aria-labelledby="provider-projects-title" className="flex flex-col gap-4 rounded-lg border bg-muted/30 p-4 md:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 id="provider-projects-title" className="m-0 flex items-center gap-2 text-sm font-semibold text-foreground">
                      项目管理
                      <Badge className="rounded-full bg-card px-2 text-[11px] text-muted-foreground ring-1 ring-border">{projects.length} 个项目</Badge>
                    </h3>
                    <p className="mt-1 mb-0 text-xs text-muted-foreground">声音克隆、音色同步和空槽位都会按所选项目查询。</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => void syncProjects()} disabled={!editingId || projectsWorking}>
                      <RefreshCw className={cn(projectsWorking && "animate-spin")} />
                      同步项目与密钥
                    </Button>
                    <Button
                      type="button"
                      variant={showProjectAdd ? "secondary" : "outline"}
                      size="sm"
                      onClick={() => setShowProjectAdd((currentValue) => !currentValue)}
                      disabled={!editingId || projectsWorking}
                      aria-expanded={showProjectAdd}
                    >
                      <Plus />
                      添加项目
                    </Button>
                  </div>
                </div>

                {showProjectAdd && (
                  <div className="flex flex-col gap-2 rounded-md bg-card p-3 ring-1 ring-border">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                      <Field label="ProjectName" htmlFor="manual-project-name" className="flex-1">
                        <Input
                          id="manual-project-name"
                          value={projectInput}
                          onChange={(event) => setProjectInput(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              void addProject();
                            }
                          }}
                          placeholder="例如 default"
                          disabled={!editingId || projectsWorking}
                          autoFocus
                          className="font-mono"
                        />
                      </Field>
                      <Button type="button" onClick={() => void addProject()} disabled={!editingId || projectsWorking || !projectInput.trim()}>
                        确认添加
                      </Button>
                    </div>
                    <p className="m-0 text-xs text-muted-foreground">仅在 IAM 无权读取项目时手动添加；这里填写的是 ProjectName。</p>
                  </div>
                )}

                {projects.length ? (
                  <ul className="m-0 flex list-none flex-col divide-y overflow-hidden rounded-md bg-card p-0 ring-1 ring-border">
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
                      const keyTone = apiKeyStatus === "available"
                        ? "bg-emerald-50 text-emerald-700"
                        : apiKeyStatus === "error"
                          ? "bg-destructive/10 text-destructive"
                          : apiKeyStatus === "missing"
                            ? "bg-amber-50 text-amber-700"
                            : "bg-muted text-muted-foreground";
                      return (
                        <li key={project.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
                          <div className="min-w-0 flex-1 basis-40">
                            <strong className="block truncate text-sm font-medium text-foreground" title={displayName}>{displayName}</strong>
                            {showTechnicalName && <code className="block truncate font-mono text-[11px] text-muted-foreground" title={project.project_name}>{project.project_name}</code>}
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                            {project.has_permission === false && <Badge className="rounded-full bg-destructive/10 px-2 text-[11px] text-destructive">无权限</Badge>}
                            <Badge className={cn("rounded-full px-2 text-[11px]", keyTone)} title={apiKeyTitle}>{apiKeyLabel}</Badge>
                            <span className="text-muted-foreground">{sourceLabel}</span>
                          </div>
                          <div className="flex items-center gap-0.5">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-sm"
                                  aria-label={`复制 ProjectName ${project.project_name}`}
                                  onClick={() => void copyProjectName(project.project_name)}
                                >
                                  {copiedProject === project.project_name ? <Check className="text-success" /> : <Copy />}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>复制 ProjectName</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-sm"
                                  aria-label={`删除项目 ${displayName}`}
                                  onClick={() => void removeProject(project)}
                                  disabled={projectsWorking}
                                  className="hover:bg-destructive/10 hover:text-destructive"
                                >
                                  <Trash2 />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>从本地项目列表删除</TooltipContent>
                            </Tooltip>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="m-0 rounded-md border border-dashed bg-card px-4 py-6 text-center text-xs text-muted-foreground">
                    保存凭据后同步项目，或手动添加 ProjectName。
                  </p>
                )}
              </section>
            </>
          )}

          {current?.verification_message && (
            <div
              className={cn(
                "flex items-start gap-2 rounded-md px-3 py-2.5 text-sm",
                current.status === "active" ? "bg-emerald-50 text-emerald-800" : current.status === "error" ? "bg-destructive/10 text-destructive" : "bg-muted text-soft",
              )}
            >
              <Activity className="mt-0.5 size-4 shrink-0" />
              <span className="min-w-0 break-words">
                {current.verification_message}
                {current.last_verified_at && (
                  <small className="ml-2 text-xs opacity-70">{new Date(current.last_verified_at).toLocaleString()}</small>
                )}
              </span>
            </div>
          )}
          {message && <StatusLine tone={messageIsError ? "error" : "info"}>{message}</StatusLine>}

          <div className="flex flex-wrap items-center gap-2 border-t pt-5">
            {editingId && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="删除账号"
                    onClick={() => void remove()}
                    disabled={working}
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>删除账号</TooltipContent>
              </Tooltip>
            )}
            <div className="ml-auto flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => void verify()} disabled={!editingId || working}>
                <Activity />
                {verifyLabel}
              </Button>
              <Button type="submit" disabled={working}>
                <Save />
                {working ? "处理中..." : editingId ? "保存修改" : "保存账号"}
              </Button>
            </div>
          </div>
        </form>
      </section>
    </div>
  );
}

function SecretInput({
  visible,
  onToggle,
  ...props
}: ComponentProps<typeof Input> & { visible: boolean; onToggle: () => void }) {
  const label = visible ? "隐藏密钥" : "显示密钥";
  return (
    <div className="relative">
      <Input {...props} type={visible ? "text" : "password"} className="pr-11 font-mono text-[13px]" />
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={label}
            aria-pressed={visible}
            onClick={onToggle}
            className="absolute top-1/2 right-1 -translate-y-1/2"
          >
            {visible ? <EyeOff /> : <Eye />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    </div>
  );
}
