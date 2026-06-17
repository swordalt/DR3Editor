const OGG_DECODE_TARGET_SAMPLE_RATE = 44100;
const OGG_VORBIS_QUALITY = 0.4;
const oggConversionCache = new WeakMap<File, Promise<File>>();
let vorbisEncoderConstructorPromise: Promise<typeof import('vorbis-encoder-js').encoder> | null = null;

const getOggFileName = (file: File) => {
  const baseName = file.name.replace(/\.[^/.]+$/, '') || 'audio';
  return `${baseName}.ogg`;
};

export const isOggAudioFile = (file: File | null | undefined) => (
  Boolean(file && (file.type === 'audio/ogg' || /\.ogg$/i.test(file.name)))
);

const loadVorbisEncoderConstructor = () => {
  vorbisEncoderConstructorPromise ??= import('vorbis-encoder-js')
    .then(({ encoder }) => encoder);

  return vorbisEncoderConstructorPromise;
};

const encodeAudioBufferToOgg = async (audioBuffer: AudioBuffer) => {
  const channelCount = Math.min(2, audioBuffer.numberOfChannels);
  const VorbisEncoder = await loadVorbisEncoderConstructor();
  const encoder = new VorbisEncoder(
    audioBuffer.sampleRate,
    channelCount,
    OGG_VORBIS_QUALITY,
  );

  encoder.encodeFrom(audioBuffer);
  const oggBlob = encoder.finish('audio/ogg');
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
