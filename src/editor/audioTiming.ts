export interface AudioTimingCorrection {
  mediaStartTime: number;
  effectiveDuration: number | null;
  isMediaClockReliable: boolean;
}

export const DEFAULT_AUDIO_TIMING_CORRECTION: AudioTimingCorrection = {
  mediaStartTime: 0,
  effectiveDuration: null,
  isMediaClockReliable: true,
};

interface Mp3GaplessInfo {
  rawDuration: number;
  trimmedDuration: number;
  encoderDelay: number;
  encoderPadding: number;
  sampleRate: number;
}

const MP3_TIMING_CORRECTION_THRESHOLD_SECONDS = 0.005;

const MPEG_SAMPLE_RATES: Record<number, number[]> = {
  0: [44100, 48000, 32000],
  2: [22050, 24000, 16000],
  3: [11025, 12000, 8000],
};

const MPEG1_LAYER3_BITRATES = [
  0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320,
];

const MPEG2_LAYER3_BITRATES = [
  0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160,
];

const readAscii = (bytes: Uint8Array, offset: number, length: number) => {
  if (offset < 0 || offset + length > bytes.length) {
    return '';
  }

  let value = '';
  for (let index = 0; index < length; index += 1) {
    value += String.fromCharCode(bytes[offset + index]);
  }
  return value;
};

const readSynchsafeInteger = (bytes: Uint8Array, offset: number) => (
  ((bytes[offset] & 0x7f) << 21)
  | ((bytes[offset + 1] & 0x7f) << 14)
  | ((bytes[offset + 2] & 0x7f) << 7)
  | (bytes[offset + 3] & 0x7f)
);

const getId3v2Size = (bytes: Uint8Array) => {
  if (bytes.length < 10 || readAscii(bytes, 0, 3) !== 'ID3') {
    return 0;
  }

  return 10 + readSynchsafeInteger(bytes, 6);
};

const readUint32 = (bytes: Uint8Array, offset: number) => (
  offset + 4 <= bytes.length
    ? ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0
    : 0
);

const getMp3GaplessInfo = (bytes: Uint8Array): Mp3GaplessInfo | null => {
  let offset = getId3v2Size(bytes);

  while (offset + 4 < bytes.length) {
    if (bytes[offset] !== 0xff || (bytes[offset + 1] & 0xe0) !== 0xe0) {
      offset += 1;
      continue;
    }

    const versionBits = (bytes[offset + 1] >> 3) & 0x03;
    const layerBits = (bytes[offset + 1] >> 1) & 0x03;
    const bitrateIndex = (bytes[offset + 2] >> 4) & 0x0f;
    const sampleRateIndex = (bytes[offset + 2] >> 2) & 0x03;
    const padding = (bytes[offset + 2] >> 1) & 0x01;

    if (
      versionBits === 1
      || layerBits !== 1
      || bitrateIndex === 0
      || bitrateIndex === 15
      || sampleRateIndex === 3
    ) {
      offset += 1;
      continue;
    }

    const sampleRateKey = versionBits === 3 ? 0 : versionBits;
    const sampleRate = MPEG_SAMPLE_RATES[sampleRateKey]?.[sampleRateIndex];
    if (!sampleRate) {
      return null;
    }

    const isMpeg1 = versionBits === 3;
    const channelMode = (bytes[offset + 3] >> 6) & 0x03;
    const sideInfoSize = isMpeg1
      ? (channelMode === 3 ? 17 : 32)
      : (channelMode === 3 ? 9 : 17);
    const xingOffset = offset + 4 + sideInfoSize;
    const xingTag = readAscii(bytes, xingOffset, 4);
    if (xingTag !== 'Xing' && xingTag !== 'Info') {
      return null;
    }

    const flags = readUint32(bytes, xingOffset + 4);
    if ((flags & 0x01) === 0) {
      return null;
    }

    const frameCount = readUint32(bytes, xingOffset + 8);
    if (frameCount <= 0) {
      return null;
    }

    const lameOffset = xingOffset + 0x78;
    const lameTag = readAscii(bytes, lameOffset, 4);
    if (!lameTag.startsWith('LAME') && !lameTag.startsWith('Lavc')) {
      return null;
    }

    const delayPaddingOffset = xingOffset + 0x8d;
    if (delayPaddingOffset + 3 > bytes.length) {
      return null;
    }

    const delayPadding = (bytes[delayPaddingOffset] << 16)
      | (bytes[delayPaddingOffset + 1] << 8)
      | bytes[delayPaddingOffset + 2];
    const encoderDelay = (delayPadding >> 12) & 0x0fff;
    const encoderPadding = delayPadding & 0x0fff;
    if (encoderDelay <= 0 && encoderPadding <= 0) {
      return null;
    }

    const samplesPerFrame = isMpeg1 ? 1152 : 576;
    const rawSamples = frameCount * samplesPerFrame;
    const trimmedSamples = rawSamples - encoderDelay - encoderPadding;
    if (trimmedSamples <= 0) {
      return null;
    }

    const bitrate = (isMpeg1 ? MPEG1_LAYER3_BITRATES[bitrateIndex] : MPEG2_LAYER3_BITRATES[bitrateIndex]) * 1000;
    const frameSize = Math.floor((isMpeg1 ? 144 : 72) * bitrate / sampleRate) + padding;
    const headerFrameSamples = samplesPerFrame;
    const rawDuration = (rawSamples + headerFrameSamples) / sampleRate;

    if (frameSize <= 0) {
      return null;
    }

    return {
      rawDuration,
      trimmedDuration: trimmedSamples / sampleRate,
      encoderDelay,
      encoderPadding,
      sampleRate,
    };
  }

  return null;
};

