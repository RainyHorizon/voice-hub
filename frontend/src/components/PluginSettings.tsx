import { useEffect, useState, type FormEvent } from "react";
import { BookOpen, Download, Globe, Puzzle, RefreshCw, Search, Settings, Trash2, Volume2, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "../api";
import { useStudio } from "../context/StudioContext";
import { WorkspaceHero } from "./WorkspaceHero";
import { useConfirm } from "./feedback/ConfirmProvider";
import { useDialogAccessibility } from "../hooks/useDialogAccessibility";
import type { VoiceHubPlugin } from "../types";

type Values = Record<string, string | number | boolean>;
const messageOf = (error: unknown) => error instanceof Error ? error.message : "插件操作失败";
const initialValues = (plugin: VoiceHubPlugin): Values => ({
  endpoint: plugin.endpoint || "",
  ...Object.fromEntries((plugin.settings || []).map((f) => [f.key, f.default])),
  ...plugin.config,
});

export function PluginSettings() {
  const [plugins, setPlugins] = useState<VoiceHubPlugin[]>([]);
  const [market, setMarket] = useState<VoiceHubPlugin[]>([]);
  const [view, setView] = useState("installed");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [target, setTarget] = useState<VoiceHubPlugin | null>(null);
  const { refreshCatalog } = useStudio();
  const confirm = useConfirm();
  const load = async () => {
    const [installed, available] = await Promise.all([
      api<{ plugins: VoiceHubPlugin[] }>("/api/plugins"),
      api<{ plugins: VoiceHubPlugin[] }>("/api/plugins/market"),
    ]);
    setPlugins(installed.plugins);
    setMarket(available.plugins);
  };
  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      api<{ plugins: VoiceHubPlugin[] }>("/api/plugins"),
      api<{ plugins: VoiceHubPlugin[] }>("/api/plugins/market"),
    ]).then(([installed, available]) => {
      if (!cancelled) { setPlugins(installed.plugins); setMarket(available.plugins); }
    }).catch((e) => { if (!cancelled) setError(messageOf(e)); });
    return () => { cancelled = true; };
  }, []);
  const action = async (plugin: VoiceHubPlugin, operation: string) => {
    if (operation === "remove" && !await confirm({
      title: "卸载插件",
      description: `卸载 ${plugin.name || plugin.id}？生成历史与音频会保留，独立服务不会被删除。`,
      confirmLabel: "卸载",
      destructive: true,
    })) return;
    setBusy(plugin.id); setError("");
    try {
      await api(`/api/plugins/${encodeURIComponent(plugin.id)}${operation === "remove" ? "" : "/" + operation}`, { method: operation === "remove" ? "DELETE" : "POST" });
      await load();
      await refreshCatalog();
      toast.success(operation === "install" ? "插件已安装，启动独立服务后即可启用" : operation === "refresh" ? "模型与音色已刷新" : operation === "remove" ? "插件已卸载" : operation === "enable" ? "插件已启用" : "插件已停用");
    } catch (e) { setError(messageOf(e)); }
    finally { setBusy(""); }
  };
  const refresh = async () => {
    setBusy("refresh"); setError("");
    try { await load(); await refreshCatalog(); }
    catch (e) { setError(messageOf(e)); }
    finally { setBusy(""); }
  };
  const list = (view === "installed" ? plugins : market).filter((p) =>
    [p.name, p.id, p.description, p.author].join(" ").toLowerCase().includes(search.toLowerCase()),
  );
  return <section className="page-section plugin-settings-page" aria-labelledby="plugin-page-title">
    <header className="plugin-heading workspace-sticky-header"><WorkspaceHero title="让每个插件" accent="接入语音工作台" description="按需扩展语音服务，让工作台保持轻巧。" /><button type="button" className="secondary-button" disabled={Boolean(busy)} onClick={() => void refresh()}><RefreshCw size={16} className={busy === "refresh" ? "spinning" : ""} />刷新</button></header>
    <div className="plugin-toolbar">
      <div className="plugin-tabs" role="group" aria-label="插件视图">
        {[["installed", "已安装"], ["market", "插件市场"], ["sources", "插件来源"]].map(([id, label]) => <button key={id} type="button" aria-pressed={view === id} className={view === id ? "selected" : ""} onClick={() => { setView(id); setSearch(""); }}>{label}{id === "installed" && <span>{plugins.length}</span>}</button>)}
      </div>
      {view !== "sources" && <label className="plugin-search"><Search size={17} /><input aria-label="搜索插件" placeholder="搜索插件…" value={search} onChange={(e) => setSearch(e.target.value)} /></label>}
    </div>
    {error && <p className="form-message" role="alert">{error}</p>}
    {view === "sources" ? <div className="plugin-source-card"><div className="plugin-art"><Globe size={27} /></div><div><h3>本机示例源</h3><p>展示当前安装包或本机配置提供的可选示例。公共 GitHub 插件目录尚未配置，当前不会下载或执行第三方代码。</p><p>开发者插件可放入 <code>data/plugins/插件目录/voice-hub.plugin.json</code>，启动独立服务后刷新并配置连接地址。</p></div><span className="plugin-badge">已连接</span></div> : <>
      {view === "market" && <p className="plugin-market-note">这里显示本机可用的示例插件；公共社区插件源尚未建立。</p>}
      <div className="plugin-grid">{list.map((plugin) => {
        const installed = plugins.some((p) => p.id === plugin.id);
        const valid = plugin.status !== "invalid";
        return <article className="plugin-card" key={plugin.path || plugin.id}>
          <div className="plugin-card-top">
            <div className="plugin-art">{plugin.id === "edge-tts" ? <Volume2 size={29} /> : <Puzzle size={29} />}</div>
            <div className="plugin-card-name"><div><h3>{plugin.name || plugin.id}</h3>{plugin.version && <span className="plugin-version">v{plugin.version}</span>}</div><span className={`plugin-badge ${plugin.enabled ? "on" : ""}`}>{!valid ? "清单无效" : view === "market" ? "语音插件" : plugin.enabled ? "已启用" : "已停用"}</span></div>
            {view === "installed" && <button type="button" role="switch" aria-checked={plugin.enabled} aria-label={`${plugin.enabled ? "停用" : "启用"} ${plugin.name || plugin.id}`} className="plugin-switch" disabled={!valid || Boolean(busy)} onClick={() => void action(plugin, plugin.enabled ? "disable" : "enable")}><span /></button>}
          </div>
          <p className="plugin-description">{plugin.description || plugin.error}</p>
          {plugin.id === "edge-tts" && <div className="plugin-tags"><span>在线语音</span><span>无需 API Key</span></div>}
          <div className="plugin-card-footer"><small>{plugin.author || "未知作者"}{plugin.voice_count ? ` · ${plugin.voice_count} 个音色` : ""}</small><div className="plugin-card-actions">
            {plugin.homepage && <a className="plugin-tool" href={plugin.homepage} target="_blank" rel="noopener noreferrer" aria-label={`查看 ${plugin.name} 文档`} title="插件文档"><BookOpen size={17} /></a>}
            {view === "installed" ? <>
              <button className="plugin-tool" type="button" title="插件配置" aria-label={`配置 ${plugin.name || plugin.id}`} disabled={!valid || Boolean(busy)} onClick={() => setTarget(plugin)}><Settings size={17} /></button>
              <button className="plugin-tool" type="button" title="同步模型与音色" aria-label={`同步 ${plugin.name || plugin.id} 音色`} disabled={!valid || Boolean(busy)} onClick={() => void action(plugin, "refresh")}><RefreshCw size={17} className={busy === plugin.id ? "spinning" : ""} /></button>
              <button className="plugin-tool remove" type="button" title="卸载插件" aria-label={`卸载 ${plugin.name || plugin.id}`} disabled={!valid || Boolean(busy)} onClick={() => void action(plugin, "remove")}><Trash2 size={17} /></button>
            </> : <button className="secondary-button" type="button" disabled={installed || Boolean(busy)} onClick={() => void action(plugin, "install")}><Download size={15} />{installed ? "已安装" : busy === plugin.id ? "安装中…" : "安装"}</button>}
          </div></div>
        </article>;
      })}</div>
      {!list.length && <div className="empty-state"><Puzzle size={30} /><strong>{search ? "没有匹配的插件" : "还没有安装插件"}</strong><span>{search ? "试试其他关键词" : "前往插件市场安装可用插件，或添加开发者插件"}</span>{!search && view === "installed" && <button className="secondary-button" type="button" onClick={() => setView("market")}>浏览插件市场</button>}</div>}
    </>}
    {target && <PluginConfigDialog plugin={target} onClose={() => setTarget(null)} onSaved={async () => { await load(); await refreshCatalog(); setTarget(null); toast.success("插件配置已保存"); }} />}
  </section>;
}

