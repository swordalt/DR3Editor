import encoderWorkerUrl from 'opus-recorder/dist/encoderWorker.min.js?url';

const OGG_ENCODER_SAMPLE_RATE = 48000;
const OGG_DECODE_TARGET_SAMPLE_RATE = 44100;
const OGG_ENCODER_FRAME_SIZE_MS = 60;
const OGG_ENCODER_COMPLEXITY = 0;
const OGG_RESAMPLE_QUALITY = 0;
const OGG_ENCODER_INPUT_CHUNK_LENGTH = 4096;
const oggConversionCache = new WeakMap<File, Promise<File>>();

const getOggFileName = (file: File) => {
  const baseName = file.name.replace(/\.[^/.]+$/, '') || 'audio';
  return `${baseName}.ogg`;
};

export const isOggAudioFile = (file: File | null | undefined) => (
  Boolean(file && (file.type === 'audio/ogg' || /\.ogg$/i.test(file.name)))
);

const encodeAudioBufferToOgg = (audioBuffer: AudioBuffer) => (
  new Promise<Blob>((resolve, reject) => {
    const worker = new Worker(encoderWorkerUrl);
    const chunks: Uint8Array[] = [];
    const channelCount = Math.min(2, audioBuffer.numberOfChannels);
    let isSettled = false;

    const settle = (callback: () => void) => {
      if (isSettled) return;
      isSettled = true;
      worker.terminate();
      callback();
    };

    worker.onerror = (event) => {
      settle(() => reject(new Error(event.message || 'OGG encoder worker failed.')));
    };

    worker.onmessage = (event: MessageEvent<{ message: string; page?: Uint8Array }>) => {
      const { message, page } = event.data;

      if (message === 'ready') {
        worker.postMessage({ command: 'getHeaderPages' });

        for (let start = 0; start < audioBuffer.length; start += OGG_ENCODER_INPUT_CHUNK_LENGTH) {
          const end = Math.min(start + OGG_ENCODER_INPUT_CHUNK_LENGTH, audioBuffer.length);
          const buffers = Array.from({ length: channelCount }, (_, channelIndex) => {
            const buffer = new Float32Array(OGG_ENCODER_INPUT_CHUNK_LENGTH);
            buffer.set(audioBuffer.getChannelData(channelIndex).subarray(start, end));
            return buffer;
          });

          worker.postMessage(
            { command: 'encode', buffers },
            buffers.map(buffer => buffer.buffer),
          );
        }

        worker.postMessage({ command: 'done' });
        return;
      }

      if (message === 'page' && page) {
        chunks.push(page);
        return;
      }

      if (message === 'done') {
        settle(() => resolve(new Blob(chunks, { type: 'audio/ogg' })));
      }
    };

    worker.postMessage({
      command: 'init',
      encoderApplication: 2049,
      encoderComplexity: OGG_ENCODER_COMPLEXITY,
      encoderFrameSize: OGG_ENCODER_FRAME_SIZE_MS,
      encoderSampleRate: OGG_ENCODER_SAMPLE_RATE,
      maxFramesPerPage: 40,
      numberOfChannels: channelCount,
      originalSampleRate: audioBuffer.sampleRate,
      resampleQuality: OGG_RESAMPLE_QUALITY,
      streamPages: false,
      wavBitDepth: 16,
    });
  })
);

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
