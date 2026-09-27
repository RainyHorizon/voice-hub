import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Download,
  FileText,
  ListChecks,
  Mic2,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useConfirm } from "@/components/feedback/ConfirmProvider";
import { cn } from "@/lib/utils";
import { api, responseError } from "../api";
import { HistoryAudioButton } from "../components/HistoryAudioButton";
import { PageHeader } from "../components/layout/PageHeader";
import { useStudio } from "../context/StudioContext";
import type { Job } from "../types";
import { formatBytes } from "../utils";

type HistoryFilter =
  | { kind: "all" }
  | { kind: "today" }
  | { kind: "yesterday" }
  | { kind: "recent"; days: 7 }
  | { kind: "day"; date: string };

function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateFromKey(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

function shiftedDateKey(days: number) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return localDateKey(date);
}

function jobDateKey(job: Job) {
  return job.created_date || localDateKey(new Date(job.created_at));
}

function historyFilterLabel(filter: HistoryFilter) {
  if (filter.kind === "today") return "今天";
  if (filter.kind === "yesterday") return "昨天";
  if (filter.kind === "recent") return "最近 7 天";
  if (filter.kind === "day") {
    return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long", day: "numeric" }).format(dateFromKey(filter.date));
  }
  return "全部日期";
}

function matchesHistoryFilter(job: Job, filter: HistoryFilter) {
  const key = jobDateKey(job);
  if (filter.kind === "today") return key === shiftedDateKey(0);
  if (filter.kind === "yesterday") return key === shiftedDateKey(-1);
  if (filter.kind === "recent") return key >= shiftedDateKey(-(filter.days - 1)) && key <= shiftedDateKey(0);
  if (filter.kind === "day") return key === filter.date;
  return true;
}

function historyGroupLabel(key: string) {
  if (key === shiftedDateKey(0)) return "今天";
  if (key === shiftedDateKey(-1)) return "昨天";
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long", day: "numeric" }).format(dateFromKey(key));
}

function jobTime(job: Job) {
  const date = new Date(job.created_at);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit" }).format(date);
}

function audioFileName(job: Job) {
  const name = job.audio_url?.split("?")[0].split("/").pop();
  return name ? decodeURIComponent(name) : `voice-hub-${job.id}`;
}

const presets = [
  ["all", "全部日期"],
  ["today", "今天"],
  ["yesterday", "昨天"],
  ["recent", "最近 7 天"],
] as const;

