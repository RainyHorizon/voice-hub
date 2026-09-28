import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Download,
  FileText,
  ListChecks,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { api, responseError } from "../api";
import { HistoryAudioButton } from "../components/HistoryAudioButton";
import { WorkspaceHero } from "../components/WorkspaceHero";
import { useConfirm } from "../components/feedback/ConfirmProvider";
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

function HistoryDateMenu({ filter, onChange }: { filter: HistoryFilter; onChange: (filter: HistoryFilter) => void }) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => {
    const source = filter.kind === "day" ? dateFromKey(filter.date) : new Date();
    return new Date(source.getFullYear(), source.getMonth(), 1, 12);
  });
  const containerRef = useRef<HTMLDivElement>(null);
  const todayKey = localDateKey(new Date());
  const selectedKey = filter.kind === "day" ? filter.date : "";
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1, 12);
  const mondayOffset = (firstDay.getDay() + 6) % 7;
  const calendarDays = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(month.getFullYear(), month.getMonth(), 1 - mondayOffset + index, 12);
    return date;
  });

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const choose = (next: HistoryFilter) => {
    onChange(next);
    setOpen(false);
  };
  const toggle = () => {
    if (!open) {
      const source = filter.kind === "day" ? dateFromKey(filter.date) : new Date();
      setMonth(new Date(source.getFullYear(), source.getMonth(), 1, 12));
    }
    setOpen((current) => !current);
  };
  const presetSelected = (kind: HistoryFilter["kind"]) => filter.kind === kind;

  return (
    <div className="history-date-menu" ref={containerRef}>
      <button className={filter.kind === "all" ? "history-date-trigger" : "history-date-trigger active"} type="button" onClick={toggle} aria-haspopup="dialog" aria-expanded={open}>
        <CalendarDays size={18} />
        <span>{historyFilterLabel(filter)}</span>
        <ChevronDown size={16} />
      </button>
      {open && (
        <div className="history-calendar-popover" role="dialog" aria-label="筛选任务日期">
          <div className="history-date-presets">
            {([
              ["all", "全部日期"],
              ["today", "今天"],
              ["yesterday", "昨天"],
              ["recent", "最近 7 天"],
            ] as const).map(([kind, label]) => (
              <button className={presetSelected(kind) ? "selected" : ""} type="button" onClick={() => choose(kind === "recent" ? { kind, days: 7 } : { kind })} key={kind}>
                <span>{label}</span>
                {presetSelected(kind) && <Check size={15} />}
              </button>
            ))}
          </div>
          <div className="history-calendar">
            <div className="history-calendar-head">
              <strong>{new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long" }).format(month)}</strong>
              <div>
                <button type="button" onClick={() => setMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1, 12))} title="上个月" aria-label="上个月"><ChevronLeft size={18} /></button>
                <button type="button" onClick={() => setMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1, 12))} title="下个月" aria-label="下个月"><ChevronRight size={18} /></button>
              </div>
            </div>
            <div className="history-calendar-weekdays" aria-hidden="true">
              {["一", "二", "三", "四", "五", "六", "日"].map((day) => <span key={day}>{day}</span>)}
            </div>
            <div className="history-calendar-days">
              {calendarDays.map((date) => {
                const key = localDateKey(date);
                const classes = [
                  date.getMonth() !== month.getMonth() ? "outside" : "",
                  key === todayKey ? "today" : "",
                  key === selectedKey ? "selected" : "",
                ].filter(Boolean).join(" ");
                return <button className={classes} type="button" onClick={() => choose({ kind: "day", date: key })} aria-label={key} aria-pressed={key === selectedKey} key={key}>{date.getDate()}</button>;
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
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

export function HistoryPage() {
  const { jobs, voices, refreshJobs: onRefresh } = useStudio();
  const confirm = useConfirm();
  const [dateFilter, setDateFilter] = useState<HistoryFilter>({ kind: "all" });
  const [batchMode, setBatchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
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
    setMessage("");
  };
  const toggleBatchMode = () => {
    setBatchMode((current) => {
      if (current) setSelectedIds(new Set());
      return !current;
    });
    setMessage("");
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
    if (!exportIds.length) return setMessage("请先选择要导出的任务");
    setWorking(true);
    setMessage("正在整理 ZIP 文件...");
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
      setMessage("ZIP 已开始下载");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "导出失败");
    } finally {
      setWorking(false);
    }
  };
  const deleteSelected = async () => {
    const ids = selectedJobs.map((job) => job.id);
    if (!ids.length) return setMessage("请先选择要删除的任务");
    const accepted = await confirm({
      title: `删除选中的 ${ids.length} 条任务？`,
      description: "对应音频也会永久删除，此操作不可撤销。",
      confirmLabel: "删除任务",
      destructive: true,
    });
    if (!accepted) return;
    setWorking(true);
    try {
      const result = await api<{ message: string; freed_bytes: number }>("/api/jobs/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_ids: ids }),
      });
      setSelectedIds(new Set());
      setBatchMode(false);
      setMessage(`${result.message}，释放 ${formatBytes(result.freed_bytes)}`);
      await onRefresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "删除失败");
    } finally {
      setWorking(false);
    }
  };
  const deleteOne = async (job: Job) => {
    const accepted = await confirm({
      title: "删除这条任务？",
      description: "对应音频也会永久删除，此操作不可撤销。",
      confirmLabel: "删除任务",
      destructive: true,
    });
    if (!accepted) return;
    setWorking(true);
    try {
      const result = await api<{ message: string; freed_bytes: number }>(`/api/jobs/${job.id}`, { method: "DELETE" });
      setSelectedIds((current) => new Set([...current].filter((id) => id !== job.id)));
      setMessage(`${result.message}，释放 ${formatBytes(result.freed_bytes)}`);
      await onRefresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "删除失败");
    } finally {
      setWorking(false);
    }
  };
  const refresh = async () => {
    setWorking(true);
    try {
      await onRefresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "刷新失败");
    } finally {
      setWorking(false);
    }
  };

  return (
    <section className="page-section history-page">
      <WorkspaceHero
        title="每一次生成"
        accent="都留下可追溯的声音。"
        description="按日期浏览生成任务，试听、下载文字记录与音频，或批量整理历史文件。"
      />
      <div className="history-command-bar">
        <HistoryDateMenu filter={dateFilter} onChange={changeFilter} />
        <div className="history-command-actions">
          <button className={batchMode ? "secondary-button active" : "secondary-button"} type="button" onClick={toggleBatchMode}>
            <ListChecks size={17} />
            {batchMode ? "退出批量管理" : "批量管理"}
          </button>
          <button className={working ? "icon-button history-refresh working" : "icon-button history-refresh"} type="button" onClick={() => void refresh()} disabled={working} title="刷新任务历史" aria-label="刷新任务历史"><RefreshCw size={18} /></button>
        </div>
      </div>
      {batchMode && (
        <div className="history-selection-bar">
          <div className="history-selection-summary">
            <span>已选择 <strong>{selectedJobs.length}</strong> 条</span>
            <button className="inline-action" type="button" onClick={toggleAll} disabled={!visibleIds.length}>{allVisibleSelected ? "取消全选" : "全选"}</button>
          </div>
          <div className="history-selection-actions">
            <button className="secondary-button" type="button" onClick={() => void downloadZip()} disabled={working || !selectedJobs.length}><Download size={16} />下载 ZIP</button>
            <button className="danger-button" type="button" onClick={() => void deleteSelected()} disabled={working || !selectedJobs.length}><Trash2 size={16} />删除</button>
          </div>
        </div>
      )}
      {message && <div className="history-message"><Activity size={14} />{message}</div>}
      {groups.length === 0 ? (
        <div className="empty-state history-empty"><Clock3 size={22} /><span>{dateFilter.kind === "all" ? "还没有任务，去语音合成生成第一条语音。" : "这个日期范围内没有任务记录。"}</span></div>
      ) : (
        <div className="history-groups">
          {groups.map(([date, dateJobs]) => (
            <section className="history-date-group" key={date}>
              <h2>{historyGroupLabel(date)}</h2>
              <div className="history-list">
                {dateJobs.map((job) => {
                  const voiceName = voiceNames.get(job.voice) || job.voice;
                  return <article className={batchMode ? `history-row batch-selecting${selectedIds.has(job.id) ? " selected" : ""}` : "history-row"} key={job.id}>
                    {batchMode && <label className="history-checkbox"><input type="checkbox" checked={selectedIds.has(job.id)} onChange={() => toggleJob(job.id)} aria-label={`选择任务 ${job.id}`} /></label>}
                    <HistoryAudioButton src={job.audio_url} label="播放这条语音" />
                    <div className="history-main">
                      <strong title={job.input_text || `${voiceName} · ${job.model}`}>{job.input_text || `${voiceName} · ${job.model}`}</strong>
                      <span>{voiceName} · {job.model}</span>
                      {job.input_text && <details className="history-record"><summary>查看文字记录</summary><p>{job.input_text}</p></details>}
                    </div>
                    {!batchMode && <div className="history-actions">
                      <a className={job.text_url ? "history-action" : "history-action disabled"} href={job.text_url || undefined} title={job.text_url ? "下载文字记录" : "没有可下载的文字记录"} aria-label="下载文字记录"><FileText size={16} /></a>
                      <a className={job.audio_url ? "history-action" : "history-action disabled"} href={job.audio_url || undefined} title={job.audio_url ? "下载声音文件" : "声音文件不可用"} aria-label="下载声音文件"><Download size={16} /></a>
                      <button className="history-action danger-action" onClick={() => void deleteOne(job)} title="删除任务" aria-label="删除任务"><Trash2 size={16} /></button>
                    </div>}
                  </article>;
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}
