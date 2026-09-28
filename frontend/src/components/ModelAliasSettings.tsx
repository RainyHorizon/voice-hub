import { useEffect, useMemo, useState } from "react";
import { Check, RefreshCw, RotateCcw, Save, ShieldCheck } from "lucide-react";
import { api } from "../api";
import { useConfirm } from "./feedback/ConfirmProvider";
import type { GatewayAlias, Model } from "../types";
import { providerMeta } from "../utils";

const aliasMeta: Record<GatewayAlias["alias"], { label: string; description: string; tone: string }> = {
  "tts-default": { label: "通用默认", description: "日常使用的平衡选择", tone: "default" },
  "tts-fast": { label: "低延迟", description: "优先响应速度", tone: "fast" },
  "tts-hq": { label: "高质量", description: "优先声音细节", tone: "hq" },
};

export function ModelAliasSettings({
  models,
  panelId,
  labelledBy,
}: {
  models: Model[];
  panelId?: string;
  labelledBy?: string;
}) {
  const confirm = useConfirm();
  const [aliases, setAliases] = useState<GatewayAlias[]>([]);
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [savingName, setSavingName] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const synthesisModels = useMemo(
    () => models.filter((item) => item.operations.includes("synthesis") && item.mode !== "demo"),
    [models],
  );
  const modelGroups = useMemo(
    () => synthesisModels.reduce<Record<string, Model[]>>((groups, model) => {
      const provider = providerMeta[model.provider]?.label || model.provider;
      (groups[provider] ||= []).push(model);
      return groups;
    }, {}),
    [synthesisModels],
  );

  const applyAliases = (next: GatewayAlias[]) => {
    setAliases(next);
    setSelections(Object.fromEntries(next.map((item) => [item.alias, item.model_id])));
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    api<{ aliases: GatewayAlias[] }>("/api/gateway/aliases")
      .then((result) => {
        if (!active) return;
        setAliases(result.aliases);
        setSelections(Object.fromEntries(result.aliases.map((item) => [item.alias, item.model_id])));
        setMessage("");
      })
      .catch((error) => {
        if (!active) return;
        setMessage(error instanceof Error ? `默认模型加载失败：${error.message}` : "默认模型加载失败");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const save = async (alias: GatewayAlias) => {
    const modelId = selections[alias.alias] || alias.model_id;
    if (!modelId || modelId === alias.model_id) return;
    setSavingName(alias.alias);
    setMessage("");
    try {
      const result = await api<{ aliases: GatewayAlias[] }>(`/api/gateway/aliases/${alias.alias}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model_id: modelId }),
      });
      applyAliases(result.aliases);
      setMessage(`${alias.alias} 已保存`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSavingName("");
    }
  };

  const reset = async () => {
    const accepted = await confirm({
      title: "恢复默认模型绑定？",
      description: "tts-default、tts-fast 和 tts-hq 会恢复到项目预设的模型指向。",
      confirmLabel: "恢复默认",
    });
    if (!accepted) return;
    setSavingName("reset");
    setMessage("");
    try {
      const result = await api<{ aliases: GatewayAlias[] }>("/api/gateway/aliases/reset", { method: "POST" });
      applyAliases(result.aliases);
      setMessage("已恢复默认配置");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "恢复默认失败");
    } finally {
      setSavingName("");
    }
  };

  return (
    <div id={panelId} className="model-alias-settings" role={panelId ? "tabpanel" : undefined} aria-labelledby={labelledBy} tabIndex={panelId ? 0 : undefined}>
      <div className="model-alias-heading">
        <div>
          <h2>默认模型</h2>
          <p>给外部应用保留稳定的模型名称，需要切换厂商或模型时只在这里更改绑定。</p>
        </div>
        <button className="secondary-button compact" type="button" onClick={() => void reset()} disabled={Boolean(savingName) || loading}>
          <RotateCcw size={16} className={savingName === "reset" ? "spinning" : ""} />
          恢复默认
        </button>
      </div>

      <div className="model-alias-note">
        <ShieldCheck size={18} />
        <span>客户端继续填写 <code>tts-default</code>、<code>tts-fast</code> 或 <code>tts-hq</code>，无需跟着实际模型一起修改。</span>
      </div>

      {loading && <div className="model-alias-empty"><RefreshCw size={18} className="spinning" />正在读取默认模型配置...</div>}
      {!loading && !aliases.length && <div className="model-alias-empty">没有读取到默认模型配置，请重启 Voice Hub 后刷新页面。</div>}

      <div className="model-alias-grid">
        {aliases.map((item) => {
          const meta = aliasMeta[item.alias];
          const selected = selections[item.alias] || item.model_id;
          const selectedModel = synthesisModels.find((model) => model.gateway_id === selected);
          const dirty = selected !== item.model_id;
          return (
            <article className={`model-alias-card ${item.valid ? "" : "invalid"} tone-${meta.tone}`} key={item.alias}>
              <div className="model-alias-card-head">
                <div>
                  <span className="model-alias-kicker">{meta.label}</span>
                  <code>{item.alias}</code>
                </div>
                <span className={`model-alias-status ${item.valid ? "valid" : "invalid"}`}>{item.valid ? "已配置" : "需检查"}</span>
              </div>
              <p>{meta.description}</p>
              <label className="model-alias-field">
                <span>绑定实际模型</span>
                <select
                  aria-label={`${item.alias} 绑定模型`}
                  value={selected}
                  onChange={(event) => setSelections((current) => ({ ...current, [item.alias]: event.target.value }))}
                >
                  {Object.entries(modelGroups).map(([provider, group]) => (
                    <optgroup label={provider} key={provider}>
                      {group.map((model) => <option value={model.gateway_id} key={model.gateway_id}>{model.display_name}</option>)}
                    </optgroup>
                  ))}
                </select>
              </label>
              <div className="model-alias-current">
                <span>{selectedModel ? providerMeta[selectedModel.provider]?.label || selectedModel.provider : "当前模型"}</span>
                <code title={selected}>{selected}</code>
              </div>
              <button className="primary-button compact model-alias-save" type="button" disabled={Boolean(savingName) || !dirty} onClick={() => void save(item)}>
                <Save size={15} />{savingName === item.alias ? "保存中..." : dirty ? "保存绑定" : "已保存"}
              </button>
            </article>
          );
        })}
      </div>
      {message && <div className="form-message model-alias-message" role="status" aria-live="polite"><Check size={15} />{message}</div>}
    </div>
  );
}
