import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Activity,
  Check,
  ChevronRight,
  CircleHelp,
  Code2,
  Copy,
  Eye,
  EyeOff,
  FlaskConical,
  Gauge,
  KeyRound,
  Play,
  Radio,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useConfirm } from "@/components/feedback/ConfirmProvider";
import { cn } from "@/lib/utils";
import { api, responseError } from "../api";
import { pcmChunksToWavBlob, type PcmInfo } from "../audio";
import { AudioPreview } from "../audio/AudioPreview";
import { ProviderMark } from "../components/ProviderMark";
import { Field, Note } from "../components/form/Field";
import { PageHeader } from "../components/layout/PageHeader";
import { useStudio } from "../context/StudioContext";
import type { GatewayAlias, GatewayStats } from "../types";
import { apiTestModels, credentialProviderIds, providerMeta, voiceMatchesModel } from "../utils";

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

type GatewayView = "docs" | "test" | "stats";

const segmentItem = "h-8 rounded-sm px-3 text-[13px] data-[state=on]:bg-card data-[state=on]:text-foreground data-[state=on]:shadow-sm";
const exampleTabs = [
  ["powershell", "PowerShell"],
  ["curl", "curl"],
  ["python", "Python"],
  ["javascript", "JavaScript"],
  ["stream", "SSE 流式"],
] as const;
const statsWindows = [
  ["24h", "24 小时"],
  ["7d", "7 天"],
  ["30d", "30 天"],
  ["all", "全部"],
] as const;

