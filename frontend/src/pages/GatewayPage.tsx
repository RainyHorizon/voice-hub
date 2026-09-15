import { useEffect, useRef, useState } from "react";
import {
  Activity,
  Check,
  ChevronRight,
  CircleHelp,
  Code2,
  Copy,
  Download,
  Eye,
  EyeOff,
  FlaskConical,
  Gauge,
  Play,
  Radio,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Volume2,
  X,
} from "lucide-react";
import { api, responseError } from "../api";
import { WorkspaceHero } from "../components/WorkspaceHero";
import { handleTabListKeyDown } from "../components/tabs";
import { useStudio } from "../context/StudioContext";
import type { GatewayStats } from "../types";
import { credentialProviderIds, providerMeta, voiceMatchesModel } from "../utils";

type GatewayTestResult = {
  status: "idle" | "running" | "success" | "error" | "cancelled";
  message?: string;
  statusCode?: number;
  latency?: number;
  contentType?: string;
  size?: number;
  jobId?: string;
  chunks?: number;
  firstChunkLatency?: number;
  nativeStreaming?: boolean;
  format?: string;
};

export function GatewayPage() {
  const { gateway, models, voices } = useStudio();
  const [current, setCurrent] = useState(gateway);
  const [visibleKey, setVisibleKey] = useState(false);
  const [copied, setCopied] = useState("");
  const [rotating, setRotating] = useState(false);
  const [testModel, setTestModel] = useState("");
  const [testVoice, setTestVoice] = useState("");
  const [testText, setTestText] = useState("你好，这是一段 VoxNest 网关测试语音。 ");
  const [testFormat, setTestFormat] = useState("mp3");
  const [catalogTest, setCatalogTest] = useState<GatewayTestResult>({ status: "idle" });
  const [speechTest, setSpeechTest] = useState<GatewayTestResult>({ status: "idle" });
  const [streamTest, setStreamTest] = useState<GatewayTestResult>({ status: "idle" });
  const [testAudioUrl, setTestAudioUrl] = useState("");
  const [streamAudioUrl, setStreamAudioUrl] = useState("");
  const streamAbortRef = useRef<AbortController | null>(null);
  const [exampleTab, setExampleTab] = useState("powershell");
  const [stats, setStats] = useState<GatewayStats | null>(null);
  const [statsWindow, setStatsWindow] = useState("7d");
  const [statsProvider, setStatsProvider] = useState("");
  const [statsLoading, setStatsLoading] = useState(false);
  const [gatewayView, setGatewayView] = useState<"docs" | "test" | "stats">("docs");
  const [openEndpoint, setOpenEndpoint] = useState("");
  useEffect(() => setCurrent(gateway), [gateway]);
  const activeGateway = current || gateway;
  const base = activeGateway?.base_url || "http://127.0.0.1:8765/v1";
  const key = activeGateway?.key || "";
  const synthesisModels = models.filter((item) => item.operations.includes("synthesis"));
  const selectedTestModel = synthesisModels.find((item) => item.gateway_id === testModel);
  const compatibleVoices = voices.filter((item) => voiceMatchesModel(item, selectedTestModel));
  const streamFormat = selectedTestModel?.provider === "mimo" ? "pcm" : "mp3";

  const refreshStats = async () => {
    setStatsLoading(true);
    try {
      const query = new URLSearchParams({ window: statsWindow });
      if (statsProvider) query.set("provider", statsProvider);
      setStats(await api<GatewayStats>(`/api/gateway/stats?${query.toString()}`));
    } finally {
      setStatsLoading(false);
    }
  };

  useEffect(() => {
    if (!testModel && synthesisModels[0]) setTestModel(synthesisModels[0].gateway_id);
  }, [testModel, synthesisModels]);
  useEffect(() => {
    if (!compatibleVoices.some((item) => item.public_name === testVoice)) {
      setTestVoice(compatibleVoices[0]?.public_name || "alloy");
    }
  }, [compatibleVoices, testVoice]);
  useEffect(() => () => {
    if (testAudioUrl) URL.revokeObjectURL(testAudioUrl);
  }, [testAudioUrl]);
  useEffect(() => () => {
    streamAbortRef.current?.abort();
    if (streamAudioUrl) URL.revokeObjectURL(streamAudioUrl);
  }, [streamAudioUrl]);
  useEffect(() => {
    refreshStats().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statsWindow, statsProvider]);

  const endpoint = (path: string) => `${base.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
  const formatBytes = (size?: number) => {
    if (!size) return "-";
    return size < 1024 ? `${size} B` : `${(size / 1024).toFixed(1)} KB`;
  };
  const copy = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      window.setTimeout(() => setCopied(""), 1800);
    } catch {
      setCopied("复制失败");
    }
  };
  const rotate = async () => {
    if (!activeGateway?.managed || !window.confirm("轮换后旧网关 Key 会立即失效，确定继续吗？")) return;
    setRotating(true);
    try {
      const result = await api<{ key: string; key_hint: string; key_source: string; managed: boolean }>("/api/gateway/rotate", { method: "POST" });
      setCurrent({ ...activeGateway, key: result.key, key_hint: result.key_hint, key_source: result.key_source, managed: result.managed });
      setVisibleKey(true);
      setCopied("已生成新 Key");
    } catch (error) {
      setCopied(error instanceof Error ? error.message : "轮换失败");
    } finally {
      setRotating(false);
    }
  };
  const payload = {
    model: testModel || "tts-default",
    voice: testVoice || "alloy",
    input: testText,
    response_format: testFormat,
  };
  const ps = [
    '$headers = @{ Authorization = "Bearer ' + key + '" }',
    "$body = @" + "{ model = \"" + payload.model + "\"; voice = \"" + payload.voice + "\"; input = " + JSON.stringify(payload.input) + "; response_format = \"" + payload.response_format + "\" } | ConvertTo-Json",
    `Invoke-WebRequest "${endpoint("audio/speech")}" -Headers $headers -Method Post -ContentType "application/json" -Body $body -OutFile voice.${testFormat}`,
  ].join("\n");
  const curl = `curl "${endpoint("audio/speech")}" -H "Authorization: Bearer ${key}" -H "Content-Type: application/json" -d '${JSON.stringify(payload)}' --output voice.${testFormat}`;
  const python = `from pathlib import Path\nfrom openai import OpenAI\n\nclient = OpenAI(api_key=${JSON.stringify(key)}, base_url=${JSON.stringify(base)})\nwith client.audio.speech.with_streaming_response.create(\n    model=${JSON.stringify(payload.model)},\n    voice=${JSON.stringify(payload.voice)},\n    input=${JSON.stringify(payload.input)},\n    response_format=${JSON.stringify(payload.response_format)},\n) as response:\n    response.stream_to_file(Path("voice.${testFormat}"))`;
  const javascript = `import OpenAI from "openai";\nimport { writeFile } from "node:fs/promises";\n\nconst client = new OpenAI({ apiKey: ${JSON.stringify(key)}, baseURL: ${JSON.stringify(base)} });\nconst audio = await client.audio.speech.create(${JSON.stringify(payload, null, 2)});\nawait writeFile("voice.${testFormat}", Buffer.from(await audio.arrayBuffer()));`;
  const stream = `# SSE 流式网关（每个 audio 事件是一段 Base64 音频）\ncurl.exe -N "${endpoint("audio/speech/stream")}" -H "Authorization: Bearer ${key}" -H "Content-Type: application/json" -d '${JSON.stringify({ ...payload, chunk_size: 4096 })}'`;
  const examples: Record<string, string> = { powershell: ps, curl, python, javascript, stream };

  const testModels = async () => {
    setCatalogTest({ status: "running" });
    const started = performance.now();
    try {
      const response = await fetch(endpoint("models"), { headers: { Authorization: "Bearer " + key } });
      if (!response.ok) throw new Error(await responseError(response));
      const result = await response.json() as { data?: Array<{ id: string }> };
      setCatalogTest({ status: "success", statusCode: response.status, latency: Math.round(performance.now() - started), message: `${result.data?.length || 0} 个模型可用` });
    } catch (error) {
      setCatalogTest({ status: "error", latency: Math.round(performance.now() - started), message: error instanceof Error ? error.message : "模型发现失败" });
    }
  };

  const testSpeech = async () => {
    if (!key) return setSpeechTest({ status: "error", message: "尚未读取网关 Key" });
    if (!testText.trim()) return setSpeechTest({ status: "error", message: "请输入测试文本" });
    if (!compatibleVoices.length) return setSpeechTest({ status: "error", message: "当前模型没有兼容音色，请先在音色库导入或克隆音色" });
    setStreamTest({ status: "idle" });
    setSpeechTest({ status: "running" });
    const started = performance.now();
    try {
      const response = await fetch(endpoint("audio/speech"), {
        method: "POST",
        headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error(await responseError(response));
      const blob = await response.blob();
      if (testAudioUrl) URL.revokeObjectURL(testAudioUrl);
      const url = URL.createObjectURL(blob);
      setTestAudioUrl(url);
      setSpeechTest({
        status: "success",
        statusCode: response.status,
        latency: Math.round(performance.now() - started),
        contentType: response.headers.get("content-type") || blob.type,
        size: blob.size,
        jobId: response.headers.get("x-voice-studio-job") || undefined,
        message: "音频已返回",
      });
      refreshStats().catch(() => undefined);
    } catch (error) {
      setSpeechTest({ status: "error", latency: Math.round(performance.now() - started), message: error instanceof Error ? error.message : "语音测试失败" });
    }
  };

  const testStream = async () => {
    if (!key) return setStreamTest({ status: "error", message: "尚未读取网关 Key" });
    if (!testText.trim()) return setStreamTest({ status: "error", message: "请输入测试文本" });
    if (!compatibleVoices.length) return setStreamTest({ status: "error", message: "当前模型没有兼容音色，请先在音色库导入或克隆音色" });
    streamAbortRef.current?.abort();
    const controller = new AbortController();
    streamAbortRef.current = controller;
    setSpeechTest({ status: "idle" });
    setStreamTest({ status: "running" });
    const started = performance.now();
    const audioParts: BlobPart[] = [];
    let chunkCount = 0;
    let totalBytes = 0;
    let firstChunkLatency: number | undefined;
    let nativeStreaming = false;
    let jobId = "";
    let receivedFormat = streamFormat;
    try {
      const response = await fetch(endpoint("audio/speech/stream"), {
        method: "POST",
        headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, response_format: streamFormat, chunk_size: 4096 }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(await responseError(response));
      if (!response.body) throw new Error("网关没有返回可读取的流");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      const consume = (block: string) => {
        let event = "message";
        const dataLines: string[] = [];
        for (const line of block.split(/\r?\n/)) {
          if (line.startsWith("event:")) event = line.slice(6).trim();
          if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
        }
        if (!dataLines.length) return;
        const data = JSON.parse(dataLines.join("\n")) as { audio?: string; job_id?: string; format?: string; native_streaming?: boolean; error?: { message?: string } };
        if (event === "error") throw new Error(data.error?.message || "流式语音生成失败");
        if (event === "audio" && data.audio) {
          if (firstChunkLatency === undefined) firstChunkLatency = Math.round(performance.now() - started);
          const binary = atob(data.audio);
          const bytes = new Uint8Array(binary.length);
          for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
          audioParts.push(bytes as unknown as BlobPart);
          chunkCount += 1;
          totalBytes += bytes.byteLength;
        }
        if (event === "done") {
          jobId = data.job_id || jobId;
          nativeStreaming = Boolean(data.native_streaming);
          if (data.format) receivedFormat = data.format;
        }
      };
      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
        const blocks = buffer.split(/\r?\n\r?\n/);
        buffer = blocks.pop() || "";
        blocks.forEach(consume);
        if (done) break;
      }
      if (buffer.trim()) consume(buffer);
      if (!audioParts.length) throw new Error("流式响应没有音频分片");
      if (streamAudioUrl) URL.revokeObjectURL(streamAudioUrl);
      const blob = new Blob(audioParts, { type: receivedFormat === "mp3" ? "audio/mpeg" : "application/octet-stream" });
      setStreamAudioUrl(URL.createObjectURL(blob));
      setStreamTest({
        status: "success",
        statusCode: response.status,
        latency: Math.round(performance.now() - started),
        contentType: response.headers.get("content-type") || "text/event-stream",
        size: blob.size,
        jobId: jobId || response.headers.get("x-voice-studio-job") || undefined,
        chunks: chunkCount,
        firstChunkLatency,
        nativeStreaming,
        format: receivedFormat,
        message: nativeStreaming ? "已收到厂商原生音频分片" : "已收到网关兼容音频分片",
      });
      refreshStats().catch(() => undefined);
    } catch (error) {
      if (controller.signal.aborted) {
        setStreamTest({
          status: "cancelled",
          latency: Math.round(performance.now() - started),
          firstChunkLatency,
          chunks: chunkCount,
          size: totalBytes,
          message: chunkCount ? `已中止，取消前收到 ${chunkCount} 个分片` : "已中止，尚未收到音频分片",
        });
        window.setTimeout(() => refreshStats().catch(() => undefined), 250);
      } else {
        setStreamTest({ status: "error", latency: Math.round(performance.now() - started), message: error instanceof Error ? error.message : "流式语音测试失败" });
      }
    } finally {
      if (streamAbortRef.current === controller) streamAbortRef.current = null;
    }
  };

  const cancelStream = () => {
    streamAbortRef.current?.abort();
  };

  const statusLabel = (result: GatewayTestResult) => {
    if (result.status === "running") return "请求中";
    if (result.status === "success") return "通过";
    if (result.status === "error") return "失败";
    if (result.status === "cancelled") return "已取消";
    return "未测试";
  };
  const catalogLabel = catalogTest.status === "success"
    ? `${catalogTest.message} · ${catalogTest.latency}ms`
    : catalogTest.status === "error"
      ? catalogTest.message || "模型发现失败"
      : catalogTest.status === "running"
        ? "正在请求 /v1/models..."
        : "尚未检查模型目录";
  const displayedTest = streamTest.status !== "idle" ? streamTest : speechTest;
  const formatLatency = (value: number | null) => value === null ? "--" : `${value}ms`;
  const statsProviderLabel = (id: string) => providerMeta[id]?.label || id;
  const endpointDocs = [
    {
      id: "models",
      method: "GET",
      path: "/v1/models",
      description: "列出四家厂商当前可用的语音模型。",
      request: "无请求体。使用 Bearer 网关 Key 鉴权。",
      response: "OpenAI 模型列表，模型 ID 可直接用于语音生成请求。",
      note: "适合在客户端启动时发现模型并刷新模型选择器。",
      example: `curl "${endpoint("models")}" -H "Authorization: Bearer $VOICE_STUDIO_API_KEY"`,
    },
    {
      id: "speech",
      method: "POST",
      path: "/v1/audio/speech",
      description: "使用 OpenAI 兼容格式生成完整音频文件。",
      request: "JSON：model、voice、input、response_format，可选 speed 与 instructions。",
      response: "返回 MP3、WAV、OPUS、AAC、FLAC 或 PCM 音频数据。",
      note: "模型与音色必须来自同一厂商并处于兼容作用域。",
      example: `curl "${endpoint("audio/speech")}" \\\n  -H "Authorization: Bearer $VOICE_STUDIO_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '${JSON.stringify(payload)}' --output voice.${testFormat}`,
    },
    {
      id: "stream",
      method: "POST",
      path: "/v1/audio/speech/stream",
      description: "通过 SSE 持续返回 Base64 编码的音频分片。",
      request: "与非流式接口相同，可额外传入 chunk_size 控制兼容分片大小。",
      response: "依次返回 audio、done 或 error 事件；done 中包含任务与上游流式状态。",
      note: "MiMo 当前返回 PCM，其他支持模型优先使用厂商原生 MP3 流。",
      example: `curl.exe -N "${endpoint("audio/speech/stream")}" \\\n  -H "Authorization: Bearer $VOICE_STUDIO_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '${JSON.stringify({ ...payload, chunk_size: 4096 })}'`,
    },
  ];
  return (
    <section className="page-section gateway-page">
      <div className="gateway-header">
        <WorkspaceHero
          title="把 VoxNest"
          accent="接入你的应用。"
          description="使用 OpenAI 兼容接口调用四家语音模型。外部应用只需要 Base URL 和网关 Key，厂商凭据始终留在本机后端。"
        />
      </div>

      <section className="gateway-overview-grid" aria-label="网关凭据与快速开始">
        <div className="gateway-overview-primary">
          <div className="gateway-current-key">
            <div className="gateway-key-heading">
              <h3>当前网关 Key</h3>
              <span className="gateway-key-state"><span className="live-dot" />有效</span>
            </div>
            <div className="gateway-key-value">
              <code>{visibleKey ? key : (activeGateway?.key_hint || "未读取")}</code>
              <button className="icon-button" onClick={() => setVisibleKey((value) => !value)} title={visibleKey ? "隐藏网关 Key" : "显示网关 Key"} aria-label={visibleKey ? "隐藏网关 Key" : "显示网关 Key"}>
                {visibleKey ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
              <button className="icon-button" onClick={() => copy("网关 Key", key)} title="复制网关 Key" aria-label="复制网关 Key"><Copy size={16} /></button>
            </div>
            <div className="gateway-key-footer">
              <span>来源：{activeGateway?.key_source || "本地配置"}</span>
              <button className="secondary-button" disabled={!activeGateway?.managed || rotating} onClick={rotate}>
                <RotateCcw size={14} className={rotating ? "spinning" : ""} />
                {rotating ? "正在轮换" : "轮换网关 Key"}
              </button>
            </div>
            {copied && <div className="copy-feedback"><Check size={14} />{copied}</div>}
          </div>
          <div className="gateway-quickstart-card">
            <div className="gateway-quickstart-title">
              <span><Code2 size={18} />快速开始</span>
              <button className="quickstart-copy" onClick={() => copy("连接信息", `${base}\nBearer ${key}`)} title="复制连接信息"><Copy size={15} />复制</button>
            </div>
            <div className="gateway-quickstart-grid">
              <div><span>Base URL</span><code>{base}</code></div>
              <div><span>鉴权方式</span><code>Bearer $VOICE_STUDIO_API_KEY</code></div>
            </div>
            <p>把 Base URL 填入支持 OpenAI 的客户端，并将当前网关 Key 作为 API Key。</p>
          </div>
        </div>
        <div className="gateway-overview-secondary">
          <div className="gateway-credential-intro">
            <h3>网关访问凭据</h3>
            <p>这枚密钥用于本机应用访问统一语音网关，不会替代已保存的厂商 API Key。</p>
            <div className="gateway-credential-facts">
              <div><span>监听范围</span><strong>仅本机</strong></div>
              <div><span>管理方式</span><strong>{activeGateway?.managed ? "应用托管" : "环境变量"}</strong></div>
            </div>
          </div>
          <aside className="gateway-quickstart-aside">
            <div className="gateway-security-message">
              <ShieldCheck size={21} />
              <p>网关 Key 只应保存在受信任的本机应用中，不要放入公开网页、日志或源码仓库。</p>
            </div>
            <div className="gateway-error-format">
              <Code2 size={19} />
              <strong>错误格式</strong>
              <p>失败响应包含稳定错误码与可读消息。</p>
              <code>{'{"detail":{"code":"INVALID_API_KEY","message":"..."}}'}</code>
            </div>
          </aside>
        </div>
      </section>

      <div className="gateway-view-tabs" role="tablist" aria-label="网关页面" onKeyDown={handleTabListKeyDown}>
        <button id="gateway-tab-docs" type="button" role="tab" aria-controls="gateway-panel-docs" aria-selected={gatewayView === "docs"} tabIndex={gatewayView === "docs" ? 0 : -1} className={gatewayView === "docs" ? "selected" : ""} onClick={() => setGatewayView("docs")}><Code2 size={16} />接入文档</button>
        <button id="gateway-tab-test" type="button" role="tab" aria-controls="gateway-panel-test" aria-selected={gatewayView === "test"} tabIndex={gatewayView === "test" ? 0 : -1} className={gatewayView === "test" ? "selected" : ""} onClick={() => setGatewayView("test")}><FlaskConical size={16} />接口测试</button>
        <button id="gateway-tab-stats" type="button" role="tab" aria-controls="gateway-panel-stats" aria-selected={gatewayView === "stats"} tabIndex={gatewayView === "stats" ? 0 : -1} className={gatewayView === "stats" ? "selected" : ""} onClick={() => setGatewayView("stats")}><Gauge size={16} />运行统计</button>
      </div>

      {gatewayView === "docs" && (
        <section id="gateway-panel-docs" className="gateway-docs" role="tabpanel" aria-labelledby="gateway-tab-docs" tabIndex={0}>
          <div className="gateway-docs-heading">
            <h3>OpenAI 兼容接口</h3>
            <span>{endpointDocs.length} 个端点</span>
          </div>
          {endpointDocs.map((item) => {
            const expanded = openEndpoint === item.id;
            return (
              <article className={expanded ? "gateway-endpoint expanded" : "gateway-endpoint"} key={item.id}>
                <button className="gateway-endpoint-trigger" aria-expanded={expanded} onClick={() => setOpenEndpoint(expanded ? "" : item.id)}>
                  <span className={item.method === "GET" ? "gateway-method get" : "gateway-method post"}>{item.method}</span>
                  <code>{item.path}</code>
                  <span className="gateway-endpoint-summary">{item.description}</span>
                  <ChevronRight size={17} />
                </button>
                {expanded && (
                  <div className="gateway-endpoint-body">
                    <div className="gateway-endpoint-details">
                      <div><span>请求</span><p>{item.request}</p></div>
                      <div><span>响应</span><p>{item.response}</p></div>
                      <div><span>注意</span><p>{item.note}</p></div>
                    </div>
                    <div className="gateway-doc-code">
                      <div><span>cURL</span><button className="quickstart-copy" onClick={() => copy(`${item.method} ${item.path}`, item.example)}><Copy size={14} />复制</button></div>
                      <pre>{item.example}</pre>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </section>
      )}

      {gatewayView === "stats" && <section id="gateway-panel-stats" className="gateway-observability" role="tabpanel" aria-labelledby="gateway-tab-stats" tabIndex={0}>
        <div className="observability-head">
          <div>
            <h3>运行统计</h3>
            <p>仅统计本版本启用记录后的网关语音请求，不混入旧任务数据。</p>
          </div>
          <div className="observability-controls">
            <div className="segmented compact-segmented">
              {[['24h', '24 小时'], ['7d', '7 天'], ['30d', '30 天'], ['all', '全部']].map(([id, label]) => (
                <button className={statsWindow === id ? "selected" : ""} onClick={() => setStatsWindow(id)} key={id}>{label}</button>
              ))}
            </div>
            <select value={statsProvider} onChange={(event) => setStatsProvider(event.target.value)} aria-label="筛选统计来源">
              <option value="">全部来源</option>
              {credentialProviderIds.map((id) => <option value={id} key={id}>{providerMeta[id].label}</option>)}
            </select>
            <button className="icon-button" onClick={() => refreshStats()} title="刷新统计" disabled={statsLoading}>
              <RefreshCw size={15} className={statsLoading ? "spinning" : ""} />
            </button>
          </div>
        </div>
        {!stats && statsLoading ? (
          <div className="stats-empty"><RefreshCw size={17} className="spinning" />正在读取网关统计...</div>
        ) : stats && stats.total_requests > 0 ? (
          <>
            <div className="gateway-stat-strip">
              <div><span>请求</span><strong>{stats.total_requests}</strong><small>{stats.completed_requests} 成功 · {stats.failed_requests} 失败</small></div>
              <div><span>成功率</span><strong>{stats.success_rate}%</strong><small>{stats.sample_count} 个已记录样本</small></div>
              <div><span>首片 P50 / P95</span><strong>{formatLatency(stats.first_chunk_latency.p50)} <i>/</i> {formatLatency(stats.first_chunk_latency.p95)}</strong><small>{stats.first_chunk_latency.samples} 个流式样本</small></div>
              <div><span>总耗时 P50 / P95</span><strong>{formatLatency(stats.total_latency.p50)} <i>/</i> {formatLatency(stats.total_latency.p95)}</strong><small>{stats.total_latency.samples} 个耗时样本</small></div>
              <div><span>取消</span><strong>{stats.cancelled_requests}</strong><small>客户端主动中断</small></div>
            </div>
            <div className="observability-detail">
              <div className="stats-table">
                <div className="stats-table-head"><span>维度</span><span>请求</span><span>成功率</span><span>首片 P95</span><span>总耗时 P95</span></div>
                {stats.by_provider.map((item) => (
                  <div className="stats-table-row provider-row" key={`provider-${item.name}`}>
                    <span><b>{statsProviderLabel(item.name)}</b><small>来源</small></span><code>{item.requests}</code><code>{item.success_rate}%</code><code>{formatLatency(item.first_chunk_latency.p95)}</code><code>{formatLatency(item.total_latency.p95)}</code>
                  </div>
                ))}
                {stats.by_model.slice(0, 8).map((item) => (
                  <div className="stats-table-row" key={`model-${item.name}`}>
                    <span><b>{item.name.split('/').pop()}</b><small>{statsProviderLabel(item.name.split('/')[0])} · 模型</small></span><code>{item.requests}</code><code>{item.success_rate}%</code><code>{formatLatency(item.first_chunk_latency.p95)}</code><code>{formatLatency(item.total_latency.p95)}</code>
                  </div>
                ))}
              </div>
              <div className="error-summary">
                <div className="error-summary-head"><Activity size={15} /><span>错误聚合</span></div>
                {stats.errors.length ? stats.errors.slice(0, 6).map((item) => (
                  <div className="error-summary-row" key={item.code}><code>{item.code}</code><strong>{item.count}</strong></div>
                )) : <div className="error-summary-empty"><Check size={16} />当前范围没有失败请求</div>}
              </div>
            </div>
          </>
        ) : (
          <div className="stats-empty"><Gauge size={18} /><span>当前范围还没有网关语音请求。完成一次接口测试后会开始显示统计。</span></div>
        )}
      </section>}
      {gatewayView === "test" && <div id="gateway-panel-test" className="gateway-testbench" role="tabpanel" aria-labelledby="gateway-tab-test" tabIndex={0}>
        <div className="testbench-header">
          <div>
            <h3>接口测试台</h3>
            <p>先测试模型发现，再用一小段文字确认网关、音色和厂商凭据都能正常工作。</p>
          </div>
          <div className="testbench-actions">
            <span className={"catalog-result " + catalogTest.status}>{catalogLabel}</span>
            <button className="secondary-button" onClick={testModels} disabled={catalogTest.status === "running" || !key}>
              <FlaskConical size={15} className={catalogTest.status === "running" ? "spinning" : ""} />
              {catalogTest.status === "running" ? "测试中..." : "测试模型接口"}
            </button>
          </div>
        </div>
        <div className="testbench-grid">
          <div className="test-request">
            <div className="test-field-row">
              <label>模型<select value={testModel} onChange={(event) => setTestModel(event.target.value)}>
                {credentialProviderIds.map((provider) => {
                  const items = synthesisModels.filter((item) => item.provider === provider);
                  if (!items.length) return null;
                  return <optgroup label={providerMeta[provider].label} key={provider}>{items.map((item) => <option value={item.gateway_id} key={item.gateway_id}>{item.display_name}</option>)}</optgroup>;
                })}
              </select></label>
              <label>音色<select value={testVoice} onChange={(event) => setTestVoice(event.target.value)} disabled={!compatibleVoices.length}>
                {!compatibleVoices.length && <option value="alloy">alloy（请先导入兼容音色）</option>}
                {compatibleVoices.map((item) => <option value={item.public_name} key={item.id}>{item.display_name} · {item.public_name}</option>)}
              </select></label>
            </div>
            <label className="test-field">测试文本<textarea value={testText} onChange={(event) => setTestText(event.target.value)} maxLength={500} /></label>
            <div className="test-controls">
              <div><span>格式</span><div className="segmented">{["mp3", "wav"].map((item) => <button className={testFormat === item ? "selected" : ""} onClick={() => setTestFormat(item)} key={item}>{item.toUpperCase()}</button>)}</div></div>
              <button className="primary-button compact" onClick={testSpeech} disabled={speechTest.status === "running" || streamTest.status === "running" || !key || !testModel || !compatibleVoices.length}><Play size={15} />{speechTest.status === "running" ? "生成中..." : "测试语音接口"}</button>
              {streamTest.status === "running"
                ? <button className="secondary-button compact" onClick={cancelStream}><X size={15} />取消流式</button>
                : <button className="secondary-button compact" onClick={testStream} disabled={speechTest.status === "running" || !key || !testModel || !compatibleVoices.length}><Radio size={15} />测试流式{selectedTestModel?.provider === "mimo" ? " · PCM" : ""}</button>}
            </div>
            {selectedTestModel && <div className="test-model-note"><span className={"provider-mark " + providerMeta[selectedTestModel.provider]?.tone}>{providerMeta[selectedTestModel.provider]?.mark}</span><span><strong>{selectedTestModel.display_name}</strong><small>厂商接口 · {compatibleVoices.length} 个兼容音色</small></span></div>}
          </div>
          <div className="test-result">
            <div className="result-head"><span>响应结果</span><span className={"test-status " + displayedTest.status}><span className="status-dot" />{statusLabel(displayedTest)}</span></div>
            {speechTest.status === "idle" && streamTest.status === "idle" && <div className="test-empty"><Radio size={18} /><span>生成一段测试音频后，响应信息会显示在这里。</span></div>}
            {speechTest.status === "running" && <div className="test-empty"><RefreshCw size={18} className="spinning" /><span>正在请求 /v1/audio/speech...</span></div>}
            {speechTest.status === "error" && <div className="test-error"><CircleHelp size={17} /><span>{speechTest.message}</span></div>}
            {speechTest.status === "success" && <>
              <div className="result-metrics"><div><span>HTTP</span><strong>{speechTest.statusCode}</strong></div><div><span>延迟</span><strong>{speechTest.latency}ms</strong></div><div><span>大小</span><strong>{formatBytes(speechTest.size)}</strong></div></div>
              {testAudioUrl && <div className="test-player"><Volume2 size={16} /><audio controls src={testAudioUrl} /><a className="download-button" href={testAudioUrl} download={`gateway-test.${testFormat}`} title="下载测试音频"><Download size={16} /></a></div>}
              <div className="result-detail"><span>Content-Type</span><code>{speechTest.contentType}</code>{speechTest.jobId && <><span>Job</span><code>{speechTest.jobId}</code></>}</div>
            </>}
            {streamTest.status === "running" && <div className="test-empty stream-live"><RefreshCw size={18} className="spinning" /><span>正在读取 /v1/audio/speech/stream...</span></div>}
            {streamTest.status === "error" && <div className="test-error"><CircleHelp size={17} /><span>{streamTest.message}</span></div>}
            {streamTest.status === "cancelled" && <>
              <div className="test-cancelled"><X size={17} /><span>{streamTest.message}</span></div>
              <div className="result-metrics stream-metrics"><div><span>首片</span><strong>{streamTest.firstChunkLatency === undefined ? "--" : `${streamTest.firstChunkLatency}ms`}</strong></div><div><span>取消耗时</span><strong>{streamTest.latency}ms</strong></div><div><span>已收分片</span><strong>{streamTest.chunks || 0}</strong></div><div><span>已收大小</span><strong>{formatBytes(streamTest.size)}</strong></div></div>
            </>}
            {streamTest.status === "success" && <>
              <div className="result-metrics stream-metrics"><div><span>首片</span><strong>{streamTest.firstChunkLatency}ms</strong></div><div><span>总耗时</span><strong>{streamTest.latency}ms</strong></div><div><span>分片</span><strong>{streamTest.chunks}</strong></div><div><span>大小</span><strong>{formatBytes(streamTest.size)}</strong></div></div>
              {streamAudioUrl && <div className="test-player">{streamTest.format === "pcm" ? <><Volume2 size={16} /><span className="test-audio-note">PCM 原始数据（24kHz / 16-bit / 单声道）</span></> : <><Volume2 size={16} /><audio controls src={streamAudioUrl} /></>}<a className="download-button" href={streamAudioUrl} download={`gateway-stream.${streamTest.format || "mp3"}`} title="下载流式音频"><Download size={16} /></a></div>}
              <div className="result-detail"><span>状态</span><code>{streamTest.message}</code><span>格式</span><code>{streamTest.format || "mp3"}</code><span>HTTP</span><code>{streamTest.statusCode}</code>{streamTest.nativeStreaming !== undefined && <><span>上游</span><code>{streamTest.nativeStreaming ? "原生分片" : "网关兼容分片"}</code></>}{streamTest.jobId && <><span>Job</span><code>{streamTest.jobId}</code></>}</div>
            </>}
          </div>
        </div>
        <div className="gateway-examples">
          <div className="examples-head"><strong>当前请求示例</strong><button className="inline-copy" onClick={() => copy(exampleTab, examples[exampleTab])} title="复制当前示例"><Copy size={14} /></button></div>
          <div className="example-tabs">{[["powershell", "PowerShell"], ["curl", "curl"], ["python", "Python"], ["javascript", "JavaScript"], ["stream", "SSE 流式"]].map(([id, label]) => <button className={exampleTab === id ? "selected" : ""} onClick={() => setExampleTab(id)} key={id}>{label}</button>)}</div>
          <pre>{examples[exampleTab]}</pre>
        </div>
      </div>}
    </section>
  );
}

