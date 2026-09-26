import { describe, expect, it } from "vitest";
import { pcmChunksToWavBlob } from "./audio";
import { createExclusiveAudioController } from "./audioPlayback";

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

describe("createExclusiveAudioController", () => {
  it("pauses the previous audio when another audio becomes active", () => {
    const controller = createExclusiveAudioController();
    const first = { pause: () => { firstPaused = true; } };
    const second = { pause: () => { secondPaused = true; } };
    let firstPaused = false;
    let secondPaused = false;

    controller.activate(first);
    controller.activate(second);

    expect(firstPaused).toBe(true);
    expect(secondPaused).toBe(false);
  });

  it("does not pause an audio when it is activated again", () => {
    const controller = createExclusiveAudioController();
    let pauseCount = 0;
    const audio = { pause: () => { pauseCount += 1; } };

    controller.activate(audio);
    controller.activate(audio);

    expect(pauseCount).toBe(0);
  });
});