export function GatewayPage() {
  const { gateway, models, voices } = useStudio();
  const confirm = useConfirm();
  const [current, setCurrent] = useState(gateway);
  const [visibleKey, setVisibleKey] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [testModel, setTestModel] = useState("");
  const [testVoice, setTestVoice] = useState("");
  const [testText, setTestText] = useState("你好，这是一段 Voice Hub 网关测试语音。 ");
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
  const [gatewayView, setGatewayView] = useState<GatewayView>("docs");
  const [openEndpoint, setOpenEndpoint] = useState("");
  const [aliases, setAliases] = useState<GatewayAlias[]>([]);
  const [aliasSelections, setAliasSelections] = useState<Record<string, string>>({});
  const [aliasSaving, setAliasSaving] = useState(false);
  const [aliasSavingName, setAliasSavingName] = useState("");
  const [aliasMessage, setAliasMessage] = useState("");
  const [aliasLoading, setAliasLoading] = useState(true);
  useEffect(() => setCurrent(gateway), [gateway]);
  const refreshAliases = async () => {
    const result = await api<{ aliases: GatewayAlias[] }>("/api/gateway/aliases");
    setAliases(result.aliases);
    setAliasSelections(Object.fromEntries(result.aliases.map((item) => [item.alias, item.model_id])));
  };
  useEffect(() => {
    setAliasLoading(true);
    refreshAliases().catch((error) => setAliasMessage(error instanceof Error ? `模型别名加载失败：${error.message}` : "模型别名加载失败")).finally(() => setAliasLoading(false));
  }, []);
  const activeGateway = current || gateway;
  const base = activeGateway?.base_url || "http://127.0.0.1:8765/v1";
  const key = activeGateway?.key || "";
  const synthesisModels = models.filter((item) => item.operations.includes("synthesis"));
  const testableModels = apiTestModels(models);
  const selectedTestModel = testableModels.find((item) => item.gateway_id === testModel);
  const compatibleVoices = voices.filter((item) => voiceMatchesModel(item, selectedTestModel));
  const selectedTestVoice = compatibleVoices.find((item) => item.public_name === testVoice);
  const demoModel = synthesisModels.find((item) => item.mode === "demo");
  const demoVoice = voices.find((item) => voiceMatchesModel(item, demoModel));
  const streamFormat = selectedTestModel?.provider === "mimo" ? "pcm" : "mp3";
  const aliasMeta: Record<string, { label: string; description: string; tone: string }> = {
    "tts-default": { label: "通用默认", description: "日常使用的平衡选择", tone: "bg-sky-500" },
    "tts-fast": { label: "低延迟", description: "优先响应速度", tone: "bg-emerald-500" },
    "tts-hq": { label: "高质量", description: "优先声音细节", tone: "bg-violet-500" },
  };
  const modelGroups = testableModels.reduce<Record<string, typeof testableModels>>((groups, model) => {
    const provider = providerMeta[model.provider]?.label || model.provider;
    (groups[provider] ||= []).push(model);
    return groups;
  }, {});

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
    if (!testableModels.some((item) => item.gateway_id === testModel)) {
      setTestModel(testableModels[0]?.gateway_id || "");
    }
  }, [testModel, testableModels]);
  useEffect(() => {
    if (!compatibleVoices.some((item) => item.public_name === testVoice)) {
      setTestVoice(compatibleVoices[0]?.public_name || "");
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
      toast.success(`已复制${label}`);
    } catch {
      toast.error("复制失败，请手动选择复制");
    }
  };
  const rotate = async () => {
    if (!activeGateway?.managed) return;
    if (!(await confirm({ title: "轮换网关 Key？", description: "轮换后旧网关 Key 会立即失效，使用旧 Key 的客户端需要更新配置。", confirmLabel: "轮换", destructive: true }))) return;
    setRotating(true);
    try {
      const result = await api<{ key: string; key_hint: string; key_source: string; managed: boolean }>("/api/gateway/rotate", { method: "POST" });
      setCurrent({ ...activeGateway, key: result.key, key_hint: result.key_hint, key_source: result.key_source, managed: result.managed });
      setVisibleKey(true);
      toast.success("已生成新网关 Key", { description: "请同步更新使用旧 Key 的客户端。" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "轮换失败");
    } finally {
      setRotating(false);
    }
  };
  const saveAlias = async (alias: GatewayAlias) => {
    const modelId = aliasSelections[alias.alias] || alias.model_id;
    if (!modelId || modelId === alias.model_id) return;
    setAliasSaving(true);
    setAliasSavingName(alias.alias);
    try {
      const result = await api<{ aliases: GatewayAlias[] }>(`/api/gateway/aliases/${alias.alias}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model_id: modelId }),
      });
      setAliases(result.aliases);
      setAliasSelections(Object.fromEntries(result.aliases.map((item) => [item.alias, item.model_id])));
      setAliasMessage("");
      toast.success(`${alias.alias} 已保存`);
    } catch (error) { toast.error(error instanceof Error ? error.message : "保存失败"); }
    finally { setAliasSaving(false); setAliasSavingName(""); }
  };
  const resetAliases = async () => {
    if (!(await confirm({ title: "恢复默认别名？", description: "三个模型别名会恢复为默认指向。", confirmLabel: "恢复默认" }))) return;
    try {
      const result = await api<{ aliases: GatewayAlias[] }>("/api/gateway/aliases/reset", { method: "POST" });
      setAliases(result.aliases);
      setAliasSelections(Object.fromEntries(result.aliases.map((item) => [item.alias, item.model_id])));
      setAliasMessage("");
      toast.success("已恢复默认配置");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "恢复默认失败");
    }
  };
  const selectTestModel = (modelId: string) => {
    const nextModel = testableModels.find((item) => item.gateway_id === modelId);
    const nextVoice = voices.find((item) => voiceMatchesModel(item, nextModel));
    setTestModel(modelId);
    setTestVoice(nextVoice?.public_name || "");
  };
  const payload = {
    model: testModel,
    voice: testVoice,
    input: testText,
    response_format: testFormat,
  };
  const ps = [
    '$headers = @{ Authorization = "Bearer ' + key + '" }',
    "$body = @" + "{ model = \"" + payload.model + "\"; voice = \"" + payload.voice + "\"; input = " + JSON.stringify(payload.input) + "; response_format = \"" + payload.response_format + "\" } | ConvertTo-Json",
    `Invoke-WebRequest "${endpoint("audio/speech")}" -Headers $headers -Method Post -ContentType "application/json" -Body $body -OutFile voice.${testFormat}`,
  ].join("\n");
  const curl = [
    `curl "${endpoint("audio/speech")}" \u0060`,
    `  -H "Authorization: Bearer ${key}" \u0060`,
    `  -H "Content-Type: application/json" \u0060`,
    `  -d '${JSON.stringify(payload)}' \u0060`,
    `  --output voice.${testFormat}`,
  ].join("\n");
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

  const runSpeechTest = async (requestPayload: typeof payload, successMessage: string) => {
    if (!key) return setSpeechTest({ status: "error", message: "尚未读取网关 Key" });
    if (!testText.trim()) return setSpeechTest({ status: "error", message: "请输入测试文本" });
    setStreamTest({ status: "idle" });
    setSpeechTest({ status: "running" });
    const started = performance.now();
    try {
      const response = await fetch(endpoint("audio/speech"), {
        method: "POST",
        headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
        body: JSON.stringify(requestPayload),
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
        message: successMessage,
      });
      refreshStats().catch(() => undefined);
    } catch (error) {
      setSpeechTest({ status: "error", latency: Math.round(performance.now() - started), message: error instanceof Error ? error.message : "语音测试失败" });
    }
  };

  const testSpeech = async () => {
    if (!compatibleVoices.length) return setSpeechTest({ status: "error", message: "当前模型没有兼容音色，请先在音色库导入或克隆音色" });
    await runSpeechTest(payload, "厂商音频已返回");
  };

  const testOfflineDemo = async () => {
    if (!demoModel || !demoVoice) return setSpeechTest({ status: "error", message: "本地演示模型或音色不可用" });
    await runSpeechTest({
      ...payload,
      model: demoModel.gateway_id,
      voice: demoVoice.public_name,
    }, "本地演示音频已返回，未调用厂商接口");
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
    const audioParts: Uint8Array[] = [];
    let chunkCount = 0;
    let totalBytes = 0;
    let firstChunkLatency: number | undefined;
    let nativeStreaming = false;
    let jobId = "";
    let receivedFormat = streamFormat;
    let pcmInfo: PcmInfo | undefined;
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
        const data = JSON.parse(dataLines.join("\n")) as { audio?: string; job_id?: string; format?: string; native_streaming?: boolean; pcm?: PcmInfo; error?: { message?: string } };
        if (event === "error") throw new Error(data.error?.message || "流式语音生成失败");
        if (event === "audio" && data.audio) {
          if (firstChunkLatency === undefined) firstChunkLatency = Math.round(performance.now() - started);
          const binary = atob(data.audio);
          const bytes = new Uint8Array(binary.length);
          for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
          audioParts.push(bytes);
          chunkCount += 1;
          totalBytes += bytes.byteLength;
        }
        if (event === "done") {
          jobId = data.job_id || jobId;
          nativeStreaming = Boolean(data.native_streaming);
          if (data.format) receivedFormat = data.format;
          if (data.pcm) pcmInfo = data.pcm;
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
      const blob = receivedFormat === "pcm"
        ? pcmChunksToWavBlob(audioParts, pcmInfo || { sample_rate: 0, channels: 0, bit_depth: 0 })
        : new Blob(audioParts.map((part) => part.buffer as ArrayBuffer), {
            type: receivedFormat === "mp3" ? "audio/mpeg" : receivedFormat === "wav" ? "audio/wav" : "application/octet-stream",
          });
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
  const busy = speechTest.status === "running" || streamTest.status === "running";
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
    <section>
      <PageHeader
        title="API 网关"
        description="使用 OpenAI 兼容接口调用四家语音模型。外部应用只需要 Base URL 和网关 Key，厂商凭据始终留在本机后端。"
        actions={
          <Button variant="outline" onClick={() => void copy("连接信息", `${base}\nBearer ${key}`)}>
            <Copy />
            复制连接信息
          </Button>
        }
      />

      <div className="flex flex-col gap-6">
        <section aria-label="网关凭据与快速开始" className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(300px,360px)]">
          <div className="island flex min-w-0 flex-col gap-6 p-6 md:p-7">
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3">
                <h2 className="m-0 flex items-center gap-2 text-base font-semibold text-foreground">
                  <KeyRound className="size-4 text-brand" />
                  当前网关 Key
                </h2>
                <Badge className="rounded-full bg-emerald-50 px-2.5 font-medium text-emerald-700">
                  <span className="size-1.5 rounded-full bg-emerald-500" />
                  有效
                </Badge>
              </div>
              <div className="flex min-w-0 items-center gap-1 rounded-lg border bg-muted/50 py-1.5 pr-1.5 pl-4">
                <code translate="no" className="min-w-0 flex-1 truncate font-mono text-sm text-foreground" title={visibleKey ? key : undefined}>
                  {visibleKey ? key : (activeGateway?.key_hint || "未读取")}
                </code>
                <IconAction label={visibleKey ? "隐藏网关 Key" : "显示网关 Key"} onClick={() => setVisibleKey((value) => !value)}>
                  {visibleKey ? <EyeOff /> : <Eye />}
                </IconAction>
                <IconAction label="复制网关 Key" onClick={() => void copy("网关 Key", key)} disabled={!key}>
                  <Copy />
                </IconAction>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
                <span>来源：{activeGateway?.key_source || "本地配置"}</span>
                <Button variant="outline" size="sm" disabled={!activeGateway?.managed || rotating} onClick={() => void rotate()}>
                  <RotateCcw className={cn(rotating && "animate-spin")} />
                  {rotating ? "正在轮换" : "轮换网关 Key"}
                </Button>
              </div>
            </div>

            <div className="flex flex-col gap-3 border-t pt-6">
              <h3 className="m-0 flex items-center gap-2 text-sm font-semibold text-foreground">
                <Code2 className="size-4 text-brand" />
                快速开始
              </h3>
              <dl className="m-0 grid gap-3 md:grid-cols-2">
                <CopyField label="Base URL" value={base} onCopy={() => void copy("Base URL", base)} />
                <CopyField label="鉴权方式" value="Bearer $VOICE_STUDIO_API_KEY" />
              </dl>
              <p className="m-0 text-xs leading-relaxed text-muted-foreground">
                把 Base URL 填入支持 OpenAI 的客户端，并将当前网关 Key 作为 API Key。
              </p>
            </div>
          </div>

          <aside className="island flex min-w-0 flex-col gap-5 p-6 md:p-7">
            <div>
              <h2 className="m-0 text-base font-semibold text-foreground">网关访问凭据</h2>
              <p className="mt-1.5 mb-0 text-sm leading-relaxed text-muted-foreground">
                这枚密钥用于本机应用访问统一语音网关，不会替代已保存的厂商 API Key。
              </p>
            </div>
            <dl className="m-0 grid grid-cols-2 gap-3">
              <Fact label="监听范围" value="仅本机" />
              <Fact label="管理方式" value={activeGateway?.managed ? "应用托管" : "环境变量"} />
            </dl>
            <Note icon={<ShieldCheck />}>网关 Key 只应保存在受信任的本机应用中，不要放入公开网页、日志或源码仓库。</Note>
            <div className="flex flex-col gap-2">
              <span className="text-[13px] font-medium text-foreground">错误格式</span>
              <span className="text-xs text-muted-foreground">失败响应包含稳定错误码与可读消息。</span>
              <code className="block rounded-md bg-muted px-3 py-2 font-mono text-[11px] leading-relaxed break-all text-soft">
                {'{"detail":{"code":"INVALID_API_KEY","message":"..."}}'}
              </code>
            </div>
          </aside>
        </section>

        <section aria-labelledby="gateway-alias-title" className="island flex flex-col gap-5 p-6 md:p-7">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 id="gateway-alias-title" className="m-0 text-base font-semibold text-foreground">模型别名</h2>
              <p className="mt-1 mb-0 text-sm text-muted-foreground">让外部应用使用固定名称，同时可以在这里更换实际模型。</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => void resetAliases()} disabled={!aliases.length}>
              <RotateCcw />
              恢复默认配置
            </Button>
          </div>
          {aliasLoading && <EmptyHint icon={<RefreshCw className="animate-spin" />}>正在读取模型别名配置...</EmptyHint>}
          {!aliasLoading && !aliases.length && (
            <EmptyHint icon={<CircleHelp />}>{aliasMessage || "没有读取到别名配置，请重启 Voice Hub 后刷新页面。"}</EmptyHint>
          )}
          {aliases.length > 0 && (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {aliases.map((item) => {
                const meta = aliasMeta[item.alias];
                const selection = aliasSelections[item.alias] || item.model_id;
                const saving = aliasSaving && aliasSavingName === item.alias;
                return (
                  <article
                    key={item.alias}
                    className={cn("flex min-w-0 flex-col gap-4 rounded-lg border bg-card p-4", !item.valid && "border-destructive/40 bg-destructive/5")}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <span aria-hidden className={cn("size-2 shrink-0 rounded-full", meta?.tone ?? "bg-slate-400")} />
                        <code className="truncate font-mono text-sm font-semibold text-foreground">{item.alias}</code>
                      </div>
                      <Badge className={cn("rounded-full px-2 text-[11px]", item.valid ? "bg-muted text-muted-foreground" : "bg-destructive/10 text-destructive")}>
                        {item.valid ? "已配置" : "需检查"}
                      </Badge>
                    </div>
                    {meta && (
                      <div className="leading-tight">
                        <strong className="text-sm font-semibold text-foreground">{meta.label}</strong>
                        <span className="ml-2 text-xs text-muted-foreground">{meta.description}</span>
                      </div>
                    )}
                    <Field label="绑定实际模型" hint={<code className="font-mono break-all">{selection}</code>}>
                      <Select
                        value={selection}
                        onValueChange={(value) => setAliasSelections((current) => ({ ...current, [item.alias]: value }))}
                      >
                        <SelectTrigger aria-label={`${item.alias} 绑定模型`} translate="no" className="w-full">
                          <SelectValue placeholder="选择模型" />
                        </SelectTrigger>
                        <SelectContent position="popper">
                          <ModelOptions groups={modelGroups} />
                        </SelectContent>
                      </Select>
                    </Field>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-auto self-start"
                      disabled={aliasSaving || selection === item.model_id}
                      onClick={() => void saveAlias(item)}
                    >
                      {saving ? <RefreshCw className="animate-spin" /> : <Check />}
                      {saving ? "保存中" : "保存绑定"}
                    </Button>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <Tabs value={gatewayView} onValueChange={(value) => setGatewayView(value as GatewayView)} className="gap-5">
          <TabsList aria-label="网关页面" className="self-start">
            <TabsTrigger value="docs" className="px-4"><Code2 />接入文档</TabsTrigger>
            <TabsTrigger value="test" className="px-4"><FlaskConical />接口测试</TabsTrigger>
            <TabsTrigger value="stats" className="px-4"><Gauge />运行统计</TabsTrigger>
          </TabsList>

          <TabsContent value="docs" className="island overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b px-6 py-4">
              <h2 className="m-0 text-base font-semibold text-foreground">OpenAI 兼容接口</h2>
              <span className="text-xs text-muted-foreground">{endpointDocs.length} 个端点</span>
            </div>
            <ul className="m-0 list-none divide-y p-0">
              {endpointDocs.map((item) => {
                const expanded = openEndpoint === item.id;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      aria-expanded={expanded}
                      aria-controls={`gateway-endpoint-${item.id}`}
                      onClick={() => setOpenEndpoint(expanded ? "" : item.id)}
                      className="flex w-full items-center gap-3 px-6 py-4 text-left outline-none hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset"
                    >
                      <MethodBadge method={item.method} />
                      <code translate="no" className="shrink-0 font-mono text-sm font-medium text-foreground">{item.path}</code>
                      <span className="hidden min-w-0 flex-1 truncate text-sm text-muted-foreground md:block">{item.description}</span>
                      <ChevronRight className={cn("ml-auto size-4 shrink-0 text-muted-foreground transition-transform duration-200", expanded && "rotate-90")} />
                    </button>
                    {expanded && (
                      <div id={`gateway-endpoint-${item.id}`} className="grid gap-5 px-6 pb-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
                        <dl className="m-0 flex flex-col gap-3 text-sm">
                          <p className="m-0 text-muted-foreground md:hidden">{item.description}</p>
                          <DocRow label="请求" value={item.request} />
                          <DocRow label="响应" value={item.response} />
                          <DocRow label="注意" value={item.note} />
                        </dl>
                        <CodeBlock label="cURL" code={item.example} onCopy={() => void copy(` ${item.method} ${item.path} 示例`, item.example)} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </TabsContent>

          <TabsContent value="test" className="flex flex-col gap-6">
            <div className="island flex flex-col gap-6 p-6 md:p-7">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="m-0 text-base font-semibold text-foreground">接口测试台</h2>
                  <p className="mt-1 mb-0 text-sm text-muted-foreground">先测试模型发现，再用一小段文字确认网关、音色和厂商凭据都能正常工作。</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <span
                    aria-live="polite"
                    className={cn(
                      "text-xs",
                      catalogTest.status === "success" ? "text-success" : catalogTest.status === "error" ? "text-destructive" : "text-muted-foreground",
                    )}
                  >
                    {catalogLabel}
                  </span>
                  <Button variant="outline" size="sm" onClick={() => void testModels()} disabled={catalogTest.status === "running" || !key}>
                    <FlaskConical className={cn(catalogTest.status === "running" && "animate-pulse")} />
                    {catalogTest.status === "running" ? "测试中..." : "测试模型接口"}
                  </Button>
                </div>
              </div>

              <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
                <div className="flex min-w-0 flex-col gap-5">
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="模型" htmlFor="gateway-test-model" hint={<IdHint label="API ID" value={selectedTestModel?.gateway_id || "未选择模型"} />}>
                      <Select value={testModel} onValueChange={selectTestModel}>
                        <SelectTrigger id="gateway-test-model" translate="no" className="w-full">
                          <SelectValue placeholder="选择模型" />
                        </SelectTrigger>
                        <SelectContent position="popper">
                          {credentialProviderIds.map((provider) => {
                            const items = testableModels.filter((item) => item.provider === provider);
                            if (!items.length) return null;
                            return (
                              <SelectGroup key={provider}>
                                <SelectLabel>{providerMeta[provider].label}</SelectLabel>
                                {items.map((item) => (
                                  <SelectItem value={item.gateway_id} key={item.gateway_id}>{item.display_name}</SelectItem>
                                ))}
                              </SelectGroup>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="音色" htmlFor="gateway-test-voice" hint={<IdHint label="请求值" value={selectedTestVoice?.public_name || "未选择音色"} />}>
                      <Select value={testVoice} onValueChange={setTestVoice} disabled={!compatibleVoices.length}>
                        <SelectTrigger id="gateway-test-voice" translate="no" className="w-full">
                          <SelectValue placeholder="请先导入兼容音色" />
                        </SelectTrigger>
                        <SelectContent position="popper">
                          {compatibleVoices.map((item) => (
                            <SelectItem value={item.public_name} key={item.id}>
                              {item.display_name}
                              <span className="font-mono text-xs text-muted-foreground">{item.public_name}</span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                  </div>

                  <Field label="测试文本" htmlFor="gateway-test-text" aside={<span className="font-mono text-xs text-muted-foreground tabular-nums">{testText.length} / 500</span>}>
                    <Textarea
                      id="gateway-test-text"
                      value={testText}
                      onChange={(event) => setTestText(event.target.value)}
                      maxLength={500}
                      className="min-h-24 resize-y leading-7"
                    />
                  </Field>

                  <div className="flex flex-wrap items-center gap-3">
                    <ToggleGroup
                      type="single"
                      value={testFormat}
                      onValueChange={(value) => value && setTestFormat(value)}
                      aria-label="输出格式"
                      className="rounded-md bg-muted p-1"
                    >
                      {["mp3", "wav"].map((item) => (
                        <ToggleGroupItem value={item} key={item} className={segmentItem}>{item.toUpperCase()}</ToggleGroupItem>
                      ))}
                    </ToggleGroup>
                    <Button onClick={() => void testSpeech()} disabled={busy || !key || !testModel || !compatibleVoices.length}>
                      <Play fill="currentColor" className="size-3.5" />
                      {speechTest.status === "running" ? "生成中..." : "测试语音接口"}
                    </Button>
                    {streamTest.status === "running" ? (
                      <Button variant="outline" onClick={cancelStream}>
                        <X />
                        取消流式
                      </Button>
                    ) : (
                      <Button variant="outline" onClick={() => void testStream()} disabled={speechTest.status === "running" || !key || !testModel || !compatibleVoices.length}>
                        <Radio />
                        测试流式{selectedTestModel?.provider === "mimo" ? " · PCM" : ""}
                      </Button>
                    )}
                  </div>

                  {selectedTestModel && (
                    <div className="flex items-center gap-3 text-sm">
                      <ProviderMark provider={selectedTestModel.provider} />
                      <div className="min-w-0 leading-tight">
                        <div className="truncate font-medium text-foreground">{selectedTestModel.display_name}</div>
                        <div className="text-xs text-muted-foreground">厂商接口 · {compatibleVoices.length} 个兼容音色</div>
                      </div>
                    </div>
                  )}

                  <div className="flex flex-col gap-3 rounded-lg border border-dashed bg-muted/40 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <strong className="text-sm font-semibold text-foreground">本地离线诊断</strong>
                      <p className="mt-0.5 mb-0 text-xs text-muted-foreground">使用 demo/local-demo 检查网关和音频返回，不调用厂商接口。</p>
                    </div>
                    <Button variant="outline" size="sm" className="shrink-0 self-start sm:self-auto" onClick={() => void testOfflineDemo()} disabled={busy || !key || !demoModel || !demoVoice}>
                      <FlaskConical />
                      运行诊断
                    </Button>
                  </div>
                </div>

                <div className="flex min-w-0 flex-col gap-4 rounded-lg border bg-muted/30 p-5" aria-live="polite">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-foreground">响应结果</span>
                    <StatusBadge status={displayedTest.status}>{statusLabel(displayedTest)}</StatusBadge>
                  </div>
                  {speechTest.status === "idle" && streamTest.status === "idle" && (
                    <EmptyHint icon={<Radio />}>生成一段测试音频后，响应信息会显示在这里。</EmptyHint>
                  )}
                  {speechTest.status === "running" && <EmptyHint icon={<RefreshCw className="animate-spin" />}>正在请求 /v1/audio/speech...</EmptyHint>}
                  {speechTest.status === "error" && <ErrorHint>{speechTest.message}</ErrorHint>}
                  {speechTest.status === "success" && (
                    <>
                      <MetricGrid items={[["HTTP", speechTest.statusCode], ["延迟", `${speechTest.latency}ms`], ["大小", formatBytes(speechTest.size)]]} />
                      {testAudioUrl && (
                        <AudioPreview key={testAudioUrl} src={testAudioUrl} label="试听网关测试音频" downloadName={`gateway-test.${testFormat}`} />
                      )}
                      <DetailList
                        items={[
                          ["结果", speechTest.message],
                          ["Content-Type", speechTest.contentType],
                          ...(speechTest.jobId ? [["Job", speechTest.jobId] as const] : []),
                        ]}
                      />
                    </>
                  )}
                  {streamTest.status === "running" && <EmptyHint icon={<RefreshCw className="animate-spin" />}>正在读取 /v1/audio/speech/stream...</EmptyHint>}
                  {streamTest.status === "error" && <ErrorHint>{streamTest.message}</ErrorHint>}
                  {streamTest.status === "cancelled" && (
                    <>
                      <p className="m-0 flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
                        <X className="mt-0.5 size-4 shrink-0" />
                        {streamTest.message}
                      </p>
                      <MetricGrid
                        items={[
                          ["首片", streamTest.firstChunkLatency === undefined ? "--" : `${streamTest.firstChunkLatency}ms`],
                          ["取消耗时", `${streamTest.latency}ms`],
                          ["已收分片", streamTest.chunks || 0],
                          ["已收大小", formatBytes(streamTest.size)],
                        ]}
                      />
                    </>
                  )}
                  {streamTest.status === "success" && (
                    <>
                      <MetricGrid
                        items={[
                          ["首片", `${streamTest.firstChunkLatency}ms`],
                          ["总耗时", `${streamTest.latency}ms`],
                          ["分片", streamTest.chunks],
                          ["大小", formatBytes(streamTest.size)],
                        ]}
                      />
                      {streamAudioUrl && (
                        <div className="flex flex-col gap-1.5">
                          <AudioPreview
                            key={streamAudioUrl}
                            src={streamAudioUrl}
                            label="试听流式测试音频"
                            downloadName={`gateway-stream.${streamTest.format === "pcm" ? "wav" : streamTest.format || "mp3"}`}
                          />
                          {streamTest.format === "pcm" && <span className="text-xs text-muted-foreground">PCM 已封装为 WAV 供试听</span>}
                        </div>
                      )}
                      <DetailList
                        items={[
                          ["状态", streamTest.message],
                          ["格式", streamTest.format || "mp3"],
                          ["HTTP", streamTest.statusCode],
                          ...(streamTest.nativeStreaming !== undefined ? [["上游", streamTest.nativeStreaming ? "原生分片" : "网关兼容分片"] as const] : []),
                          ...(streamTest.jobId ? [["Job", streamTest.jobId] as const] : []),
                        ]}
                      />
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="island flex flex-col gap-4 p-6 md:p-7">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="m-0 text-base font-semibold text-foreground">当前请求示例</h2>
                  <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>model <code className="font-mono text-foreground">{payload.model || "未选择"}</code></span>
                    <span>voice <code className="font-mono text-foreground">{payload.voice || "未选择"}</code></span>
                  </div>
                </div>
              </div>
              <Tabs value={exampleTab} onValueChange={setExampleTab} className="gap-3">
                <div className="-mx-1 overflow-x-auto px-1">
                  <TabsList aria-label="示例语言">
                    {exampleTabs.map(([id, label]) => (
                      <TabsTrigger value={id} key={id} className="px-3">{label}</TabsTrigger>
                    ))}
                  </TabsList>
                </div>
                {exampleTabs.map(([id, label]) => (
                  <TabsContent value={id} key={id}>
                    <CodeBlock label={label} code={examples[id]} onCopy={() => void copy(` ${label} 示例`, examples[id])} />
                  </TabsContent>
                ))}
              </Tabs>
            </div>
          </TabsContent>

          <TabsContent value="stats" className="island flex flex-col gap-6 p-6 md:p-7">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="m-0 text-base font-semibold text-foreground">运行统计</h2>
                <p className="mt-1 mb-0 text-sm text-muted-foreground">仅统计本版本启用记录后的网关语音请求，不混入旧任务数据。</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <ToggleGroup
                  type="single"
                  value={statsWindow}
                  onValueChange={(value) => value && setStatsWindow(value)}
                  aria-label="统计时间范围"
                  className="rounded-md bg-muted p-1"
                >
                  {statsWindows.map(([id, label]) => (
                    <ToggleGroupItem value={id} key={id} className={segmentItem}>{label}</ToggleGroupItem>
                  ))}
                </ToggleGroup>
                <div className="flex items-center gap-2">
                <Select value={statsProvider || "all"} onValueChange={(value) => setStatsProvider(value === "all" ? "" : value)}>
                  <SelectTrigger aria-label="筛选统计来源" className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper" align="end">
                    <SelectItem value="all">全部来源</SelectItem>
                    {credentialProviderIds.map((id) => (
                      <SelectItem value={id} key={id}>{providerMeta[id].label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <IconAction label="刷新统计" onClick={() => void refreshStats()} disabled={statsLoading}>
                  <RefreshCw className={cn(statsLoading && "animate-spin")} />
                </IconAction>
                </div>
              </div>
            </div>

            {!stats && statsLoading ? (
              <EmptyHint icon={<RefreshCw className="animate-spin" />}>正在读取网关统计...</EmptyHint>
            ) : stats && stats.total_requests > 0 ? (
              <>
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5">
                  <StatCard label="请求" value={stats.total_requests} hint={`${stats.completed_requests} 成功 · ${stats.failed_requests} 失败`} />
                  <StatCard label="成功率" value={`${stats.success_rate}%`} hint={`${stats.sample_count} 个已记录样本`} />
                  <StatCard
                    label="首片 P50 / P95"
                    value={<>{formatLatency(stats.first_chunk_latency.p50)}{" "}<span className="text-muted-foreground">/</span>{" "}{formatLatency(stats.first_chunk_latency.p95)}</>}
                    hint={`${stats.first_chunk_latency.samples} 个流式样本`}
                  />
                  <StatCard
                    label="总耗时 P50 / P95"
                    value={<>{formatLatency(stats.total_latency.p50)}{" "}<span className="text-muted-foreground">/</span>{" "}{formatLatency(stats.total_latency.p95)}</>}
                    hint={`${stats.total_latency.samples} 个耗时样本`}
                  />
                  <StatCard label="取消" value={stats.cancelled_requests} hint="客户端主动中断" />
                </div>
                <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_260px]">
                  <div className="min-w-0 overflow-hidden rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="pl-4">维度</TableHead>
                          <TableHead className="text-right">请求</TableHead>
                          <TableHead className="text-right">成功率</TableHead>
                          <TableHead className="hidden text-right sm:table-cell">首片 P95</TableHead>
                          <TableHead className="pr-4 text-right">总耗时 P95</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody className="font-mono text-[13px] tabular-nums">
                        {stats.by_provider.map((item) => (
                          <StatsRow
                            key={`provider-${item.name}`}
                            name={statsProviderLabel(item.name)}
                            detail="来源"
                            emphasis
                            item={item}
                            formatLatency={formatLatency}
                          />
                        ))}
                        {stats.by_model.slice(0, 8).map((item) => (
                          <StatsRow
                            key={`model-${item.name}`}
                            name={item.name.split("/").pop() || item.name}
                            detail={`${statsProviderLabel(item.name.split("/")[0])} · 模型`}
                            item={item}
                            formatLatency={formatLatency}
                          />
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <div className="flex flex-col gap-3 rounded-lg border p-4">
                    <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                      <Activity className="size-4 text-brand" />
                      错误聚合
                    </div>
                    {stats.errors.length ? (
                      <ul className="m-0 flex list-none flex-col gap-2 p-0">
                        {stats.errors.slice(0, 6).map((item) => (
                          <li key={item.code} className="flex items-center justify-between gap-3 text-xs">
                            <code className="truncate font-mono text-destructive">{item.code}</code>
                            <strong className="font-mono tabular-nums text-foreground">{item.count}</strong>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span className="flex items-center gap-2 text-xs text-success">
                        <Check className="size-4" />
                        当前范围没有失败请求
                      </span>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <EmptyHint icon={<Gauge />}>当前范围还没有网关语音请求。完成一次接口测试后会开始显示统计。</EmptyHint>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </section>
  );
}

function IconAction({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={label} onClick={onClick} disabled={disabled}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function CopyField({ label, value, onCopy }: { label: string; value: string; onCopy?: () => void }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="m-0 flex min-w-0 items-center gap-1 rounded-md bg-muted px-3 py-1.5">
        <code translate="no" className="min-w-0 flex-1 truncate py-0.5 font-mono text-[13px] text-foreground" title={value}>{value}</code>
        {onCopy && (
          <IconAction label={`复制 ${label}`} onClick={onCopy}>
            <Copy />
          </IconAction>
        )}
      </dd>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted/60 px-3 py-2.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="m-0 mt-0.5 text-sm font-semibold text-foreground">{value}</dd>
    </div>
  );
}

function ModelOptions({ groups }: { groups: Record<string, { gateway_id: string; display_name: string }[]> }) {
  return (
    <>
      {Object.entries(groups).map(([provider, group]) => (
        <SelectGroup key={provider}>
          <SelectLabel>{provider}</SelectLabel>
          {group.map((model) => (
            <SelectItem value={model.gateway_id} key={model.gateway_id}>{model.display_name}</SelectItem>
          ))}
        </SelectGroup>
      ))}
    </>
  );
}

function MethodBadge({ method }: { method: string }) {
  return (
    <span
      className={cn(
        "inline-flex w-12 shrink-0 justify-center rounded-full py-0.5 font-mono text-[11px] font-semibold",
        method === "GET" ? "bg-emerald-50 text-emerald-700" : "bg-sky-50 text-sky-700",
      )}
    >
      {method}
    </span>
  );
}

function DocRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="m-0 mt-0.5 leading-relaxed text-soft">{value}</dd>
    </div>
  );
}

function CodeBlock({ label, code, onCopy }: { label: string; code: string; onCopy: () => void }) {
  return (
    <div className="min-w-0 overflow-hidden rounded-lg border bg-slate-950 text-slate-100">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 py-1.5 pr-1.5 pl-4">
        <span className="text-xs text-slate-400">{label}</span>
        <Button variant="ghost" size="xs" onClick={onCopy} className="text-slate-300 hover:bg-white/10 hover:text-white">
          <Copy />
          复制
        </Button>
      </div>
      <pre translate="no" className="m-0 max-h-80 overflow-auto p-4 font-mono text-xs leading-relaxed whitespace-pre">{code}</pre>
    </div>
  );
}

function IdHint({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span className="shrink-0">{label}</span>
      <code className="truncate font-mono text-foreground">{value}</code>
    </span>
  );
}

function StatusBadge({ status, children }: { status: GatewayTestResult["status"]; children: ReactNode }) {
  const tone = {
    idle: "bg-muted text-muted-foreground",
    running: "bg-accent text-accent-foreground",
    success: "bg-emerald-50 text-emerald-700",
    error: "bg-destructive/10 text-destructive",
    cancelled: "bg-amber-50 text-amber-700",
  }[status];
  const dot = {
    idle: "bg-slate-400",
    running: "bg-brand animate-pulse",
    success: "bg-emerald-500",
    error: "bg-destructive",
    cancelled: "bg-amber-500",
  }[status];
  return (
    <Badge className={cn("rounded-full px-2.5 font-medium", tone)}>
      <span className={cn("size-1.5 rounded-full", dot)} />
      {children}
    </Badge>
  );
}

function EmptyHint({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg px-4 py-8 text-center text-sm text-muted-foreground [&_svg]:size-5 [&_svg]:text-brand">
      {icon}
      <span>{children}</span>
    </div>
  );
}

function ErrorHint({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="m-0 flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2.5 text-sm break-words text-destructive">
      <CircleHelp className="mt-0.5 size-4 shrink-0" />
      <span className="min-w-0">{children}</span>
    </p>
  );
}

function MetricGrid({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className={cn("m-0 grid gap-2", items.length > 3 ? "grid-cols-2 sm:grid-cols-4 xl:grid-cols-2" : "grid-cols-3")}>
      {items.map(([label, value]) => (
        <div key={label} className="rounded-md bg-card px-3 py-2 ring-1 ring-border">
          <dt className="text-[11px] text-muted-foreground">{label}</dt>
          <dd className="m-0 font-mono text-sm font-semibold text-foreground tabular-nums">{value ?? "-"}</dd>
        </div>
      ))}
    </dl>
  );
}

function DetailList({ items }: { items: readonly (readonly [string, ReactNode])[] }) {
  return (
    <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-xs">
      {items.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="m-0 font-mono break-all text-foreground">{value ?? "-"}</dd>
        </div>
      ))}
    </dl>
  );
}

function StatCard({ label, value, hint }: { label: string; value: ReactNode; hint: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-lg border bg-card px-4 py-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <strong className="font-mono text-lg leading-snug font-semibold text-foreground tabular-nums">{value}</strong>
      <small className="truncate text-[11px] text-muted-foreground">{hint}</small>
    </div>
  );
}

type StatsEntry = GatewayStats["by_provider"][number];

function StatsRow({
  name,
  detail,
  item,
  emphasis,
  formatLatency,
}: {
  name: string;
  detail: string;
  item: StatsEntry;
  emphasis?: boolean;
  formatLatency: (value: number | null) => string;
}) {
  return (
    <TableRow className={cn(emphasis && "bg-muted/40")}>
      <TableCell className="w-full max-w-0 pl-4 font-sans">
        <div className="truncate text-[13px] font-medium text-foreground">{name}</div>
        <div className="text-[11px] text-muted-foreground">{detail}</div>
      </TableCell>
      <TableCell className="text-right">{item.requests}</TableCell>
      <TableCell className="text-right">{item.success_rate}%</TableCell>
      <TableCell className="hidden text-right sm:table-cell">{formatLatency(item.first_chunk_latency.p95)}</TableCell>
      <TableCell className="pr-4 text-right">{formatLatency(item.total_latency.p95)}</TableCell>
    </TableRow>
  );
}
