const HIT_SOUND_URL = new URL('../../hit.ogg', import.meta.url).href;
const FLICK_SOUND_URL = new URL('../../flick.ogg', import.meta.url).href;

export const SOUND_URLS: Record<string, string> = {
  'hit.ogg': HIT_SOUND_URL,
  'flick.ogg': FLICK_SOUND_URL,
};

export const getHitSoundVolume = (soundUrl: string, tapSoundVolume: number, flickSoundVolume: number) => (
  soundUrl === FLICK_SOUND_URL ? flickSoundVolume : tapSoundVolume
);

export interface MusicAudioGraph {
  context: AudioContext;
  source: MediaElementAudioSourceNode;
  gain: GainNode;
}

export const musicAudioGraphs = new WeakMap<HTMLAudioElement, MusicAudioGraph>();
