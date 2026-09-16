import {
  Download,
  Gauge,
  Plus,
  Settings2,
  Sparkles,
  Volume2,
} from "lucide-react";
import { WorkspaceHero } from "../components/WorkspaceHero";
import { useStudio } from "../context/StudioContext";
import { credentialProviderIds, providerMeta, sample, voiceMatchesModel } from "../utils";

export function SynthesisPage() {
  const p = useStudio();
  const synthesisModels = p.models.filter((item) =>
    item.operations.includes("synthesis"),
  );
  const synthesisProviderIds = ["demo", ...credentialProviderIds].filter((id) =>
    synthesisModels.some((item) => item.provider === id),
  );
  const selectedProvider =
    p.selectedModel?.provider || synthesisModels[0]?.provider || "";
  const providerModels = synthesisModels.filter(
    (item) => item.provider === selectedProvider,
  );
  const compatibleVoices = p.voices.filter((item) =>
    voiceMatchesModel(item, p.selectedModel),
  );
  const selectedVoiceValue = compatibleVoices.some(
    (item) => item.public_name === p.voice,
  )
    ? p.voice
    : "";
  const chooseProvider = (provider: string) => {
    const first = synthesisModels.find((item) => item.provider === provider);
    if (first) p.setModel(first.gateway_id);
  };
  const speedPosition = p.speed <= 1
    ? ((p.speed - 0.5) / 0.5) * 50
    : 50 + ((p.speed - 1) / 1) * 50;
  const changeSpeed = (position: number) => {
    const speed = position <= 50
      ? 0.5 + (position / 50) * 0.5
      : 1 + ((position - 50) / 50);
    p.setSpeed(Math.round(speed * 10) / 10);
  };

  return (
    <section className="synthesis-workspace">
      <WorkspaceHero
        title="把文字变成"
        accent="可听见的质感。"
        description="输入一段文字，选择合适的厂商、模型与音色，生成自然流畅的语音。"
      />
      <div className="synthesis-layout">
        <div className="editor-column">
        <div className="section-heading">
          <div>
            <h2>输入一段文字</h2>
          </div>
          <span className="char-count">
            {p.text.length.toLocaleString()} / 10,000
          </span>
        </div>
        <div className="script-editor">
          <textarea
            value={p.text}
            onChange={(e) => p.setText(e.target.value)}
            maxLength={10000}
            spellCheck={false}
          />
          <div className="editor-footer">
            <span>支持中文、英文与混合文本</span>
            <button className="ghost-button" onClick={() => p.setText(sample)}>
              填入示例
            </button>
          </div>
        </div>
        <div className="mini-stats">
          <div>
            <span>预估时长</span>
            <strong>{Math.max(1, Math.round(p.text.length * 0.05))}s</strong>
          </div>
          <div>
            <span>调用方式</span>
            <strong>{p.selectedModel?.mode === "demo" ? "本地演示" : "厂商 API"}</strong>
          </div>
          <div>
            <span>输出</span>
            <strong>{p.format.toUpperCase()}</strong>
          </div>
        </div>
      </div>
      <section className="synthesis-settings" aria-labelledby="synthesis-settings-title">
        <h3 id="synthesis-settings-title"><Settings2 size={18} />设置</h3>
        <div className="synthesis-settings-grid">
          <label>服务来源<select value={selectedProvider} onChange={(event) => chooseProvider(event.target.value)}>
            {synthesisProviderIds.map((id) => <option value={id} key={id}>{providerMeta[id].label}</option>)}
          </select></label>
          <div className="synthesis-model-field">
            <label>模型<select value={p.model} onChange={(event) => p.setModel(event.target.value)}>
              {providerModels.map((item) => <option value={item.gateway_id} key={item.gateway_id}>{item.display_name}</option>)}
            </select></label>
            {p.selectedModel && <div className="model-meta"><span className={`provider-mark ${providerMeta[p.selectedModel.provider]?.tone}`}>{providerMeta[p.selectedModel.provider]?.mark}</span><div><strong>{p.selectedModel.quality}质感</strong><small>{p.selectedModel.latency}响应 · {p.selectedModel.mode === "demo" ? "本地演示" : "厂商接口"}</small></div></div>}
          </div>
          <div className="synthesis-voice-field">
            <label>音色<select value={selectedVoiceValue} onChange={(event) => p.setVoice(event.target.value)} disabled={!compatibleVoices.length}>
              {!compatibleVoices.length && <option value="">请先创建或导入兼容音色</option>}
              {compatibleVoices.map((item) => <option value={item.public_name} key={item.id}>{item.display_name} · {item.public_name}</option>)}
            </select></label>
            <button className="inline-action" type="button" onClick={() => p.setActive("clone")}><Plus size={15} />创建或克隆音色</button>
          </div>
          {(p.selectedModel?.model_id === "qwen3-tts-instruct-flash" || p.selectedModel?.model_id === "seed-tts-2.0") && (
            <label className="synthesis-instruction-field">表达指令<input value={p.instructions} onChange={(event) => p.setInstructions(event.target.value)} placeholder="例如：温暖、克制，结尾轻微上扬" /></label>
          )}
        </div>
        <div className="synthesis-tuning-grid">
          <div className="synthesis-speed-setting">
            <div className="range-label"><label>语速</label><output>{p.speed.toFixed(1)}×</output></div>
            <input type="range" min="0" max="100" step="1" value={speedPosition} aria-valuetext={`${p.speed.toFixed(1)} 倍`} onChange={(event) => changeSpeed(Number(event.target.value))} />
            <div className="range-scale"><span>慢</span><span>自然</span><span>快</span></div>
          </div>
          <div className="synthesis-format-setting">
            <label>输出格式</label>
            <div className="segmented">{["wav", "mp3"].map((item) => <button className={p.format === item ? "selected" : ""} type="button" onClick={() => p.setFormat(item)} key={item}>{item.toUpperCase()}</button>)}</div>
          </div>
        </div>
        <div className="control-note"><Gauge size={16} /><span>{p.selectedModel?.mode === "demo" ? "本地演示无需配置厂商凭据，可直接生成测试音频。" : "当前模型会调用已保存的厂商凭据，结果来自对应厂商的语音服务。"}</span></div>
      </section>
      <div className="generate-row">
        <button className="primary-button" onClick={() => void p.synthesize()} disabled={p.busy || !selectedVoiceValue}><Sparkles size={17} />{p.busy ? "生成中..." : "生成语音"}</button>
      </div>
      {p.audioUrl && (
        <div className="player latest-player">
          <div className="player-icon"><Volume2 size={20} /></div>
          <div className="player-main"><div className="player-title"><strong>刚刚生成</strong><span>{p.selectedVoice?.display_name || p.voice} · {p.format.toUpperCase()}</span></div><p className="player-text">{p.text}</p><audio controls src={p.audioUrl} /></div>
          <a className="download-button" href={p.audioUrl} download={"voice-studio." + p.format} title="下载"><Download size={17} /></a>
        </div>
      )}
      </div>
    </section>
  );
}
