import { describe, expect, it } from "vitest";
import type { Model, Voice } from "./types";
import { formatBytes, titleFor, voiceMatchesModel } from "./utils";

const model = (provider: string, modelId: string): Model => ({
  provider,
  model_id: modelId,
  gateway_id: `${provider}/${modelId}`,
  display_name: modelId,
  quality: "test",
  latency: "test",
  supports_clone: false,
  mode: "provider",
  operations: ["synthesis"],
});

const voice = (provider: string, modelId: string): Voice => ({
  id: "voice-test",
  provider,
  model_id: modelId,
  display_name: "Test Voice",
  public_name: "test-voice",
  voice_type: "preset",
  status: "active",
  languages: ["zh-CN"],
});

describe("voiceMatchesModel", () => {
  it("matches a voice bound to the same provider and model", () => {
    expect(voiceMatchesModel(voice("mimo", "mimo-v2.5-tts"), model("mimo", "mimo-v2.5-tts"))).toBe(true);
  });

  it("allows MiniMax voices across MiniMax synthesis models", () => {
    expect(voiceMatchesModel(voice("minimax", "speech-02-hd"), model("minimax", "speech-2.8-hd"))).toBe(true);
  });

  it("rejects a voice from another provider", () => {
    expect(voiceMatchesModel(voice("dashscope", "qwen3-tts-flash"), model("mimo", "mimo-v2.5-tts"))).toBe(false);
  });
});

describe("formatting helpers", () => {
  it("formats byte values at useful boundaries", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(2 * 1024 * 1024)).toBe("2.0 MB");
  });

  it("maps workspace ids to page titles", () => {
    expect(titleFor("gateway")).toBe("OpenAI 兼容网关");
  });
});
