import { describe, expect, it } from "vitest";
import { computePeaks, formatTime, placeholderPeaks, resamplePeaks } from "./peaks";

describe("computePeaks", () => {
  it("takes the absolute peak of each bucket and normalizes to the loudest bar", () => {
    const samples = new Float32Array([0.1, -0.2, 0.05, 0.4, -0.8, 0.2]);
    expect(computePeaks(samples, 3)).toEqual([0.25, 0.5, 1]);
  });

  it("returns silent bars for silent or empty audio", () => {
    expect(computePeaks(new Float32Array(8), 4)).toEqual([0, 0, 0, 0]);
    expect(computePeaks(new Float32Array(0), 3)).toEqual([0, 0, 0]);
  });

  it("handles more bars than samples and invalid bar counts", () => {
    expect(computePeaks(new Float32Array([0.5, -1]), 4)).toEqual([0.5, 0.5, 1, 1]);
    expect(computePeaks(new Float32Array([1]), 0)).toEqual([]);
    expect(computePeaks(new Float32Array([1]), -2)).toEqual([]);
  });
});

describe("resamplePeaks", () => {
  it("keeps the maximum of each group when shrinking", () => {
    expect(resamplePeaks([0.1, 0.9, 0.3, 0.4], 2)).toEqual([0.9, 0.4]);
  });

  it("repeats values when growing and copies when sizes match", () => {
    expect(resamplePeaks([0.2, 1], 4)).toEqual([0.2, 0.2, 1, 1]);
    const source = [0.3, 0.6];
    const copy = resamplePeaks(source, 2);
    expect(copy).toEqual(source);
    expect(copy).not.toBe(source);
  });

  it("returns zeros for empty input", () => {
    expect(resamplePeaks([], 3)).toEqual([0, 0, 0]);
  });
});

describe("placeholderPeaks", () => {
  it("is deterministic and stays inside the drawable range", () => {
    const first = placeholderPeaks(64);
    expect(first).toEqual(placeholderPeaks(64));
    expect(first.every((value) => value >= 0.12 && value <= 1)).toBe(true);
  });
});

describe("formatTime", () => {
  it("formats minutes and hours", () => {
    expect(formatTime(0)).toBe("0:00");
    expect(formatTime(5.9)).toBe("0:05");
    expect(formatTime(65)).toBe("1:05");
    expect(formatTime(3725)).toBe("1:02:05");
  });

  it("treats invalid durations as zero", () => {
    expect(formatTime(Number.NaN)).toBe("0:00");
    expect(formatTime(Number.POSITIVE_INFINITY)).toBe("0:00");
    expect(formatTime(-3)).toBe("0:00");
  });
});
