import type { Model, Voice } from "./types";

export const providerMeta: Record<
  string,
  { label: string; mark: string; tone: string }
> = {
  demo: { label: "离线测试", mark: "D", tone: "gray" },
  dashscope: { label: "通义千问", mark: "Q", tone: "gold" },
  volcengine: { label: "火山引擎", mark: "V", tone: "red" },
  minimax: { label: "MiniMax", mark: "M", tone: "mint" },
  mimo: { label: "小米 MiMo", mark: "米", tone: "blue" },
};

export const credentialProviderIds = ["dashscope", "volcengine", "minimax", "mimo"];

export const apiTestModels = (models: Model[]) =>
  models.filter(
    (item) => item.mode !== "demo" && item.operations.includes("synthesis"),
  );

export const sample =
  "夜色落在城市边缘，远处的灯一盏一盏亮起来。把这段文字交给不同的声音，听见同一句话里的不同质感。";

export const voiceMatchesModel = (voice?: Voice, model?: Model) =>
  Boolean(
    voice &&
      model &&
      voice.provider === model.provider &&
      (model.mode === "demo" ||
        model.provider === "minimax" ||
        voice.model_id === model.model_id),
  );

export function formatBytes(bytes: number) {
  if (bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes < 1024 * 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  return `${(bytes / 1024 / 1024 / 1024 / 1024).toFixed(2)} TB`;
}

export function titleFor(active: string) {
  return (
    {
      synthesize: "语音合成",
      voices: "音色库",
      clone: "语音克隆",
      design: "语音设计",
      gateway: "OpenAI 兼容网关",
      history: "任务历史",
      settings: "设置",
    } as Record<string, string>
  )[active];
}
