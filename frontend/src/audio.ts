export type PcmInfo = {
  sample_rate: number;
  channels: number;
  bit_depth: number;
  encoding?: string;
};

const writeAscii = (view: DataView, offset: number, value: string) => {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
};

export function pcmChunksToWavBlob(chunks: readonly Uint8Array[], info: PcmInfo): Blob {
  const sampleRate = Number(info.sample_rate);
  const channels = Number(info.channels);
  const bitDepth = Number(info.bit_depth);
  if (
    (info.encoding && info.encoding !== "s16le") ||
    !Number.isInteger(sampleRate) || sampleRate <= 0 ||
    !Number.isInteger(channels) || channels <= 0 ||
    !Number.isInteger(bitDepth) || bitDepth <= 0 || bitDepth % 8 !== 0
  ) {
    throw new Error("网关返回的 PCM 音频参数无效");
  }
  const dataSize = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  const wav = new Uint8Array(44 + dataSize);
  const view = new DataView(wav.buffer);
  const blockAlign = channels * (bitDepth / 8);
  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataSize, true);
  let offset = 44;
  for (const chunk of chunks) {
    wav.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new Blob([wav.buffer], { type: "audio/wav" });
}
