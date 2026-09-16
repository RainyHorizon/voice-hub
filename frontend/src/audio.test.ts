import { describe, expect, it } from "vitest";
import { pcmChunksToWavBlob } from "./audio";

describe("pcmChunksToWavBlob", () => {
  it("adds a playable WAV header around PCM chunks", async () => {
    const blob = pcmChunksToWavBlob(
      [new Uint8Array([1, 2]), new Uint8Array([3, 4])],
      { encoding: "s16le", sample_rate: 24000, channels: 1, bit_depth: 16 },
    );
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(blob.type).toBe("audio/wav");
    expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe("RIFF");
    expect(new TextDecoder().decode(bytes.slice(8, 12))).toBe("WAVE");
    expect(Array.from(bytes.slice(44))).toEqual([1, 2, 3, 4]);
    expect(new DataView(bytes.buffer).getUint32(24, true)).toBe(24000);
  });
});
