export type PausableAudio = {
  pause: () => void;
};

export function createExclusiveAudioController() {
  let activeAudio: PausableAudio | null = null;

  return {
    activate(audio: PausableAudio) {
      if (activeAudio && activeAudio !== audio) activeAudio.pause();
      activeAudio = audio;
    },
    release(audio: PausableAudio) {
      if (activeAudio === audio) activeAudio = null;
    },
  };
}

// The global player bar, inline previews and history rows share one controller,
// so starting any of them pauses whatever else is playing.
export const appAudioController = createExclusiveAudioController();
