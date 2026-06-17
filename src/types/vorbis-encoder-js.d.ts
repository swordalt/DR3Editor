declare module 'vorbis-encoder-js' {
  interface VorbisEncoderInstance {
    encodeFrom(audioBuffer: AudioBuffer): void;
    encode(buffers: Float32Array[]): void;
    finish(mimeType?: string): Blob;
    cancel(): Uint8Array[];
    cleanup(): Uint8Array[];
  }

  export const encoder: {
    new(
      sampleRate: number,
      numberOfChannels: number,
      quality: number,
      tags?: Record<string, string | number>,
    ): VorbisEncoderInstance;
  };
}