function PluginConfigDialog({ plugin, onClose, onSaved }: { plugin: VoiceHubPlugin; onClose: () => void; onSaved: () => Promise<void> }) {
  const [values, setValues] = useState<Values>(() => initialValues(plugin));
  const [voices, setVoices] = useState(plugin.voices || []);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const close = () => { if (!busy) onClose(); };
  const ref = useDialogAccessibility<HTMLDivElement>(true, close);
  const update = (key: string, value: string | number | boolean) => { setValues((v) => ({ ...v, [key]: value })); setMessage(""); };
  const check = async () => {
    setBusy(true); setMessage("");
    try {
      const result = await api<{ message: string; voices: NonNullable<VoiceHubPlugin["voices"]> }>(`/api/plugins/${encodeURIComponent(plugin.id)}/check`, { method: "POST", body: JSON.stringify({ config: values }) });
      setVoices(result.voices); setMessage(`连接正常 · ${result.voices.length} 个音色`); setFailed(false);
    } catch (e) { setMessage(messageOf(e)); setFailed(true); }
    finally { setBusy(false); }
  };
  const save = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      await api(`/api/plugins/${encodeURIComponent(plugin.id)}/config`, { method: "PUT", body: JSON.stringify({ config: values }) });
      await onSaved();
    } catch (e) { setMessage(messageOf(e)); setFailed(true); }
    finally { setBusy(false); }
  };
  return <div className="modal-backdrop plugin-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
    <div className="plugin-config-modal" ref={ref} role="dialog" aria-modal="true" aria-labelledby="plugin-config-title" tabIndex={-1}>
      <header className="plugin-config-header"><div><h3 id="plugin-config-title">插件配置</h3><p>{plugin.name} <span>v{plugin.version}</span></p></div><button className="icon-button" type="button" aria-label="关闭插件配置" onClick={close} disabled={busy}><X size={19} /></button></header>
      <form onSubmit={(e) => void save(e)}>
        <div className="plugin-config-body">
          <h4>插件连接</h4>
          <div className="plugin-config-row"><label htmlFor="plugin-endpoint"><strong>服务地址</strong><span>连接在本机独立运行的插件服务。</span></label><div className="plugin-endpoint-control"><input id="plugin-endpoint" type="url" value={String(values.endpoint)} required onChange={(e) => update("endpoint", e.target.value)} disabled={busy} /><button className="secondary-button" type="button" disabled={busy} onClick={() => void check()}><RefreshCw size={14} />检查连接</button></div></div>
          {plugin.id === "edge-tts" && <div className="plugin-start-note"><p>首次使用或重启电脑后，请在插件目录运行 <code>start.ps1</code>，保持服务运行，再检查连接。</p><code>examples/plugins/edge-tts/start.ps1</code><span>Edge TTS 需要联网；无需填写厂商密钥。</span></div>}
          <h4>语音偏好</h4>
          {(plugin.settings || []).map((field) => <div className="plugin-config-row" key={field.key}>
            <label htmlFor={`plugin-${field.key}`}><strong>{field.label}</strong><span>{field.description}</span></label>
            {field.type === "voice" && voices.length ? <select id={`plugin-${field.key}`} disabled={busy} value={String(values[field.key])} onChange={(e) => update(field.key, e.target.value)}>{voices.map((v) => <option key={v.model + v.id} value={v.id}>{v.name}</option>)}</select>
              : field.type === "boolean" ? <button id={`plugin-${field.key}`} type="button" role="switch" aria-checked={Boolean(values[field.key])} className="plugin-switch" disabled={busy} onClick={() => update(field.key, !values[field.key])}><span /></button>
                : <input id={`plugin-${field.key}`} disabled={busy} required type={field.type === "integer" ? "number" : "text"} min={field.minimum ?? undefined} max={field.maximum ?? undefined} step={field.type === "integer" ? 1 : undefined} value={String(values[field.key])} onChange={(e) => update(field.key, field.type === "integer" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value)} />}
          </div>)}
          <p className="plugin-config-hint">语速和输出格式沿用语音合成页中的设置。保存后，下次生成时生效。</p>
          {message && <p className={`plugin-config-result ${failed ? "error" : ""}`} role={failed ? "alert" : "status"}>{message}</p>}
        </div>
        <footer className="plugin-config-footer"><button className="secondary-button" type="button" onClick={close} disabled={busy}>取消</button><button className="primary-button" type="submit" disabled={busy}>{busy ? "处理中…" : "保存并关闭"}</button></footer>
      </form>
    </div>
  </div>;
}