export const isMp3AudioFile = (file: File) => (
  file.type === 'audio/mpeg'
  || file.type === 'audio/mp3'
  || file.name.toLowerCase().endsWith('.mp3')
);

export const getInitialAudioTimingCorrection = (file: File | null): AudioTimingCorrection => (
  file && isMp3AudioFile(file)
    ? { ...DEFAULT_AUDIO_TIMING_CORRECTION, isMediaClockReliable: false }
    : DEFAULT_AUDIO_TIMING_CORRECTION
);

export const readAudioTimingCorrection = async (
  file: File | null,
  mediaDuration: number,
): Promise<AudioTimingCorrection> => {
  if (!file || !Number.isFinite(mediaDuration) || mediaDuration <= 0) {
    return DEFAULT_AUDIO_TIMING_CORRECTION;
  }

  if (!isMp3AudioFile(file)) {
    return DEFAULT_AUDIO_TIMING_CORRECTION;
  }

  const mp3TimingCorrection = getInitialAudioTimingCorrection(file);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const gaplessInfo = getMp3GaplessInfo(bytes);
  if (!gaplessInfo) {
    return mp3TimingCorrection;
  }

  const loadedDurationIncludesPadding = mediaDuration - gaplessInfo.trimmedDuration
    > MP3_TIMING_CORRECTION_THRESHOLD_SECONDS;
  if (!loadedDurationIncludesPadding) {
    return mp3TimingCorrection;
  }

  return {
    mediaStartTime: gaplessInfo.encoderDelay / gaplessInfo.sampleRate,
    effectiveDuration: gaplessInfo.trimmedDuration,
    isMediaClockReliable: false,
  };
};

export const getCorrectedAudioDuration = (
  mediaDuration: number,
  correction: AudioTimingCorrection,
) => (
  correction.effectiveDuration !== null
    ? correction.effectiveDuration
    : mediaDuration
);

export const getMediaTimeFromPlaybackTime = (
  playbackTime: number,
  offsetInSeconds: number,
  correction: AudioTimingCorrection,
) => Math.max(0, playbackTime - offsetInSeconds + correction.mediaStartTime);

export const getPlaybackTimeFromMediaTime = (
  mediaTime: number,
  offsetInSeconds: number,
  correction: AudioTimingCorrection,
) => Math.max(0, mediaTime - correction.mediaStartTime + offsetInSeconds);
