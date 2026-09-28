import { useEffect, useMemo, useState } from "react";
import { Volume2, WandSparkles } from "lucide-react";
import { ExclusiveAudio } from "../components/ExclusiveAudio";
import { ProviderSelector } from "../components/ProviderSelector";
import { useStudio } from "../context/StudioContext";
import type { Voice } from "../types";
import { credentialProviderIds, providerMeta } from "../utils";

export function DesignPage() {
  const { models, designVoice: onDesign } = useStudio();
  const designModels = useMemo(() => models.filter((item) => item.operations.includes("design")), [models]);
  const [provider, setProvider] = useState("mimo");
  const [modelId, setModelId] = useState("mimo-v2.5-tts-voicedesign");
  const [prompt, setPrompt] = useState("年轻女性，声音清亮柔和，语速稍快，带有自然上扬的活泼语调，适合科技产品介绍。");
  const [previewText, setPreviewText] = useState("大家好，欢迎来到今天的声音实验室。让我们用一段自然的问候，听听这个全新的声音。 ");
  const [displayName, setDisplayName] = useState("我的设计音色");
  const [publicName, setPublicName] = useState("design-" + Date.now().toString().slice(-6));
  const [working, setWorking] = useState(false);
  const [previewVoice, setPreviewVoice] = useState<Voice | null>(null);
  const providerModels = designModels.filter((item) => item.provider === provider);
  const selected = designModels.find((item) => item.provider === provider && item.model_id === modelId);
  const promptLimit = selected?.design_prompt_max ?? 2000;
  const previewMin = selected?.design_preview_min ?? 1;
  const previewLimit = selected?.design_preview_max ?? 2000;
  const promptInvalid = prompt.length > promptLimit;
  const previewInvalid = previewText.length < previewMin || previewText.length > previewLimit;
  const designProviderIds = credentialProviderIds.filter((id) =>
    designModels.some((item) => item.provider === id),
  );

  useEffect(() => {
    if (selected) return;
    const first = providerModels[0] || designModels[0];
    if (first) {
      setProvider(first.provider);
      setModelId(first.model_id);
    }
  }, [designModels, providerModels, selected]);

  const chooseProvider = (nextProvider: string) => {
    setProvider(nextProvider);
    const first = designModels.find((item) => item.provider === nextProvider);
    if (first) setModelId(first.model_id);
    setPreviewVoice(null);
  };
  const submit = async () => {
    if (!selected || !prompt.trim() || !previewText.trim() || promptInvalid || previewInvalid || !displayName.trim() || !publicName.trim()) return;
    setWorking(true);
    try {
      const voice = await onDesign({
        provider,
        model_id: modelId,
        prompt: prompt.trim(),
        preview_text: previewText.trim(),
        display_name: displayName.trim(),
        public_name: publicName.trim(),
      });
      setPreviewVoice(voice);
    } finally {
      setWorking(false);
    }
  };

  return (
    <section className="page-section design-page">
      <div className="design-hero">
        <div>
          <h2>先写下声音的性格，<br /><em>再让它开口。</em></h2>
          <p>不需要参考音频。用自然语言描述年龄、质感、语速和情绪，创建一枚可以复用的设计音色。</p>
        </div>
      </div>
      <div className="design-layout">
        <div className="design-form">
          <h3 className="design-section-title">选择设计引擎</h3>
          <div className="design-engine-grid">
            <ProviderSelector
              className="design-provider-selector"
              label="声音设计厂商"
              value={provider}
              onChange={chooseProvider}
              options={designProviderIds.map((id) => ({
                id,
                label: providerMeta[id].label,
                mark: providerMeta[id].mark,
                tone: providerMeta[id].tone,
                detail: `${designModels.filter((item) => item.provider === id).length} 个设计模型`,
              }))}
            />
            <div className="design-model-field">
              <label htmlFor="design-model">设计模型</label>
              <select
                id="design-model"
                translate="no"
                value={modelId}
                onChange={(event) => setModelId(event.target.value)}
              >
                {providerModels.map((item) => <option value={item.model_id} key={item.gateway_id}>{item.display_name}</option>)}
              </select>
            </div>
          </div>
          <h3 className="design-section-title design-section-spaced">描述你想要的声音</h3>
          <div className="design-copy-grid">
            <div className="design-copy-field">
              <label htmlFor="design-prompt">声音描述</label>
              <div className="design-textarea-wrap">
                <textarea id="design-prompt" className="design-prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} aria-invalid={promptInvalid} />
                <div className={promptInvalid ? "design-count invalid" : "design-count"}>{prompt.length} / {promptLimit.toLocaleString()}</div>
              </div>
            </div>
            <div className="design-copy-field">
              <label htmlFor="design-preview-text">试听文本</label>
              <div className="design-textarea-wrap">
                <textarea id="design-preview-text" className="design-preview-text" value={previewText} onChange={(event) => setPreviewText(event.target.value)} aria-invalid={previewInvalid} />
                <div className={previewInvalid ? "design-count invalid" : "design-count"}>{previewText.length} / {previewLimit.toLocaleString()}{previewMin > 1 ? `，至少 ${previewMin}` : ""}</div>
              </div>
            </div>
          </div>
          <div className="design-action-grid">
            <div className="form-grid design-names"><div><label>显示名称</label><input value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></div><div><label>兼容别名</label><input value={publicName} onChange={(event) => setPublicName(event.target.value)} /></div></div>
            <button className="primary-button design-submit" onClick={() => void submit()} disabled={working || !selected || !prompt.trim() || !previewText.trim() || promptInvalid || previewInvalid || !displayName.trim() || !publicName.trim()}><WandSparkles size={17} />{working ? "正在设计..." : "创建并试听音色"}</button>
          </div>
          {previewVoice && (
            <div className="design-preview-result" aria-live="polite">
              <div className="design-preview-icon"><Volume2 size={20} /></div>
              <div className="design-preview-main">
                <span>试听结果</span>
                <strong>{previewVoice.display_name}</strong>
                <small>{previewVoice.provider === "mimo" ? "请求级设计模板" : "已保存到音色库"} · {previewVoice.public_name}</small>
                {previewVoice.preview_url && <ExclusiveAudio controls src={previewVoice.preview_url} />}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