function HistoryDateMenu({ filter, onChange }: { filter: HistoryFilter; onChange: (filter: HistoryFilter) => void }) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => {
    const source = filter.kind === "day" ? dateFromKey(filter.date) : new Date();
    return new Date(source.getFullYear(), source.getMonth(), 1, 12);
  });
  const todayKey = localDateKey(new Date());
  const selectedKey = filter.kind === "day" ? filter.date : "";
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1, 12);
  const mondayOffset = (firstDay.getDay() + 6) % 7;
  const calendarDays = Array.from(
    { length: 42 },
    (_, index) => new Date(month.getFullYear(), month.getMonth(), 1 - mondayOffset + index, 12),
  );

  const changeOpen = (next: boolean) => {
    if (next) {
      const source = filter.kind === "day" ? dateFromKey(filter.date) : new Date();
      setMonth(new Date(source.getFullYear(), source.getMonth(), 1, 12));
    }
    setOpen(next);
  };
  const choose = (next: HistoryFilter) => {
    onChange(next);
    setOpen(false);
  };
  const shiftMonth = (delta: number) =>
    setMonth((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1, 12));

  return (
    <Popover open={open} onOpenChange={changeOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className={cn("justify-between gap-2", filter.kind !== "all" && "border-brand/40 bg-accent text-accent-foreground")}>
          <CalendarDays />
          <span>{historyFilterLabel(filter)}</span>
          <ChevronDown className="opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" aria-label="筛选任务日期" className="flex w-auto max-w-[calc(100vw-2rem)] flex-col gap-3 p-3 sm:flex-row">
        <div className="flex gap-1 overflow-x-auto sm:w-32 sm:flex-col sm:border-r sm:pr-3">
          {presets.map(([kind, label]) => {
            const selected = filter.kind === kind;
            return (
              <button
                key={kind}
                type="button"
                onClick={() => choose(kind === "recent" ? { kind, days: 7 } : { kind })}
                aria-pressed={selected}
                className={cn(
                  "flex shrink-0 items-center justify-between gap-2 rounded-sm px-3 py-2 text-left text-sm whitespace-nowrap outline-none transition-colors hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50",
                  selected && "bg-accent font-medium text-accent-foreground hover:bg-accent",
                )}
              >
                {label}
                {selected && <Check className="size-3.5 text-brand" />}
              </button>
            );
          })}
        </div>
        <div className="w-[16.5rem]">
          <div className="mb-2 flex items-center justify-between">
            <strong className="pl-1 text-sm font-semibold text-foreground">
              {new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long" }).format(month)}
            </strong>
            <div className="flex gap-0.5">
              <Button variant="ghost" size="icon-sm" onClick={() => shiftMonth(-1)} aria-label="上个月" title="上个月">
                <ChevronLeft />
              </Button>
              <Button variant="ghost" size="icon-sm" onClick={() => shiftMonth(1)} aria-label="下个月" title="下个月">
                <ChevronRight />
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-7 text-center text-[11px] text-muted-foreground" aria-hidden="true">
            {["一", "二", "三", "四", "五", "六", "日"].map((day) => (
              <span key={day} className="py-1">{day}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {calendarDays.map((date) => {
              const key = localDateKey(date);
              const outside = date.getMonth() !== month.getMonth();
              const selected = key === selectedKey;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => choose({ kind: "day", date: key })}
                  aria-label={key}
                  aria-pressed={selected}
                  className={cn(
                    "relative grid aspect-square place-items-center rounded-sm text-[13px] tabular-nums outline-none transition-colors hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50",
                    outside && "text-muted-foreground/60",
                    key === todayKey && !selected && "font-semibold text-brand",
                    selected && "bg-primary font-semibold text-primary-foreground hover:bg-primary",
                  )}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function HistoryPage() {
  const { jobs, voices, setActive, refreshJobs: onRefresh } = useStudio();
  const confirm = useConfirm();
  const [dateFilter, setDateFilter] = useState<HistoryFilter>({ kind: "all" });
  const [batchMode, setBatchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [working, setWorking] = useState(false);
  const voiceNames = useMemo(
    () => new Map(voices.map((voice) => [voice.public_name, voice.display_name])),
    [voices],
  );
  const filtered = useMemo(() => jobs.filter((job) => matchesHistoryFilter(job, dateFilter)), [jobs, dateFilter]);
  const groups = useMemo(() => {
    const grouped = new Map<string, Job[]>();
    filtered.forEach((job) => {
      const key = jobDateKey(job);
      grouped.set(key, [...(grouped.get(key) || []), job]);
    });
    return [...grouped.entries()].sort(([left], [right]) => right.localeCompare(left));
  }, [filtered]);
  const visibleIds = filtered.map((job) => job.id);
  const selectedJobs = filtered.filter((job) => selectedIds.has(job.id));
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));

  useEffect(() => {
    setSelectedIds((current) => new Set([...current].filter((id) => jobs.some((job) => job.id === id))));
  }, [jobs]);

  const changeFilter = (next: HistoryFilter) => {
    setDateFilter(next);
    setSelectedIds(new Set());
  };
  const toggleBatchMode = () => {
    setBatchMode((current) => {
      if (current) setSelectedIds(new Set());
      return !current;
    });
  };
  const toggleAll = () => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (allVisibleSelected) visibleIds.forEach((id) => next.delete(id));
      else visibleIds.forEach((id) => next.add(id));
      return next;
    });
  };
  const toggleJob = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const downloadZip = async () => {
    const exportIds = selectedJobs.map((job) => job.id);
    if (!exportIds.length) return void toast.error("请先选择要导出的任务");
    setWorking(true);
    const pending = toast.loading("正在整理 ZIP 文件...");
    try {
      const response = await fetch("/api/jobs/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_ids: exportIds }),
      });
      if (!response.ok) throw new Error(await responseError(response));
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "voice-hub-selected-jobs.zip";
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success("ZIP 已开始下载", { id: pending, description: `共 ${exportIds.length} 条任务` });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "导出失败", { id: pending });
    } finally {
      setWorking(false);
    }
  };
  const deleteSelected = async () => {
    const ids = selectedJobs.map((job) => job.id);
    if (!ids.length) return void toast.error("请先选择要删除的任务");
    if (!(await confirm({ title: `删除选中的 ${ids.length} 条任务？`, description: "任务记录和对应音频会一并删除，此操作不可撤销。", confirmLabel: "删除", destructive: true }))) return;
    setWorking(true);
    try {
      const result = await api<{ message: string; freed_bytes: number }>("/api/jobs/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_ids: ids }),
      });
      setSelectedIds(new Set());
      setBatchMode(false);
      toast.success(result.message, { description: `释放 ${formatBytes(result.freed_bytes)}` });
      await onRefresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除失败");
    } finally {
      setWorking(false);
    }
  };
  const deleteOne = async (job: Job) => {
    if (!(await confirm({ title: "删除这条任务？", description: "任务记录和对应音频会一并删除，此操作不可撤销。", confirmLabel: "删除", destructive: true }))) return;
    setWorking(true);
    try {
      const result = await api<{ message: string; freed_bytes: number }>(`/api/jobs/${job.id}`, { method: "DELETE" });
      setSelectedIds((current) => new Set([...current].filter((id) => id !== job.id)));
      toast.success(result.message, { description: `释放 ${formatBytes(result.freed_bytes)}` });
      await onRefresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除失败");
    } finally {
      setWorking(false);
    }
  };
  const refresh = async () => {
    setWorking(true);
    try {
      await onRefresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "刷新失败");
    } finally {
      setWorking(false);
    }
  };

  const selectAllState = allVisibleSelected ? true : selectedJobs.length ? "indeterminate" : false;

  return (
    <section>
      <PageHeader
        title="任务历史"
        description="按日期浏览生成任务，试听、下载文字记录与音频，或批量整理历史文件。"
        actions={
          <>
            <Button variant={batchMode ? "secondary" : "outline"} onClick={toggleBatchMode} aria-pressed={batchMode}>
              {batchMode ? <X /> : <ListChecks />}
              {batchMode ? "退出批量管理" : "批量管理"}
            </Button>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon" onClick={() => void refresh()} disabled={working} aria-label="刷新任务历史">
                  <RefreshCw className={cn(working && "animate-spin")} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>刷新任务历史</TooltipContent>
            </Tooltip>
          </>
        }
      />

      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center gap-3">
          <HistoryDateMenu filter={dateFilter} onChange={changeFilter} />
          {dateFilter.kind !== "all" && (
            <Button variant="ghost" size="sm" onClick={() => changeFilter({ kind: "all" })}>
              清除筛选
            </Button>
          )}
          <span className="ml-auto text-sm text-muted-foreground tabular-nums">共 {filtered.length} 条</span>
        </div>

        {batchMode && (
          <div
            role="region"
            aria-label="批量操作"
            className="glass sticky top-[4.5rem] z-30 flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 shadow-float animate-page-in md:top-4 md:px-5"
          >
            <label className="flex cursor-pointer items-center gap-2.5 text-sm font-medium text-foreground">
              <Checkbox
                checked={selectAllState}
                onCheckedChange={toggleAll}
                disabled={!visibleIds.length}
                aria-label={allVisibleSelected ? "取消全选" : "全选"}
              />
              {allVisibleSelected ? "取消全选" : "全选"}
            </label>
            <span className="text-sm text-muted-foreground" aria-live="polite">
              已选择 <strong className="font-semibold text-foreground tabular-nums">{selectedJobs.length}</strong> 条
            </span>
            <div className="ml-auto flex gap-2">
              <Button variant="outline" size="sm" onClick={() => void downloadZip()} disabled={working || !selectedJobs.length}>
                <Download />
                下载 ZIP
              </Button>
              <Button variant="destructive" size="sm" onClick={() => void deleteSelected()} disabled={working || !selectedJobs.length}>
                <Trash2 />
                删除
              </Button>
            </div>
          </div>
        )}

        {groups.length === 0 ? (
          <div className="island flex flex-col items-center gap-3 px-6 py-16 text-center">
            <span className="grid size-12 place-items-center rounded-full bg-accent text-brand">
              <Clock3 className="size-5" />
            </span>
            <p className="m-0 text-sm text-muted-foreground">
              {dateFilter.kind === "all" ? "还没有任务，去语音合成生成第一条语音。" : "这个日期范围内没有任务记录。"}
            </p>
            {dateFilter.kind === "all" ? (
              <Button size="sm" onClick={() => setActive("synthesize")}>
                <Mic2 />
                去语音合成
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={() => changeFilter({ kind: "all" })}>
                查看全部日期
              </Button>
            )}
          </div>
        ) : (
          groups.map(([date, dateJobs]) => (
            <section key={date} aria-labelledby={`history-group-${date}`} className="flex flex-col gap-2.5">
              <h2 id={`history-group-${date}`} className="m-0 flex items-baseline gap-2 px-1 text-sm font-semibold text-foreground">
                {historyGroupLabel(date)}
                <span className="text-xs font-normal text-muted-foreground tabular-nums">{dateJobs.length} 条</span>
              </h2>
              <ul className="island m-0 list-none divide-y overflow-hidden p-0">
                {dateJobs.map((job) => (
                  <HistoryRow
                    key={job.id}
                    job={job}
                    voiceName={voiceNames.get(job.voice) || job.voice}
                    batchMode={batchMode}
                    selected={selectedIds.has(job.id)}
                    onToggle={() => toggleJob(job.id)}
                    onDelete={() => void deleteOne(job)}
                    disabled={working}
                  />
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
    </section>
  );
}

type HistoryRowProps = {
  job: Job;
  voiceName: string;
  batchMode: boolean;
  selected: boolean;
  disabled: boolean;
  onToggle: () => void;
  onDelete: () => void;
};

function HistoryRow({ job, voiceName, batchMode, selected, disabled, onToggle, onDelete }: HistoryRowProps) {
  const headline = job.input_text || `${voiceName} · ${job.model}`;
  const time = jobTime(job);
  const audioCleaned = !job.audio_url && Boolean(job.audio_cleaned_at);
  return (
    <li
      className={cn(
        "flex items-start gap-3 px-4 py-3.5 transition-colors sm:gap-4 sm:px-5",
        batchMode && "cursor-pointer hover:bg-muted/50",
        selected && "bg-accent/60 hover:bg-accent/70",
      )}
      onClick={batchMode ? onToggle : undefined}
    >
      {batchMode && (
        <Checkbox
          checked={selected}
          onCheckedChange={onToggle}
          onClick={(event) => event.stopPropagation()}
          aria-label={`选择任务 ${job.id}`}
          className="mt-2.5"
        />
      )}
      <HistoryAudioButton
        src={job.audio_url}
        label="播放这条语音"
        title={headline}
        subtitle={`${voiceName} · ${job.model}`}
        downloadName={audioFileName(job)}
        className="mt-0.5"
      />
      <div className="min-w-0 flex-1">
        <strong className="block truncate text-[15px] font-medium text-foreground" title={headline}>
          {headline}
        </strong>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          {time && <span className="tabular-nums">{time}</span>}
          {time && <span aria-hidden className="text-border">·</span>}
          <span className="truncate">{voiceName}</span>
          <span aria-hidden className="text-border">·</span>
          <span className="truncate font-mono text-[11px]">{job.model}</span>
          {job.input_chars > 0 && (
            <>
              <span aria-hidden className="text-border">·</span>
              <span className="tabular-nums">{job.input_chars.toLocaleString()} 字</span>
            </>
          )}
          {audioCleaned && <Badge className="rounded-full bg-muted px-2 text-[11px] text-muted-foreground">音频已清理</Badge>}
        </div>
        {job.input_text && !batchMode && (
          <details className="group mt-2 text-sm" onClick={(event) => event.stopPropagation()}>
            <summary className="w-fit cursor-pointer list-none rounded-sm text-xs font-medium text-brand outline-none select-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
              <span className="group-open:hidden">查看文字记录</span>
              <span className="hidden group-open:inline">收起文字记录</span>
            </summary>
            <p className="m-0 mt-2 rounded-md bg-muted/60 px-3.5 py-3 leading-7 whitespace-pre-wrap text-soft">{job.input_text}</p>
          </details>
        )}
      </div>
      {!batchMode && (
        <div className="flex shrink-0 items-center gap-0.5">
          <RowLink href={job.text_url} label="下载文字记录" unavailable="没有可下载的文字记录" icon={<FileText />} />
          <RowLink href={job.audio_url} label="下载声音文件" unavailable="声音文件不可用" icon={<Download />} />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onDelete}
                disabled={disabled}
                aria-label="删除任务"
                className="hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 />
              </Button>
            </TooltipTrigger>
            <TooltipContent>删除任务</TooltipContent>
          </Tooltip>
        </div>
      )}
    </li>
  );
}

function RowLink({ href, label, unavailable, icon }: { href?: string | null; label: string; unavailable: string; icon: ReactNode }) {
  if (!href) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={0} aria-label={unavailable} className="grid size-8 place-items-center rounded-md text-muted-foreground/50 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 [&_svg]:size-4">
            {icon}
          </span>
        </TooltipTrigger>
        <TooltipContent>{unavailable}</TooltipContent>
      </Tooltip>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-sm" asChild>
          <a href={href} download aria-label={label}>
            {icon}
          </a>
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
