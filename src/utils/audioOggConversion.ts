import encoderWorkerUrl from 'opus-recorder/dist/encoderWorker.min.js?url';

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
    const chunkLength = 4096;
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

        for (let start = 0; start < audioBuffer.length; start += chunkLength) {
          const end = Math.min(start + chunkLength, audioBuffer.length);
          const buffers = Array.from({ length: channelCount }, (_, channelIndex) => {
            const buffer = new Float32Array(chunkLength);
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
      encoderFrameSize: 20,
      encoderSampleRate: 48000,
      maxFramesPerPage: 40,
      numberOfChannels: channelCount,
      originalSampleRate: audioBuffer.sampleRate,
      resampleQuality: 3,
      streamPages: false,
      wavBitDepth: 16,
    });
  })
);

export const convertAudioFileToOgg = async (file: File) => {
  if (isOggAudioFile(file)) {
    return file;
  }

  const AudioContextConstructor = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextConstructor) {
    throw new Error('This browser does not support audio conversion.');
  }

  const audioContext = new AudioContextConstructor();

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
