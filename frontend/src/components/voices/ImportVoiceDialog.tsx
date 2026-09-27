import { useEffect, useMemo, useState } from "react";
import { RefreshCw, Save, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { api } from "../../api";
import { Field, Note } from "../form/Field";
import { ProviderMark } from "../ProviderMark";
import type {
  CloudVoice,
  ImportVoiceConfig,
  Model,
  ProviderAccount,
  ProviderProject,
} from "../../types";
import { credentialProviderIds, providerMeta } from "../../utils";

type Mode = "sync" | "manual";
type Edit = { display_name: string; public_name: string };

export function ImportVoiceDialog({
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
  const [mode, setMode] = useState<Mode>("sync");
  const [provider, setProvider] = useState(initialProvider);
  const [modelId, setModelId] = useState(
    importModels.find((item) => item.provider === initialProvider)?.model_id || "",
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
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const providerModels = importModels.filter((item) => item.provider === provider);
  const selectedProviderAccounts = useMemo(
    () => providerAccounts.filter((item) => item.provider === provider),
    [provider, providerAccounts],
  );
  const providerOptions = (mode === "sync" ? syncProviders : credentialProviderIds).filter((id) =>
    importModels.some((item) => item.provider === id),
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

  const resetCloudList = () => {
    setCloudVoices([]);
    setSelected([]);
    setEdits({});
    setMessage("");
  };
  const defaultNames = (item: CloudVoice, index: number): Edit => {
    const providerName = providerMeta[item.provider || provider]?.label || item.provider || provider;
    const name = item.display_name?.trim() || `${providerName}复刻音色 ${String(index + 1).padStart(2, "0")}`;
    const shortId = item.provider_voice_id.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase().slice(-24);
    return {
      display_name: name,
      public_name: `${item.provider}-${shortId || `voice-${index + 1}`}`.slice(0, 48),
    };
  };
  const chooseProvider = (next: string) => {
    setProvider(next);
    setModelId(importModels.find((item) => item.provider === next)?.model_id || "");
    resetCloudList();
  };
  const chooseMode = (next: Mode) => {
    setMode(next);
    if (next === "sync" && !syncProviders.includes(provider)) chooseProvider(syncProviders[0] || "");
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
        `/api/voices/cloud/${provider}?provider_account_id=${encodeURIComponent(providerAccountId)}${
          provider === "volcengine" ? `&provider_project_name=${encodeURIComponent(providerProjectName)}` : ""
        }`,
      );
      setCloudVoices(result.voices);
      setSelected([]);
      setEdits(
        Object.fromEntries(result.voices.map((item, index) => [item.provider_voice_id, defaultNames(item, index)])),
      );
      if (!result.voices.length) setMessage("厂商账号中没有可同步的克隆音色。");
    } catch (error) {
      setCloudVoices([]);
      setMessage(error instanceof Error ? error.message : "读取云端音色失败");
    } finally {
      setWorking(false);
    }
  };
  const submit = async () => {
    if (!voiceId.trim() || !displayName.trim() || !publicName.trim() || !modelId) return;
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
    const items = cloudVoices.filter((item) => selected.includes(item.provider_voice_id));
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
  const updateEdit = (id: string, patch: Partial<Edit>) =>
    setEdits((current) => ({ ...current, [id]: { ...current[id], ...patch } }));

  const selectable = cloudVoices.filter((item) => item.compatible && !item.imported);
  const allSelected = selectable.length > 0 && selected.length === selectable.length;
  const submitDisabled =
    working ||
    (provider === "volcengine" && (!providerAccountId || !providerProjectName)) ||
    (mode === "sync" ? selected.length === 0 : !voiceId.trim() || !displayName.trim() || !publicName.trim());
  const submitLabel =
    mode === "sync"
      ? working
        ? "正在导入…"
        : `导入所选音色${selected.length ? ` (${selected.length})` : ""}`
      : working
        ? provider === "minimax"
          ? "正在导入…"
          : "正在验证…"
        : provider === "minimax"
          ? "直接导入"
          : "验证并导入";

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className={cn(
          "flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0",
          mode === "sync" ? "sm:max-w-2xl" : "sm:max-w-xl",
        )}
      >
        <DialogHeader className="shrink-0 px-7 pt-7 pb-5">
          <DialogTitle>导入已有厂商音色</DialogTitle>
          <DialogDescription>把厂商控制台中已经存在的音色登记到 Voice Hub。</DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-7 pb-6">
          <ToggleGroup
            type="single"
            value={mode}
            onValueChange={(value) => value && chooseMode(value as Mode)}
            aria-label="导入方式"
            className="grid w-full grid-cols-2 gap-1 rounded-md bg-muted p-1"
          >
            <ToggleGroupItem value="sync" className="h-9 rounded-sm data-[state=on]:bg-card data-[state=on]:shadow-sm">
              云端同步
            </ToggleGroupItem>
            <ToggleGroupItem value="manual" className="h-9 rounded-sm data-[state=on]:bg-card data-[state=on]:shadow-sm">
              手工输入 ID
            </ToggleGroupItem>
          </ToggleGroup>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="厂商" htmlFor="import-provider">
              <Select value={provider} onValueChange={chooseProvider}>
                <SelectTrigger id="import-provider" className="w-full">
                  <SelectValue placeholder="选择厂商" />
                </SelectTrigger>
                <SelectContent position="popper">
                  {providerOptions.map((id) => (
                    <SelectItem value={id} key={id}>
                      <ProviderMark provider={id} className="size-5 rounded-[6px] text-[10px]" />
                      {providerMeta[id].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="目标模型" htmlFor="import-model">
              <Select value={modelId} onValueChange={setModelId} disabled={mode === "sync" && provider !== "minimax"}>
                <SelectTrigger id="import-model" className="w-full" translate="no">
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
            <Field label="厂商账号" htmlFor="import-provider-account">
              <Select
                value={providerAccountId}
                onValueChange={(value) => {
                  setProviderAccountId(value);
                  setProviderProjectName("");
                  resetCloudList();
                }}
                disabled={!selectedProviderAccounts.length}
              >
                <SelectTrigger id="import-provider-account" className="w-full">
                  <SelectValue placeholder="尚未配置账号" />
                </SelectTrigger>
                <SelectContent position="popper">
                  {selectedProviderAccounts.map((account) => (
                    <SelectItem value={account.id} key={account.id}>
                      {account.display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            {provider === "volcengine" && (
              <Field label="项目" htmlFor="import-volcengine-project">
                <Select
                  value={providerProjectName}
                  onValueChange={(value) => {
                    setProviderProjectName(value);
                    resetCloudList();
                  }}
                  disabled={!providerProjects.length}
                >
                  <SelectTrigger id="import-volcengine-project" className="w-full">
                    <SelectValue placeholder="请先同步项目" />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    {providerProjects.map((project) => (
                      <SelectItem value={project.project_name} key={project.id}>
                        {project.display_name || project.project_name}
                        {project.display_name !== project.project_name && (
                          <span className="font-mono text-xs text-muted-foreground">{project.project_name}</span>
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}
          </div>

          {mode === "sync" ? (
            <>
              <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/40 px-4 py-3">
                <div className="min-w-0">
                  <strong className="block text-sm font-semibold text-foreground">云端克隆音色</strong>
                  <span className="text-xs text-muted-foreground">
                    {cloudVoices.length ? `${selectable.length} 个可导入 · 已选 ${selected.length}` : "尚未读取"}
                  </span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void loadCloudVoices()}
                  disabled={working || !providerAccountId || (provider === "volcengine" && !providerProjectName)}
                >
                  <RefreshCw className={cn(working && "animate-spin")} />
                  {working ? "正在读取" : "读取云端音色"}
                </Button>
              </div>
              <p className="m-0 -mt-2 text-xs leading-relaxed text-muted-foreground">
                默认显示名称沿用厂商音色名称；兼容别名按“厂商 + Voice ID”生成，可在勾选后修改。
              </p>

              {cloudVoices.length > 0 && (
                <div className="overflow-hidden rounded-lg border">
                  <label className="flex cursor-pointer items-center gap-3 border-b bg-muted/40 px-4 py-2.5 text-sm">
                    <Checkbox
                      checked={allSelected}
                      disabled={!selectable.length}
                      onCheckedChange={(checked) =>
                        setSelected(checked === true ? selectable.map((item) => item.provider_voice_id) : [])
                      }
                    />
                    <span className="font-medium text-foreground">选择全部可导入音色</span>
                    {selected.length > 0 && <small className="ml-auto text-xs text-muted-foreground">已选 {selected.length} 个</small>}
                  </label>
                  <ul className="m-0 list-none divide-y p-0">
                    {cloudVoices.map((item) => {
                      const disabled = item.imported || !item.compatible;
                      const checked = selected.includes(item.provider_voice_id);
                      const checkboxId = `cloud-${item.model_id}-${item.provider_voice_id}`;
                      return (
                        <li
                          key={`${item.model_id}:${item.provider_voice_id}`}
                          className={cn("flex gap-3 px-4 py-3", checked && "bg-accent/40", disabled && "opacity-60")}
                        >
                          <Checkbox
                            id={checkboxId}
                            className="mt-0.5"
                            checked={checked}
                            disabled={disabled}
                            aria-label={`选择 ${item.display_name}`}
                            onCheckedChange={(next) =>
                              setSelected((current) =>
                                next === true
                                  ? [...current, item.provider_voice_id]
                                  : current.filter((id) => id !== item.provider_voice_id),
                              )
                            }
                          />
                          <div className="flex min-w-0 flex-1 flex-col gap-1">
                            <div className="flex items-start justify-between gap-3">
                              <label htmlFor={checkboxId} className={cn("min-w-0", !disabled && "cursor-pointer")}>
                                <strong className="block truncate text-sm font-semibold text-foreground">{item.display_name}</strong>
                                <code className="block truncate font-mono text-[11px] text-muted-foreground">{item.provider_voice_id}</code>
                              </label>
                              <Badge
                                className={cn(
                                  "shrink-0 rounded-full",
                                  item.imported
                                    ? "bg-slate-100 text-slate-600"
                                    : !item.compatible
                                      ? "bg-amber-50 text-amber-700"
                                      : "bg-emerald-50 text-emerald-700",
                                )}
                              >
                                {item.imported ? "已导入" : !item.compatible ? "模型不兼容" : "可导入"}
                              </Badge>
                            </div>
                            <small className="text-xs text-muted-foreground">
                              {item.compatibility_message || (provider === "minimax" ? "可用于全部 MiniMax Speech 模型" : item.model_id)}
                            </small>
                            {checked && (
                              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                                <Field label="导入后显示名称" htmlFor={`${checkboxId}-name`}>
                                  <Input
                                    id={`${checkboxId}-name`}
                                    value={edits[item.provider_voice_id]?.display_name || ""}
                                    onChange={(event) => updateEdit(item.provider_voice_id, { display_name: event.target.value })}
                                    placeholder="显示名称"
                                  />
                                </Field>
                                <Field label="OpenAI 兼容别名" htmlFor={`${checkboxId}-alias`}>
                                  <Input
                                    id={`${checkboxId}-alias`}
                                    className="font-mono"
                                    value={edits[item.provider_voice_id]?.public_name || ""}
                                    onChange={(event) => updateEdit(item.provider_voice_id, { public_name: event.target.value })}
                                    placeholder="兼容别名"
                                  />
                                </Field>
                              </div>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
              <Note icon={<ShieldCheck />}>此操作只读取并登记云端音色，不会创建、删除音色或生成收费音频。</Note>
            </>
          ) : (
            <>
              <Field
                label={provider === "volcengine" ? "火山音色 ID / speaker_id" : "厂商 Voice ID"}
                htmlFor="import-voice-id"
              >
                <Input
                  id="import-voice-id"
                  className="font-mono"
                  value={voiceId}
                  onChange={(event) => setVoiceId(event.target.value)}
                  placeholder={provider === "volcengine" ? "例如：S_xxxxx 或 custom_zh_xxx" : "粘贴控制台中的完整 Voice ID"}
                  autoFocus
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="显示名称" htmlFor="import-display-name">
                  <Input
                    id="import-display-name"
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    placeholder="例如：我的旁白音色"
                  />
                </Field>
                <Field label="兼容别名" htmlFor="import-public-name">
                  <Input
                    id="import-public-name"
                    className="font-mono"
                    value={publicName}
                    onChange={(event) => setPublicName(event.target.value)}
                    placeholder="例如：my-volc-voice"
                  />
                </Field>
              </div>
              {provider === "volcengine" && (
                <Note icon={<ShieldCheck />}>保存前会向火山引擎查询音色状态。批量同步还需配置火山 OpenAPI AK/SK 与项目名称。</Note>
              )}
              {provider === "minimax" && (
                <Note icon={<ShieldCheck />}>MiniMax Voice ID 将直接导入，首次合成时由厂商接口验证其可用性。</Note>
              )}
            </>
          )}
          {message && (
            <p role="status" aria-live="polite" className="m-0 rounded-md bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
              {message}
            </p>
          )}
        </div>

        <DialogFooter className="shrink-0 border-t bg-muted/30 px-7 py-4">
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button onClick={() => void (mode === "sync" ? submitBatch() : submit())} disabled={submitDisabled}>
            <Save />
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
