import { createEncoder } from 'wasm-media-encoders';
import oggEncoderWasmUrl from 'wasm-media-encoders/wasm/ogg.wasm?url';

const OGG_DECODE_TARGET_SAMPLE_RATE = 44100;
const OGG_VORBIS_VBR_QUALITY = 4;
const OGG_ENCODER_CHUNK_SIZE = 4096;
const OGG_ENCODER_CHUNKS_PER_YIELD = 16;
const oggConversionCache = new WeakMap<File, Promise<File>>();
let oggEncoderModule: WebAssembly.Module | null = null;

const getOggFileName = (file: File) => {
  const baseName = file.name.replace(/\.[^/.]+$/, '') || 'audio';
  return `${baseName}.ogg`;
};

export const isOggAudioFile = (file: File | null | undefined) => (
  Boolean(file && (file.type === 'audio/ogg' || /\.ogg$/i.test(file.name)))
);

const createOggEncoder = () => (
  createEncoder('audio/ogg', oggEncoderModule ?? oggEncoderWasmUrl, (module) => {
    oggEncoderModule = module;
  })
);

const yieldToMainThread = () => new Promise<void>(resolve => {
  window.setTimeout(resolve, 0);
});

const encodeAudioBufferToOgg = async (audioBuffer: AudioBuffer) => {
  const channelCount = Math.min(2, audioBuffer.numberOfChannels);
  const encoder = await createOggEncoder();
  encoder.configure({
    sampleRate: audioBuffer.sampleRate,
    channels: channelCount as 1 | 2,
    vbrQuality: OGG_VORBIS_VBR_QUALITY,
  });

  const oggChunks: Uint8Array[] = [];
  const audioLength = audioBuffer.length;
  let encodedChunkCount = 0;
  for (let start = 0; start < audioLength; start += OGG_ENCODER_CHUNK_SIZE) {
    const end = Math.min(start + OGG_ENCODER_CHUNK_SIZE, audioLength);
    const samples = Array.from({ length: channelCount }, (_, channelIndex) => (
      audioBuffer.getChannelData(channelIndex).slice(start, end)
    ));
    const encodedChunk = encoder.encode(samples);
    if (encodedChunk.length > 0) {
      oggChunks.push(encodedChunk.slice());
    }

    encodedChunkCount += 1;
    if (encodedChunkCount % OGG_ENCODER_CHUNKS_PER_YIELD === 0) {
      await yieldToMainThread();
    }
  }

  const finalChunk = encoder.finalize();
  if (finalChunk.length > 0) {
    oggChunks.push(finalChunk.slice());
  }

  const oggBlob = new Blob(oggChunks, { type: 'audio/ogg' });
  if (oggBlob.size === 0) {
    throw new Error('OGG encoder returned an empty file.');
  }

  return oggBlob;
};

const createAudioContextForOggEncoding = (AudioContextConstructor: typeof AudioContext) => {
  try {
    return new AudioContextConstructor({ sampleRate: OGG_DECODE_TARGET_SAMPLE_RATE });
  } catch {
    return new AudioContextConstructor();
  }
};

const convertAudioFileToOggUncached = async (file: File) => {
  const AudioContextConstructor = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextConstructor) {
    throw new Error('This browser does not support audio conversion.');
  }

  const audioContext = createAudioContextForOggEncoding(AudioContextConstructor);

  try {
    const audioBuffer = await audioContext.decodeAudioData(await file.arrayBuffer());
    const oggBlob = await encodeAudioBufferToOgg(audioBuffer);

    return new File([oggBlob], getOggFileName(file), {
      type: 'audio/ogg',
      lastModified: Date.now(),
    });
  } finally {
    await audioContext.close().catch(() => undefined);
  }
};

export const convertAudioFileToOgg = async (file: File) => {
  if (isOggAudioFile(file)) {
    return file;
  }

  const cachedConversion = oggConversionCache.get(file);
  if (cachedConversion) {
    return cachedConversion;
  }

  const conversion = convertAudioFileToOggUncached(file).catch((error) => {
    oggConversionCache.delete(file);
    throw error;
  });

  oggConversionCache.set(file, conversion);
  return conversion;
};
