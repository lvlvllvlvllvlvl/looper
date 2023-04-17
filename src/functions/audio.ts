import { Essentia } from "essentia-webworker";

const essentia = new Essentia();

const audioCtx = new AudioContext({ sampleRate: 44100 });

export const decodeAudio = async (
  buf: ArrayBuffer,
  setStatus: (status: string) => void = () => {}
) => {
  setStatus("decoding");
  const decoded = await audioCtx.decodeAudioData(buf);

  let channels = Array.from(Array(decoded.numberOfChannels).keys()).map(
    decoded.getChannelData
  );

  if (decoded.sampleRate !== audioCtx.sampleRate) {
    setStatus("resampling");
    const outSize =
      (channels[0].length * audioCtx.sampleRate) / decoded.sampleRate;
    channels = await Promise.all(
      channels.map(async (data) => {
        return await essentia.ResampleFFT(
          data,
          data.length - (data.length % 2),
          outSize - (outSize % 2)
        );
      })
    );
  }

  let mono = channels[0];
  if (decoded.numberOfChannels > 1) {
    setStatus("mixing");
    mono = await essentia.MonoMixer(...channels);
  }
  return { channels, mono };
};

const RMS = (data: Float32Array) =>
  Math.sqrt(data.map((v) => v * v).reduce((l, r) => l + r) / data.length);

export const toRms = (data: Float32Array, resultSize: number) => {
  const bucketSize = data.length / resultSize;
  const result = new Float32Array(resultSize);
  result.set(
    Array.from(Array(resultSize).keys()).map((i) =>
      RMS(data.slice(bucketSize * i, bucketSize * (i + 1)))
    )
  );
  return result;
};

export const { RhythmExtractor2013 } = essentia;
